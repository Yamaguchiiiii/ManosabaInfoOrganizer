# スマホ対応UI 設計指示書（コンポーネント構造・状態管理・エッジケース）

最終更新: 2026-07-03
状態: 設計のみ・未実装。`docs/implement_function/ui.md` のトークン/共通コンポーネント（P0/P1）を土台に実装する。
CLAUDE.md 規約の再確認: **モバイルファースト**・タップターゲット44px以上・hover非依存・プラットフォームAPIは services/ 経由。

---

## 1. 全体方針

- **同一コードベース・レイアウト分岐**: ルーティングやデータ層は共通のまま、`useViewport()` フック（新規 `src/hooks/useViewport.ts`、`matchMedia` 購読で `'mobile' | 'tablet' | 'desktop'` を返す。境界: `<768px` mobile / `<1100px` tablet / それ以上 desktop）で**レイアウトコンポーネントだけ**を出し分ける。ビジネスロジックはカスタムフックに集約しデスクトップと共用（CLAUDE.md 規約）。
- **ナビゲーションは下部固定タブバー**（親指到達域）。上部は薄いアプリバーのみ。ツール類は**ボトムシート**に集約し、キャンバス/マップの表示面積を最大化する。
- Konva Stage はタッチイベント対応済み（konva が touch→pointer を吸収）だが、**ピンチズーム/2本指パン**は明示実装が必要。ブラウザ既定のダブルタップズームは `touch-action: none`（キャンバス領域のみ）で抑止する。
- 4ペイン表示はスマホでは行わない。**1ペイン + フロア切替セグメント**が基本（Create/Animate/Note すべて）。

## 2. 画面レイアウト方針

```
┌─────────────────────┐
│ MobileAppBar (44px)             │ タイトル+文脈アクション+保存状態
├─────────────────────┤
│                     │
│    コンテンツ（キャンバス/マップ）      │ 全面。セーフエリア考慮
│                     │
│  [FloorSegment] （マップ系のみ上部重畳）│
├─────────────────────┤
│ （ビュー固有バー: 再生バー/ツールバー）    │ 48px。タブバーの直上
├─────────────────────┤
│ BottomTabBar (56px+safe-area)   │ Create / Animate / Note
└─────────────────────┘
```

- **BottomTabBar**: 3タブ+「…」(ヘルプ/設定シート)。`env(safe-area-inset-bottom)` をpadding に加算。タブ切替は既存の `runNavigationGuard()`（未保存経路の確認）を必ず通す。
- **編集系の詳細UI（経路エディタ・オブジェクトプロパティ・画像一覧）は `BottomSheet`**（half/full の2スナップ+ドラッグハンドル）。ダイアログ(DialogHost)は全プラットフォーム共通のまま。
- 横持ち（landscape）: タブバーを左端の縦レールに切替（`orientation: landscape` かつ mobile のとき）。キャンバスの縦領域を確保する。

## 3. コンポーネント階層ツリーと State / Props 定義

凡例: `state:` はそのコンポーネント内部の useState/useRef。`props:` は親から受け取るもの。store 直読みは「store:」と記す。既存コンポーネントは（既存）と付記。

