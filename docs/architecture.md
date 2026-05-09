CLAUDE.md はすでにコンテキストに読み込まれています。次に src/
  の構造を確認します。

● Explore(src/ directory structure exploration)
  ⎿  Done (15 tool uses · 26.9k tokens · 2m 23s)
  (ctrl+o to expand)

● 主要ファイルの中身も少し確認して、実装状況をより正確に把握します。

  Searched for 1 pattern, read 2 files (ctrl+o to expand)

● メモリディレクトリを確認してから、理解をまとめます。

  Searched memories (ctrl+o to expand)

● メモリが空なので、このプロジェクトの初回把握内容を保存します。

  Wrote 3 memories (ctrl+o to expand)

● ---
  把握した内容のまとめ

  プロジェクトの目的

  ゲーム「魔法少女の魔女裁判」のプレイ支援ツール。推理整理・キャラノート・行
  動ルート可視化を一体化したアプリ。

  クロスプラットフォームの絶対ルール

  - UIコンポーネントから @tauri-apps/api や localStorage を直接呼ばない
  - src/services/ か src/adapters/ にアダプター層を置き、window.__TAURI__
  の有無で分岐
  - Web側フォールバック（または「デスクトップ版専用」UI通知）を必ず実装
  - モバイルファーストのレスポンシブ、タップ要素は十分なサイズ確保

  ---
  現在の実装状況

  領域: 状態管理 (store.ts)
  状況: 完成度高い。Zustand +
    IndexedDB永続化。undo/redo、プリセット管理、ノートデータ、キャラアニメー
  ション全て定義済み
  ────────────────────────────────────────
  領域: Create モード
  状況: CreateView, MapObjectLayer, WaypointPanel, MapElements,
  NodeEditModal
    — マップグラフ編集機能が実装済み
  ────────────────────────────────────────
  領域: Animate モード
  状況: AnimateView, AnimationTimeline, ReadOnlyMapView,
    CharacterSelectModal, MergeModal —
    タイムライン付きアニメーション再生が実装済み
  ────────────────────────────────────────
  領域: Note モード
  状況: NoteView, NotesPanel — overview/preset/character/misc
    の4タブ構成のキャンバスノートが実装済み
  ────────────────────────────────────────
  領域: 共通UI
  状況: Sidebar, TopBar, SuggestionSidebar, PresetSelector —
    ナビゲーション・サイドバー類が実装済み
  ────────────────────────────────────────
  領域: カスタムHooks
  状況: useAnimationLoop, useSidebarResizer, useStageZoom, useWaypointPath —

    ロジック分離済み
  ────────────────────────────────────────
  領域: ユーティリティ
  状況: dijkstra.ts（最短経路）, animationUtils.ts, mapDrawUtils.ts
  ────────────────────────────────────────
  領域: アダプター層
  状況: src/services/ や src/adapters/ は未作成（現状ファイルなし）
  ────────────────────────────────────────
  領域: スタイル
  状況: App.scss, AnimateView.scss, Modal.scss, NoteView.scss

  気になる点

  src/services/ と src/adapters/ が存在しない（CLAUDE.md
  が求めるアダプターパターンの実装ディレクトリ）ため、現状の実装がプラットフ
  ォーム判定をどこで行っているか、または今後の課題として残っているかが確認ポ
  イントになります。何か実装したい機能や修正点があれば教えてください。

✻ Worked for 2m 18s

❯ 現在の実装でnpm run tauri
  devを実行した際に発生し得るエラーを検討して示して

● 設定ファイルとコンポーネントを並行して読み込んで調べます。

  Searched for 1 pattern, read 4 files (ctrl+o to expand)

● 残りの主要コンポーネントと設定を確認します。

  Read 6 files (ctrl+o to expand)

● AnimateView の残りと Rust ソースを確認します。

  Read 2 files (ctrl+o to expand)