- **`<App>`**（既存・改修）
  - state: `selectedIcons: string[]`（※後述の通り store 移管を推奨）, `isTransitioning: boolean`
  - store: `mode`, `_hasHydrated`
  - 分岐: `useViewport()` が mobile のとき `<MobileShell>`、それ以外は従来レイアウト
  - **`<MobileShell>`**（新規）
    - props: なし（store 直結）/ state: `moreSheetOpen: boolean`
    - **`<MobileAppBar>`**（新規）
      - props: `title: string`（例「Create」「事件ノート / Episode 1」）, `actions: ReactNode`（ビュー固有: 💀トグル等）, `saveStatus: 'saved' | 'saving'`
      - state: なし（純描画）
    - **`<ViewSwitch>`**（新規・純粋分岐）
      - store: `mode`
      - **`<CreateViewMobile>`**（新規。ロジックは `useRouteEditor()` に抽出して既存 CreateView と共用）
        - state: `sheetSnap: 'peek' | 'half' | 'full'`, `pickerOpen: boolean`（キャラ選択シート）
        - store: `activeFloor`, `nodes`, `edges`, `presets`, `activePresetId`, `isSkullMode`
        - hook: `useRouteEditor(selectedChar)` → `{ waypoints, syncConstraints, startRef, isEditing, savedPathData, handlers... }`（CreateView.tsx の該当ロジックを移すだけ。**新規実装しない**）
        - **`<FloorSegment>`**（新規・共用）
          - props: `value: FloorId`, `onChange: (f: FloorId) => void`, `disabled?: boolean`
        - **`<TouchMapStage>`**（新規・共用: ReadOnlyMapView/FloorPane のタッチ版ラッパ）
          - props: `floorId`, `children`（Konvaノード）, `onNodeTap: (nodeId) => void`, `interactive: boolean`
          - state: `scale: number`, `offset: {x,y}`, `gesture: 'none' | 'pan' | 'pinch'`（ref）
          - 責務: ピンチズーム(0.5〜3x)・1本指パン（interactive=false時）/ 1本指タップ=ノード選択。`touch-action: none`
        - **`<CharacterStrip>`**（新規・共用）
          - props: `icons: string[]`, `selected: string[]`, `deadIcons: string[]`, `doneIcons: string[]`, `onSelect(icon, multi)`, `skullMode?: boolean`
          - state: なし（横スクロールは CSS `overflow-x`）。各アイコン44px
        - **`<RouteEditorSheet>`**（新規、`BottomSheet` 上に構築）
          - props: `useRouteEditor` の返り値一式, `snap`, `onSnapChange`
          - state: `activeWaypointIndex: number | null`（地点候補リスト表示中の対象）
          - 内包: `<WaypointList>`（Start/経由地/Goal の行+⏱ボタン）, `<NodeCandidateList>`（SuggestionSidebar のリスト部を共通化）, `<SyncChipList>`, Save/Delete ボタン行
      - **`<AnimateViewMobile>`**（新規）
        - state: `floor: AnimFloorId`（表示フロア。**自動追尾**: 再生中に注目キャラが階層移動したら追従するオプション `followChar: string | null`）
        - store: `presets`, `activePresetId` / playbackStore: `isPlaying`, `currentTime`, `playbackSpeed`
        - hook: `useAnimationPositions`（既存をそのまま使用。全フロア分のKonvaノードを描画し可視制御する現方式を維持し、表示は1ペイン）
        - **`<FloorSegment>`**（共用）
        - **`<TouchMapStage interactive={false}>`**（共用）
        - **`<PlaybackBarMobile>`**（新規）
          - props: なし（playbackStore 直結）
          - state: `scrubbing: boolean`（スクラブ中は setCurrentTime のみ、isPlaying を一時停止）
          - 構成: ▶/⏸(44px)・シークバー・時刻・速度(長押しでメニュー)・「ノート」ボタン（`<CaseNoteSheet>` を開く）
        - **`<CaseNoteSheet>`**（新規、BottomSheet full）
          - props: `open`, `onClose` / 内部は `<CanvasWorkspace targetType="preset" compactMode>`（既存）をそのまま埋め込み
      - **`<NoteViewMobile>`**（新規。描画ロジックは既存 `CanvasWorkspace` を再利用し、**ツール群の器だけ**をシートに差し替える）
        - state: `toolSheet: 'insert' | 'style' | 'images' | null`
        - store: `activeNoteTab`, `notes`, `presets`
        - **`<NoteTabsSegment>`**（新規）: props `value: NoteTargetType`, `onChange`（全体/事件/キャラ/メモ）
        - **`<CanvasWorkspace>`**（既存・props 追加）
          - 追加 props: `toolbarMode?: 'sidebar' | 'external'`。external 時は char-sidebar を描画せず、ツール操作は下記シートから既存ハンドラを呼ぶ（`useNoteTools()` として NoteView から操作系を抽出し共有）
        - **`<InsertSheet>`**: props `onPick(type | imageSrc)` — 図形/テキスト/ペン/画像（Images+Character Images のグリッド）
        - **`<StyleSheet_>`**（名称は `ObjectStyleSheet` 推奨・DOM の StyleSheet と衝突するため）: props `selection: NoteObject[]`, `onChange(attrs)`, `onLayer(dir)`, `onGroup()/onUngroup()`, `onDelete()`
        - **`<SelectionBar>`**（新規・キャンバス上部の薄いバー）: props `count: number`, `onOpenStyle()`, `onCopy/onCut/onPaste/onUndo`
    - **`<BottomTabBar>`**（新規）
      - props: `mode`, `onModeChange(mode)`（内部で `runNavigationGuard` を await）, `badge?: Record<mode, boolean>`
      - state: なし
    - **`<BottomSheet>`**（新規・汎用）
      - props: `open`, `snapPoints: ('peek'|'half'|'full')[]`, `snap`, `onSnapChange`, `onClose`, `children`, `backdrop?: boolean`
      - state: `dragY: number`（ref, transform 直接更新で再レンダリング回避）
      - 実装: pointer events + `translateY` アニメ（`--dur-med`）。half=50vh, full=90vh, peek=56px

**selectedIcons の store 移管（推奨・先行タスク）**: 現在 App のローカル state で props drilling されている `selectedIcons` を `useAppStore`（persist **対象外**: partialize で除外）へ移す。モバイルでは AppBar/シート/ストリップの離れた階層から参照するため必須級。チュートリアル hands-on 判定（resolve_error/19.md #2）でも必要になる。

## 4. 見落としがちなエッジケースとハンドリング方針（5件）

### E1. IndexedDB の書き込み競合（複数タブ / PWA とブラウザの並走）
- **事象**: 同じ IDB キーに2タブが debounce 書き込み → 後勝ちで他方の編集が消える。スマホは「ホーム画面追加(PWA)+ブラウザタブ」で無自覚に2インスタンスになりやすい。
- **方針**: 保存値に `rev: number`（単調増加）と `clientId`（起動毎の乱数）を付与。`writeNow` の直前に現行値の rev を read し、**自分の知らない rev なら上書きせず** `BroadcastChannel('manosaba-state')` で他タブへ通知＋バナー表示「別のタブ/アプリで編集されています。再読み込みしてください」（DialogHost ではなく非モーダルバナー。編集続行は許すが保存は停止）。実装場所: `src/services/persistCoordinator.ts`（新規）、store.ts の storage 実装から呼ぶ。

### E2. iOS Safari のストレージ退避・容量制限・プライベートモード
- **事象**: ITP により未使用7日で IDB が消え得る / 容量超過で `QuotaExceededError` / プライベートモードで失敗 → **推理ノートが全損**する最悪ケース。
- **方針**: (1) 起動時に `navigator.storage?.persist()` を要求し、`estimate()` で使用率80%超なら警告トースト。(2) 書き込み失敗（catch 済みの `writeNow`）を**握りつぶさず** `saveStatus: 'error'` にして AppBar に赤表示+「エクスポート」導線。(3) `src/services/backup.ts`（新規・アダプタ）: `exportAll(): Blob(JSON)` / `importAll(file)`。Web は `<a download>` + `<input type=file>`、Tauri は dialog+fs プラグイン。**refactoring.md の機能1と同一実装を共有**。

### E3. ソフトキーボード・回転によるビューポート変化がジェスチャ/座標を壊す
- **事象**: テキスト編集 textarea がキーボードに隠れる / 回転や `visualViewport` 変化が ResizeObserver → `setCanvasSize` を発火し、**ドラッグ/ピンチ中に scale が変わって座標計算がずれる**（06/28-14:47-1 のペイン跨ぎ座標バグと同族の罠）。
- **方針**: (1) ジェスチャ進行中（`gesture !== 'none'` / Konva drag 中）は canvasSize 更新を保留し、pointerup 後に適用（`pendingSizeRef`）。(2) テキスト編集オーバーレイは `visualViewport.height` を購読し、キーボードと重なる場合は `translateY` で退避。(3) 回転時は一律「選択解除+進行中操作のコミット」を行ってから再レイアウト（安全側に倒す）。