● 十分に把握できました。整理して説明します。

  ---
  npm run tauri dev 実行時に発生し得るエラー・問題一覧

  起動フロー

  npm run tauri dev
    → tauri CLI が tauri.conf.json を読む
    → beforeDevCommand: "npm run dev" (Vite 起動)
    → Rust/Cargo コンパイル
    → WebView2 ウィンドウが http://localhost:1420 を開く

  ---
  【レベル1】確実に起動失敗する問題

  ① Vite の strictPort 衝突

  場所: vite.config.ts:17-18
  port: 1420,
  strictPort: true,
  1420番ポートが他のプロセスで使用中だと Vite が即座にエラー終了し、Tauri
  ウィンドウも開きません。

  ② Rust/Cargo のビルド環境が未整備

  Rust (rustc, cargo) または WebView2 ランタイムが未インストールだと Cargo
  のコンパイルフェーズで失敗します。lib.rs 自体のコードは問題ありません。

  ---
  【レベル2】起動はするが機能が壊れる問題

  ③ isFontLoaded ガードによるキャンバス全オブジェクトの空白

  場所: NoteView.tsx:355-364, NoteView.tsx:903

  // Google Fonts を動的に <head> に追加
  link.href =
  'https://fonts.googleapis.com/css2?family=Yomogi&display=swap';
  document.head.appendChild(link);

  document.fonts.ready.then(() => setIsFontLoaded(true)); // 解決するまで
  false
  // ← isFontLoaded が false の間、オブジェクトが一切描画されない
  {isFontLoaded && objs.map((obj) => { ... })}

  - ネット接続なし・Google Fonts にアクセス不可の環境 では
  document.fonts.ready の解決が遅延し、キャンバスが長時間空白になる
  - document.fonts.ready は最終的には解決するが、フォールバックフォントのオ
  ブジェクトが遅れて表示される
  - CanvasWorkspace
  は複数インスタンスが存在しうるが、document.getElementById('yomogi-font')
  チェックで重複インジェクションは防いでいる

  ④ window.prompt() / window.confirm() が Tauri で動作保証外

  場所: NoteView.tsx:1350-1362

  const newTitle = window.prompt("Rename Note:", page.title);  // リネーム
  if (window.confirm("Are you sure you want to delete this note?")) { ... }
  // 削除

  Tauri v2 の WebView2 (Windows) では動作しますが、OS
  ネイティブダイアログではなく WebView 内埋め込みダイアログになり、見た目が
  不自然になります。またアプリをウィンドウ外から操作できないなど UX
  の問題が出やすいです。Tauri 推奨の方法は @tauri-apps/plugin-dialog
  の使用です。

  ---
  【レベル3】npm run build 時のみ失敗する TypeScript エラー

  npm run tauri dev では Vite が TypeScript を
  型チェックなしでトランスパイル (esbuild) するため、以下のエラーは dev
  中は画面には出ません。ただし npm run build (tsc && vite build)
  時に必ず失敗します。

  ⑤ any 型の使用 (プロジェクト規約違反 + strict との整合)

  場所: NoteView.tsx:14, 54, 91 など

  const URLImage    = React.memo(({ imageObj, onSelect, onChange,
  isDrawingMode }: any) => { ... });
  const EditableText = React.memo(({ textObj, onSelect, onChange, ... }:
  any) => { ... });
  const ShapeObject  = React.memo(({ shapeObj, onSelect, onChange, ... }:
  any) => { ... });

  CLAUDE.md の「any 型の使用は厳禁」に違反しています。any は TypeScript
  自体はエラーにしませんが、strict モードの noImplicitAny
  と組み合わせた将来の設定変更で問題になります。

  ⑥ ExtendedNoteObjectType 型が冗長 (論理的矛盾)

  場所: NoteView.tsx:11, store.ts:55

  // store.ts — NoteObjectType はすでに 'freehand' を含む
  export type NoteObjectType = 'image' | 'text' | 'rect' | ... | 'freehand';

  // NoteView.tsx — | 'freehand' は冗長 (union に既に存在する)
  type ExtendedNoteObjectType = NoteObjectType | 'freehand';

  TypeScript はこれを NoteObjectType
  に単純化するためエラーにはなりません。ただし意図が不明瞭で、将来的に
  NoteObjectType から freehand
  が削除された場合に思わぬ動作変化が起きえます。

  ---
  【レベル4】動作するがアーキテクチャ違反・潜在リスク

  ⑦ store.ts で localStorage を直接使用

  場所: store.ts:158-162

  // IndexedDB 移行フォールバック
  const localValue = localStorage.getItem(name);
  if (localValue) {
      await idbStorage.setItem(name, localValue);
      localStorage.removeItem(name);

  UI コンポーネントではなくストア層での使用なので CLAUDE.md
  の直接禁止事項には該当しません。ただし src/services/
  への切り出しが推奨される箇所です。Tauri の将来バージョンで WebView の
  storage 権限が変わった場合に問題になる可能性があります。

  ⑧ CSP が null (セキュリティリスク)

  場所: tauri.conf.json:21

  "security": {
    "csp": null
  }

  Content Security Policy
  が未設定のため、外部スクリプトの実行制限がありません。現状のアプリには XSS
   の侵入経路はありませんが、将来の機能追加時にリスクになります。

  ⑨ AnimateView が全ストアを購読し 60fps でフルレンダー

  場所: AnimateView.tsx:32

  const { setSidebarWidth, presets, activePresetId, nodes, currentTime } =
  useAppStore();

  セレクタなしで全ストアを購読しているため、currentTime が毎フレーム更新され
  るとコンポーネント全体が再レンダリングされます。アニメーション再生中は
  60fps の再レンダーが発生します。useMemo で activeCharData を計算しているの
  で描画は最小化されていますが、パフォーマンスの懸念があります。

  ---
  まとめ表

  #: ①
  問題: Vite ポート 1420 衝突
  発生タイミング: dev 起動時
  深刻度: 致命的
  ────────────────────────────────────────
  #: ②
  問題: Rust/WebView2 環境未整備
  発生タイミング: dev 起動時
  深刻度: 致命的
  ────────────────────────────────────────
  #: ③
  問題: isFontLoaded ガードによるキャンバス空白
  発生タイミング: WebView 実行時
  深刻度: 高
  ────────────────────────────────────────
  #: ④
  問題: window.prompt/confirm の動作不安定
  発生タイミング: WebView 実行時
  深刻度: 中
  ────────────────────────────────────────
  #: ⑤
  問題: any 型使用
  発生タイミング: npm run build 時
  深刻度: 中
  ────────────────────────────────────────
  #: ⑥
  問題: ExtendedNoteObjectType 冗長定義
  発生タイミング: build 時
  深刻度: 低
  ────────────────────────────────────────
  #: ⑦
  問題: localStorage 直接使用
  発生タイミング: 実行時 (潜在的)
  深刻度: 低
  ────────────────────────────────────────
  #: ⑧
  問題: CSP null
  発生タイミング: 実行時 (セキュリティ)
  深刻度: 低
  ────────────────────────────────────────
  #: ⑨
  問題: AnimateView の全ストア購読
  発生タイミング: アニメーション再生時
  深刻度: 低

  最も実際に「動かして困る」のは ③の isFontLoaded
  ガードです。オフライン環境や Google Fonts が遅い環境で Note
  モードを開くと、キャンバスが長時間空白のままになります。修正するなら
  useState(false) を useState(true)
  にして初期から描画し、フォントはベストエフォートで適用する方針が安全です。

---

## 確認済みバグの根本原因分析

### バグ1: アニメーション再生時のキャラクターアイコンのカクつき

**症状:** `AnimateView` でアニメーション再生中、キャラクターアイコンの移動がスムーズにならずカクカクする。

#### 原因

アニメーションが「React の状態更新ループ」と「Konva 直接操作ループ」の2系統に分かれており、React 側のレンダリングコストが16msのフレーム予算を圧迫している。

**ループ1: 時刻更新 (useAnimationLoop.ts:58)**
```ts
useAppStore.setState({ currentTime: nextTime }); // RAF毎に呼ばれる
requestRef.current = requestAnimationFrame(animate);
```
毎フレーム Zustand の state を書き換えるため、`currentTime` を購読する全コンポーネントが再レンダリングされる。

**ループ2: 座標補間・描画 (AnimateView.tsx:114-152)**
```ts
// Konva ノードを直接書き換えてスムーズに動かす (LERP)
node.x(current.x += diffX * LERP_FACTOR);
node.y(current.y += diffY * LERP_FACTOR);
```

**問題の連鎖:**

1. `AnimateView.tsx:32` でセレクタなしの `useAppStore()` を使用しているため、`currentTime` が更新されるたびに `AnimateView` コンポーネント全体が再レンダリングされる（60fps）。

2. 再レンダリングのたびに `useMemo(activeCharData, [..., currentTime, ...])` が再計算される。この計算には全アクティブキャラクターへの `calculateRawPosition()` (O(path_length)) と `getCollisionOffsets()` (O(n²)) が含まれる。

3. `targetPositionsRef` は `useEffect` で更新される（`AnimateView.tsx:110-112`）。`useEffect` は React のコミット後に非同期に実行されるため、ループ2の RAF コールバックが `targetPositionsRef` を読む時点では、まだ前フレームの古い値が入っていることがある。これが1フレーム分の座標の飛びになる。

4. 上記のReact再レンダリングが16.7ms（60fps予算）を超えると、ループ2の RAF コールバックが本来のタイミングより遅れて呼ばれ、LERP補間の間隔が不均一になる→カクつきとして知覚される。

**関連箇所:**
- `src/hooks/useAnimationLoop.ts:58` — `useAppStore.setState({ currentTime })`
- `src/components/AnimateView.tsx:32` — セレクタなし `useAppStore()`
- `src/components/AnimateView.tsx:59-108` — `useMemo(activeCharData)` (毎フレーム再計算)
- `src/components/AnimateView.tsx:110-112` — `useEffect` による `targetPositionsRef` 更新
- `src/components/AnimateView.tsx:114-152` — LERP ループ (Konva 直接操作)

---

### バグ2: キャラクターノート切り替え時の Out of Memory エラー

**症状:** キャラクターノートを最初のキャラクターから別キャラクターへ切り替えると Out of Memory クラッシュが発生する。切り替えるキャラクターが増えるほど発生しやすくなる。

#### 原因

`NoteView` の `initDefaultImage` エフェクト（`NoteView.tsx:1260-1282`）が無限ループを形成し、各キャラクターのキャンバスに大量の重複オブジェクトを蓄積する。

**エフェクトの定義:**
```tsx
useEffect(() => {
    if (!charData || charData.objects.length === 0) {
        addNoteAsset('character', selectedChar, defaultImgSrc);   // (A) 同期
        getImageSizeFromUrl(defaultImgSrc, 500).then(size => {
            addNoteObject('character', selectedChar, { ... });    // (B) 非同期
        });
    }
}, [selectedChar, activeNoteTab, notes.characters, addNoteAsset, addNoteObject]);
//                                ↑ ここが問題
```

**無限ループの発生メカニズム:**

1. キャラクター切り替え → `selectedChar` 変化 → エフェクト実行
2. `charData.objects.length === 0` が true → `addNoteAsset` (A) を呼ぶ
3. `addNoteAsset` は内部で `store.ts:190-219` の `updateCanvasState` を呼ぶ。この関数は**アセットが重複していても**必ず `notes.characters` を新しいオブジェクト参照として返す（`{ ...newNotes.characters, [targetId]: canvas }` のスプレッドで常に新参照が生成される）
4. `notes.characters` の参照が変わる → エフェクトの依存配列が変化 → エフェクト再実行 → step 2 へ戻る
5. `charData.objects.length` は (B) が resolve するまでずっと 0 のまま → ループが止まらない
6. ループ中、`getImageSizeFromUrl` が毎回呼ばれるため N 個の Promise が生成される
7. 画像ロード完了時に N 個の Promise が一斉に resolve → `addNoteObject` が N 回呼ばれる → キャンバスに N 個の重複 `NoteObject` が追加される

**重複オブジェクトによるメモリ増大:**

- N 個の `NoteObject` が Zustand store に蓄積される
- CanvasWorkspace の `objs.filter(...)` で N 個全てが描画対象になる
- 各オブジェクトは `URLImage` → `useImage(url)` → HTML `Image` 要素 → Konva `KonvaImage` ノードを生成する
- Konva はキャンバス上の全ノードのリソースを保持するため、ノード数に比例してメモリを消費する

**自己増幅的な悪化:**

初回キャラクター（問題なし）から順番に切り替えるほど深刻化する理由：

- 切り替えを繰り返すたびに `notes.characters` の総サイズが増大する
- 大きい state ほど React の再レンダリングが遅くなる
- React render が遅いほどループが多く回る（(B) が resolve する前により多くの (A) が呼ばれる）
- ループが多く回るほど N が大きくなり重複オブジェクトが増える
- 重複オブジェクトが増えると state がさらに大きくなる → 次のキャラクター切り替えでさらに悪化

初回キャラクターがクラッシュしない理由: 初回は `notes.characters = {}` で state が最小のため render が速く、ループ回数 N が小さい。

**関連箇所:**
- `src/components/NoteView.tsx:1260-1282` — `initDefaultImage` エフェクト（ループ起点）
- `src/store.ts:190-219` — `updateCanvasState`（常に新参照を生成するためループが止まらない）
- `src/store.ts:370-376` — `addNoteAsset`（重複チェックはするが参照変化は防げない）
- `src/components/NoteView.tsx:903` — `{isFontLoaded && objs.map(...)}` で重複オブジェクトが全て描画される