### E4. タッチとマウスの二重発火・意図しない操作
- **事象**: タッチ端末では touch の後に互換 mouse イベントが合成され、Stage の `onMouseDown/onMouseUp` 系と二重処理 → オブジェクト二重配置や即時選択解除。長押しがコンテキストメニュー（右クリック相当）と競合。スクロールとパンの奪い合い。
- **方針**: (1) NoteView/CreateView の Stage ハンドラを Konva の pointer 系（`onPointerDown` 等）へ移行するか、`e.evt` の `pointerType`/`TouchEvent` 判定で mouse 合成イベントを無視する共通ガード `isGhostMouseEvent(e)` を `src/utils/pointer.ts` に用意。(2) 右クリック機能（レイヤー/色変更）は**長押し500msで同じフローティングメニュー**を開く（`useLongPress` フック新規）。App.tsx の `contextmenu` preventDefault は維持。(3) キャンバス領域のみ `touch-action: none`、シート/リストは通常スクロールを許可。

### E5. 画像アセットの解決失敗（オフライン・遅延デコード・アセット欠損）
- **事象**: スマホ回線では `./character/*.png` などの取得が遅く/失敗し、`use-image` が空のままオブジェクトが「見えないが存在する」状態になる。19.md P2（asset://化）後は「IDB からアセットが消えた」ケースも発生し得る。ロード前にドラッグ→width/height 未確定のままコミット、という競合も。
- **方針**: (1) `URLImage` に status 対応: `useImage` の status が 'failed' なら灰色プレースホルダ+⚠を描画し、タップで再試行（オブジェクト自体は保持＝データを壊さない）。(2) 'loading' 中は変形ハンドルを無効化（Transformer から除外）し未確定サイズのコミットを防ぐ。(3) `navigator.onLine` と `window.addEventListener('offline'/'online')` を `src/services/network.ts` に集約し、オフライン中は画像追加ボタンに「オフライン」バッジ（本アプリは基本ローカル完結なので、**通信エラーで壊れるのは画像とAdSlotのみ**。AdSlot は既にハウス枠フォールバックあり）。

（補足の6件目・軽微）**タブ切替ガードの競合**: `runNavigationGuard` の確認ダイアログ表示中に別タブを連打すると遷移要求が積まれる。`BottomTabBar` 側で「ガード解決までタップ無効（`guardPending` フラグ）」にして直列化する。

## 5. 実装フェーズ

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| M0 | `useViewport` / `BottomSheet` / `BottomTabBar` / `MobileAppBar` / selectedIcons の store 移管 | デスクトップ表示に一切影響なし（tsc/build/両起動 緑） |
| M1 | NoteViewMobile（InsertSheet/ObjectStyleSheet/SelectionBar + CanvasWorkspace external 化 + E3/E4 ガード） | iPhone SE 幅(375px)で事件ノートの配置/選択/スタイル変更/undo が完結 |
| M2 | AnimateViewMobile（TouchMapStage + PlaybackBarMobile + CaseNoteSheet） | 再生/シーク/フロア切替/ノート記入が可能 |
| M3 | CreateViewMobile（useRouteEditor 抽出 + RouteEditorSheet + FloorSegment） | 経路作成→sync→保存が片手で完結 |
| M4 | E1/E2/E5 のサービス実装（persistCoordinator / backup / network） | 2タブ同時編集で警告が出る・エクスポート/インポート往復が無損失 |

- 検証環境: Chrome DevTools device mode（375×812 / 768×1024）+ 実機 iOS Safari / Android Chrome。`npm run dev -- --host` で実機確認（vite.config の `host` は Tauri 用設定があるため `--host` フラグで上書き）。
- ロジック抽出（useRouteEditor / useNoteTools）は**挙動を変えないリファクタリング**として先に単独コミットすること（デスクトップの回帰を切り分けるため）。
