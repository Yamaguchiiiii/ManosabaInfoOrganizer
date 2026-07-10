# 不具合要因の検討と対処（20件）— 実装指示書（詳細版）

最終更新: 2026-07-07（詳細化 v2 / コード未変更）
現在の実装レビューで挙げた**将来不具合として顕在化しうる要因20件**。各項に、そのまま実装できる修正コード・手順・受入条件を付す。行番号は working tree（`work/perf-image-ui-foundations`）基準。ずれても検索できるよう grep アンカーを併記。

**№1・№2 は現に存在する実バグ**（分析中に発見）で最優先。
検証コマンド: `npx tsc -p tsconfig.json --noEmit` → `npm run build` → `npx vitest run` → preview 実機。

| No | 区分 | 事象（要約） | 重大度 | 修正先 |
|---|---|---|---|---|
| 1 | 計算/表示 | 再生時間表示が30fps前提（実60fps）＝2倍表示 | **高** | AnimationTimeline |
| 2 | React | FollowConfirmModal がフック前に early return | **高** | CreateView:1075 |
| 3 | 非同期 | 起動時アセット移行がユーザー編集を上書き | 高 | store.ts onRehydrate |
| 4 | 非同期 | putAsset 失敗が未捕捉＝画像追加が無反応 | 中 | NoteView |
| 5 | 非同期 | IDB upgrade の onblocked 未処理＝永久 Loading | 中 | persistStorage |
| 6 | 非同期 | handleTransition の並行実行ガードなし | 中 | App |
| 7 | 非同期 | showDialog が既存ダイアログを強制解決 | 中 | store.ts |
| 8 | 整合性 | pagehide 時の書き込み完了保証なし | 中 | persistStorage |
| 9 | 整合性 | ノート切替×テキスト編集で入力消失 | 中 | NoteView |
| 10 | 整合性 | クリップボードがワークスペース毎 | 低 | store+NoteView |
| 11 | 非同期 | Animate の経路キャッシュが data 変更に追従しない | 低→高 | useAnimationPositions |
| 12 | UI | 入力欄でも右クリックメニュー抑止 | 中 | App |
| 13 | UI | タブレット幅タッチで hover 依存フロア切替が不能 | 中 | CreateView(FloorPane) |
| 14 | 整合性 | タイミング offset 計算の2箇所重複 | 中 | →20.md #9 |
| 15 | 運用 | PWA 更新通知なし | 中 | vite.config+main |
| 16 | 計算/表示 | 画像サイズ取得失敗の無言 {200,200} | 低 | NoteView |
| 17 | UI | ダイアログ Enter が danger でも発火 | 低 | DialogHost |
| 18 | 運用 | 単一チャンク678KB | 中 | vite.config+App |
| 19 | 運用 | persistStorage の listener が HMR で重複 | 低 | persistStorage |
| 20 | 整合性 | 多タブは検知のみ（クロバー継続） | 中 | persistStorage+coordinator |

---

## №1【実バグ・高】再生時間表示が30fps前提（実60fps）

- **事象**: 時間軸の単位はフレームで `TARGET_FPS = 60`（constants.ts:27。`useAnimationPositions` の `deltaFrames = (delta/1000)*TARGET_FPS*speed` も60基準）。だが `AnimationTimeline.tsx` の表示系は**30fps 前提**:
  - `formatTime`: `Math.floor(frames / 30)`（grep: `frames / 30`）と `frames % 30`
  - 再生中の再レンダ間引き: `Math.floor(state.currentTime / 30) * 30`（コメント「1秒(30フレーム)ごと」）
  → 100px 移動（速度100px/s＝実1秒＝60フレーム）が **「2秒」と表示**される。全体尺・イベント時刻表示も同様に2倍。
- **修正**: `docs/resolve_error/20.md #9-2` の `src/utils/timeFormat.ts`（`TARGET_FPS` ベースの formatTime）を新設して置換するのが正。単独で直す場合の最小差分:
  ```ts
  import { TARGET_FPS } from '../constants';   // AnimationTimeline.tsx に追加
  // formatTime 内: /30 → /TARGET_FPS、%30 → %TARGET_FPS
  // displayTime selector: Math.floor(state.currentTime / TARGET_FPS) * TARGET_FPS  （1秒毎の間引きを維持）
  ```
- **受入**: Create で 100px 程度の短経路を保存 → Animate の所要が「約1秒」表示。イベント一覧の時刻とジャンプ位置が視覚と一致。

## №2【実バグ・高】FollowConfirmModal のフック順序違反

- **事象**: `CreateView.tsx:1075-1077`:
  ```tsx
  }> = ({ info, onClose, onConfirm }) => {
      if (!info) return null;                                 // ← フックより前に return
      const [selectedIndex, setSelectedIndex] = useState<number>(-1);
      useEffect(() => { setSelectedIndex(-1); }, [info]);
  ```
  `<FollowConfirmModal info={followTargetInfo} …/>` は常時レンダリングされ `info` は null→非null に変わるため、**フック数が 0→2 に変化**し React が「Rendered more hooks than during the previous render」で**クラッシュ**する経路（sync合流→同行確認モーダルを開く操作）。
- **修正**（3行の移動のみ・挙動不変）:
  ```tsx
  }> = ({ info, onClose, onConfirm }) => {
      const [selectedIndex, setSelectedIndex] = useState<number>(-1);
      useEffect(() => { setSelectedIndex(-1); }, [info]);
      if (!info) return null;
      …
  ```
- **受入**: 合流→同行確認モーダルの開閉を3回以上繰り返してもコンソールにフックエラーが出ない。`react-hooks/rules-of-hooks`（refactoring2 R7 の lint）でも0件。

## №3【高】起動時アセット移行がユーザー編集を上書き

- **事象**: `store.ts` `onRehydrateStorage`（grep: `state.setHasHydrated(true);`）は **UI解放の後**に `migrateDataUrlAssets()` を非同期起動。移行は開始時点の `getState().notes` スナップショットから新 notes を構築し `replaceNotes()` で**全置換**するため、移行中（画像が多いと数秒）のユーザー編集が巻き戻る。
- **修正**: UI解放を移行完了後に移す。`onRehydrateStorage` の該当部を次に差し替え:
  ```ts
  // 旧: state.setHasHydrated(true); → 移行を void で投げる
  // 新: 移行完了(または失敗)後に解放する。data: が無ければ即完了なので体感差なし。
  void import('./services/assetMigration').then(async ({ migrateDataUrlAssets, sweepOrphanAssets }) => {
      try { await migrateDataUrlAssets(); }
      catch { /* 失敗は次回起動で再試行（べき等） */ }
      finally { state.setHasHydrated(true); }
      // GC は解放後のアイドルで（従来どおり）
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { void sweepOrphanAssets(); }, { timeout: 2000 });
      else setTimeout(() => { void sweepOrphanAssets(); }, 1000);
  }).catch(() => state.setHasHydrated(true));   // 動的import自体の失敗でも必ず解放
  ```
  ※ `_hasHydrated=false` の間は LoadingScreen が出続け、note系アクションは既存ガード（`if (!get()._hasHydrated) return;`）で弾かれる＝競合が構造的に消える。
- **受入**: data: URL を含む旧データで起動 → ロード画面が移行完了まで継続 → 解放後の編集が消えない。新規データでは起動時間が変わらない。

## №4【中】putAsset 失敗が未捕捉

- **事象**: `NoteView.tsx` `handleImageUpload` / `handleDrop`（grep: `await putAsset(blob)`）は try/catch なし。QuotaExceededError 等で**無反応+unhandled rejection**。
- **修正**（両ハンドラを同型で包む）:
  ```ts
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!(e.target.files && e.target.files[0])) return;
      try {
          const { blob } = await processFile(e.target.files[0]);
          const key = await putAsset(blob);
          addNoteAsset(targetType, displayTargetId, key);
          startPlacement('image', key);
      } catch {
          toast.error('画像を保存できませんでした（空き容量不足の可能性）。ヘルプからバックアップの書き出しをおすすめします。');
          void import('../services/storageHealth').then(m => m.checkStorageHealth());  // 容量警告の再評価
      } finally {
          e.target.value = '';   // 同じファイルの再選択を可能に（既知の input 仕様対策も兼ねる）
      }
  };
  ```
  `handleDrop` も同様に try/catch（finally 不要）。
- **受入**: DevTools で `putAsset` を一時的に `throw` に差し替え → トーストが出て UI が固まらず、同じファイルを選び直せる。

## №5【中】IDB バージョンアップの onblocked 未処理

- **事象**: `persistStorage.openDB`（grep: `indexedDB.open(DB_NAME, DB_VERSION)`）は blocked を処理しない。**v1接続を保持した旧タブが生きたまま DB_VERSION を上げると、新タブは open が保留されたまま永久 Loading**（原因表示なし）。将来 DB_VERSION=3（refactoring2 F4 スナップショット等）で必ず踏む。
- **修正**: ① 汎用バナー基盤を新設 ② openDB に blocked/versionchange 処理を追加。
  **② src/services/appBanner.ts（新規・№15 と共用）**:
  ```ts
  import { create } from 'zustand';
  export interface AppBanner { message: string; actionLabel?: string; onAction?: () => void; }
  export const useAppBanner = create<{ banner: AppBanner | null }>(() => ({ banner: null }));
  export const showAppBanner = (b: AppBanner) => useAppBanner.setState({ banner: b });
  export const hideAppBanner = () => useAppBanner.setState({ banner: null });
  ```
  `ConflictBanner.tsx` を汎用化: `useCoordinator.externalUpdate` に加えて `useAppBanner.banner` も描画（message/actionLabel/onAction を使う同スタイルの2枚目。既存の外部更新バナーの構造をそのまま流用し、コンポーネント名は据え置きで良い）。
  **① persistStorage.openDB**:
  ```ts
  export const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => { /* 既存どおり */ };
      request.onblocked = () => {
          // 旧バージョン接続を持つ別タブが閉じられるまで open が保留される
          void import('./services/appBanner').then(m => m.showAppBanner({
              message: 'データベースの更新が他のタブにブロックされています。このアプリを開いている他のタブ/ウィンドウを閉じてください。',
          }));
      };
      request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          // 将来のバージョンアップ時、自分が旧接続側なら自動で手放す（相手のblocked回避）
          db.onversionchange = () => db.close();
          void import('./services/appBanner').then(m => m.hideAppBanner());
          resolve(db);
      };
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
  ```
  ※ persistStorage は循環回避のため appBanner を動的 import（appBanner は zustand のみ依存）。
- **受入**: 2タブで起動 → DB_VERSION を仮に+1 して片方をリロード → もう片方の接続が自動 close され、リロード側が正常起動（バナーは出ても自動で消える）。

## №6【中】handleTransition の並行実行ガードなし

- **事象**: `App.tsx` の遷移はデスクトップ側に in-flight ガードが無い（BottomTabBar のみ `pending` あり）。NavRail 連打・ガード確認中の再クリックで二重遷移/オーバーレイ競合。
- **修正**: **`docs/resolve_error/20.md #1-3` に統合済み**（`transitionBusyRef` + overlayPhase 状態機械）。#1 実装時に同時に入れること。単独で先行する場合:
  ```ts
  const transitionBusyRef = useRef(false);
  const changeModeWithTransition = async (newMode: …) => {
      if (mode === newMode || transitionBusyRef.current) return;
      transitionBusyRef.current = true;
      try {
          if (!(await runNavigationGuard())) return;
          handleTransition(() => enterMode(newMode));
      } finally {
          setTimeout(() => { transitionBusyRef.current = false; }, 600);  // オーバーレイ収束後
      }
  };
  ```
- **受入**: NavRail を高速連打 → 遷移1回・ガードダイアログ1つ・オーバーレイ点滅なし。

## №7【中】showDialog の強制差し替え

- **事象**: `store.ts` `showDialog`（grep: `既存ダイアログが残っていれば空文字でクローズ`）は先行 resolver を `''` で解決して差し替える。並行する `showConfirm` の先行側が**ユーザー操作なしで false 扱い**になる（例: 保存ガード確認中に別処理が警告を出すと、保存が黙って中止される）。
- **修正**: 直列キュー化（API 不変）。モジュールスコープの `dialogResolver` 部（grep: `let dialogResolver`）を次に置換:
  ```ts
  interface PendingDialog { req: DialogRequest; resolve: (v: string) => void; }
  let dialogResolver: ((value: string) => void) | null = null;
  const dialogQueue: PendingDialog[] = [];
  ```
  アクション実装:
  ```ts
  showDialog: (req) => new Promise<string>((resolve) => {
      if (dialogResolver) { dialogQueue.push({ req, resolve }); return; }  // 表示中→待機
      dialogResolver = resolve;
      set({ dialog: req });
  }),
  closeDialog: (value) => {
      const r = dialogResolver;
      const next = dialogQueue.shift();
      if (next) {
          dialogResolver = next.resolve;
          set({ dialog: next.req });      // 続けて次を表示
      } else {
          dialogResolver = null;
          set({ dialog: null });
      }
      if (r) r(value);
  },
  ```
  ※ showAlert/showConfirm は showDialog 経由のため変更不要。DialogHost も変更不要。
- **受入**: 開発時に `showConfirm('A'); showConfirm('B');` を同 tick で実行 → A→B の順に表示され、両方ともボタン操作の値で解決される。

## №8【中】pagehide 時の書き込み完了保証なし

- **事象**: `persistStorage` の flush は async IDB put で、unload 前の完了保証がない。編集→即タブ閉じで最大500ms分が消えうる。
- **修正（緩和・根治は不可能）**: `persistStorage.ts` の schedule/リスナー部:
  ```ts
  const schedule = () => {
      if (timer) clearTimeout(timer);
      // タブが隠れている間は debounce/idle を待たず即書き（バックグラウンド closure に強く）
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { void writeNow(); return; }
      timer = setTimeout(() => { /* 既存の requestIdleCallback 分岐 */ }, PERSIST_DEBOUNCE_MS);
  };
  // リスナー追加（既存 visibilitychange/pagehide の並び）:
  window.addEventListener('beforeunload', () => { void flushNow(); });
  ```
  さらにヘルプ（HelpDrawer バックアップ節）に一文追記: 「保存状態が『…変更あり』のままタブを閉じると直前の編集が保存されないことがあります」。
- **受入**: 編集→200ms後にタブ閉じ→再訪、で消失が「最後の1操作以内」に収まることを5回試行で確認（Chromium）。

## №9【中】ノート切替×テキスト編集の入力消失

- **事象**: `CanvasWorkspace` は `targetId` 変更を 200ms 遅延で `displayTargetId` に反映（grep: `setDisplayTargetId(targetId)`）。テキスト編集中に切り替えると、blur 由来の `finishTextEditing` が**新しい targetType/displayTargetId のクロージャ**で走り、旧キャンバスの obj.id を新キャンバスへ `updateNoteObject` → id 不一致で無言 no-op ＝入力消失。
- **修正**: `CanvasWorkspace` 内、**displayTargetId 遅延 effect より上**に追加:
  ```ts
  // 切替前のクロージャでコミットさせる（finishTextEditing は ref ベース・冪等）
  const finishRef = useRef(finishTextEditing);
  useEffect(() => { finishRef.current = finishTextEditing; });
  useEffect(() => {
      return () => { finishRef.current(); };   // targetType/targetId が変わる直前(クリーンアップ)に旧値でコミット
  }, [targetType, targetId]);
  ```
  ※ クリーンアップは「前回レンダー時のクロージャ」で走るため、旧 target への正しいコミットになる。`finishTextEditing` 未定義位置より後に置くこと（定義は grep: `const finishTextEditing = useCallback`）。
- **受入**: 事件ノートでテキスト編集中に文字を打ち、そのままキャラノートへ切替 → 戻ると入力が保存されている。

## №10【低】クリップボードのスコープ

- **事象**: `clipboard` は CanvasWorkspace の `useState`（grep: `const [clipboard, setClipboard] = useState<NoteObject[]>`）。ノート種別を跨ぐ貼り付け不可・切替で消える。
- **修正**: store へ移す（persist **除外**）。
  ```ts
  // store.ts AppState:
  noteClipboard: NoteObject[]; setNoteClipboard: (objs: NoteObject[]) => void;
  // 実装: noteClipboard: [], setNoteClipboard: (objs) => set({ noteClipboard: objs }),
  // partialize 除外リストに && key !== 'noteClipboard' を追加
  ```
  NoteView 側: `clipboard`/`setClipboard` の宣言を削除し、
  ```ts
  const clipboard = useAppStore(state => state.noteClipboard);
  const setClipboard = useAppStore(state => state.setNoteClipboard);
  ```
  に置換（**変数名を維持**すれば handleCopySelected/handleCut/handlePaste/依存配列は無変更で通る）。
- **受入**: 事件ノートでコピー→キャラノートで Ctrl+V → 貼り付き、canvasIndex は貼付先ペインになる（既存ロジック）。リロードでクリップボードは空（persist 除外）。

## №11【低→将来高】Animate 経路キャッシュの staleness

- **事象**: `useAnimationPositions` の precompute effect deps が `[activePresetId]`（:90）。Animate 表示中に同一プリセットの `data` が変わっても再計算されない。現状の実害はほぼ無い（Animate 中の data 変更手段が無い）が、20.md #8-10 のイベント編集や将来のタイムライン編集で顕在化。
- **修正**: data の参照を購読して deps に含める:
  ```ts
  // フック冒頭に追加（React 購読なので RAF ループとは独立）:
  const activePresetData = useAppStore(s => s.presets.find(p => p.id === s.activePresetId)?.data);
  // effect の deps: }, [activePresetId]); → }, [activePresetId, activePresetData]);
  ```
  data はイミュータブル更新のため、編集時のみ参照が変わる＝再生中の無駄な再構築なし。
- **受入**: Animate を開いたまま（デスクトップで ContextPanel から操作できる範囲＝将来のイベント編集後に）data を変更 → アニメが追従。既存挙動の回帰なし（切替時の再構築は従来どおり）。

## №12【中】入力欄でも右クリック抑止

- **事象**: `App.tsx` の `contextmenu` ハンドラ（grep: `handleContextMenu`）が全要素で preventDefault → テキスト入力で右クリック貼り付け/スペル修正が不能。
- **修正**:
  ```ts
  const handleContextMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
      e.preventDefault();
  };
  ```
- **受入**: メモ改名 input で右クリック→メニューが出て貼り付け可能。キャンバス上では従来どおり出ない（Note の右クリックメニュー動作も不変）。

## №13【中】タブレット幅タッチの hover 依存

- **事象**: 768〜1100px はデスクトップレイアウトだが、タッチでは `FloorPane` の `onMouseEnter`（grep: `onMouseEnter={() => onHover(floorId)}`、CreateView.tsx 内 FloorPane）で編集対象フロアを切り替えられない（CLAUDE.md hover 非依存規約違反の残存）。
- **修正**: FloorPane のコンテナ div に1行追加:
  ```tsx
  onPointerDown={() => onHover(floorId)}
  ```
  （クリック/タップでもアクティブ化。マウスでは hover が先に発火しているため挙動変化なし。）
- **受入**: DevTools タッチエミュレーション幅900pxでペインをタップ→青枠が移動→地点タップで経路入力できる。

## №14【中】タイミング offset の重複実装

- **事象**: 正規化 offset の計算が `useAnimationPositions`（grep: `全キャラの startTime 最小値を求め`）と `AnimationTimeline` の useMemo に重複。片方だけ変更するとイベントジャンプと再生位置がズレる。
- **修正**: **`docs/resolve_error/20.md #9-1`（`src/utils/presetTiming.ts`）と #9-5（両呼び出し箇所の置換）に統合済み。** そちらを実装すれば本項は完了（独立作業しないこと＝二重実装防止）。
- **受入**: 20.md #9 の受入と同一+`presetTiming.test.ts` green。

## №15【中】PWA 更新通知なし

- **事象**: `vite.config.ts` は `registerType: 'autoUpdate'`（grep: `registerType`）で、新 SW は無言で入れ替わり**開いているタブは旧資産のまま**。保存形式変更を伴うデプロイでの新旧不整合の温床。
- **修正**:
  1. `vite.config.ts`: Tauri 分岐を「プラグイン除外」から **`disable` オプション**へ変更（virtual module を常に解決可能にするため）:
     ```ts
     plugins: [react(), VitePWA({
         disable: isTauri,                    // Tauri では SW/manifest を生成しない
         registerType: 'prompt',              // autoUpdate → prompt（通知して更新）
         injectRegister: false,               // 自前で registerSW を呼ぶ
         /* devOptions/workbox/manifest は既存のまま */
     })],
     ```
     ※ `disable`/`injectRegister` の正確な挙動は実装時に vite-plugin-pwa 公式ドキュメントで確認すること（CLAUDE.md 規約）。
  2. 新規 `src/pwa.ts`:
     ```ts
     import { registerSW } from 'virtual:pwa-register';
     import { showAppBanner, hideAppBanner } from './services/appBanner';   // №5 で新設
     const updateSW = registerSW({
         onNeedRefresh() {
             showAppBanner({
                 message: '新しいバージョンがあります。',
                 actionLabel: '更新して再読み込み',
                 onAction: () => { hideAppBanner(); void updateSW(true); },
             });
         },
     });
     ```
     型: `vite-env.d.ts` に `/// <reference types="vite-plugin-pwa/client" />` を追記。
  3. `main.tsx` に `import './pwa';` を追加（disable 時は no-op registerSW が返るため Tauri でも安全）。
- **受入**: `npm run build && npm run preview` → 一度開く → ソースを変えて再ビルド → 開いていたタブに更新バナー → クリックで新版へ。Tauri ビルド（`npm run tauri dev` 起動確認まで）で SW 関連エラーが出ない。

## №16【低】画像サイズ取得失敗の無言フォールバック

- **事象**: `getImageSizeFromUrl`（NoteView.tsx、grep: `const getImageSizeFromUrl`）は onerror/解決失敗で `{200,200}` を返し、壊れた asset でも**正方形200pxで無言配置**される。
- **修正**: 失敗を null で返し、呼び出し側で分岐:
  ```ts
  const getImageSizeFromUrl = async (url: string, maxDimension = 500): Promise<{ width: number, height: number } | null> => {
      let resolved: string;
      try { resolved = await resolveAssetUrl(url); } catch { return null; }
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { /* 既存の縮小計算 */ resolve({ width, height }); };
          img.onerror = () => resolve(null);
          img.src = resolved;
      });
  };
  ```
  呼び出し3箇所:
  - 配置プレビュー（grep: `getImageSizeFromUrl(content, 300)` の2箇所）: `const size = await …; if (!size) { toast.error('画像を読み込めないため配置を中止しました'); setPlacementMode(null); return; } const { width, height } = size;`
  - キャラ初期立ち絵（grep: `getImageSizeFromUrl(defaultImgSrc, 800)`）: `then(size => { if (!size) return; …既存… })`（静的ファイルの失敗＝開発ミchannelスなので黙ってスキップで可）。
- **受入**: 存在しない `asset://xxx` を data に仕込んで配置を試みる→中止トーストが出て何も置かれない。

## №17【低】ダイアログ Enter の誤確定

- **事象**: `DialogHost.tsx` の Enter は「primary → 無ければ**最後のボタン**」（grep: `dialog.buttons[dialog.buttons.length - 1]`）。最後が danger の確認では Enter 一発で削除。
- **修正**:
  ```ts
  } else if (e.key === 'Enter') {
      e.preventDefault();
      const primary = dialog.buttons.find(b => b.variant === 'primary');
      if (primary && primary.variant !== 'danger') closeDialog(primary.value);
      // primary が無い/危険な確認は Enter では確定させない（明示クリックを要求）
  }
  ```
- **受入**: 「削除しますか？」系（danger ボタンあり）で Enter→無反応、OK(primary) の確認では従来どおり確定。

## №18【中】単一チャンク 678KB

- **事象**: build 警告どおり。モバイル初回・PWA 初回が遅い。
- **修正**:
  1. `vite.config.ts` に追加:
     ```ts
     build: {
         rollupOptions: {
             output: {
                 manualChunks: {
                     react: ['react', 'react-dom'],
                     konva: ['konva', 'react-konva'],
                 },
             },
         },
     },
     ```
  2. `App.tsx` のビュー import を lazy 化:
     ```tsx
     const CreateView = React.lazy(() => import('./components/CreateView').then(m => ({ default: m.CreateView })));
     const AnimateView = React.lazy(() => import('./components/AnimateView').then(m => ({ default: m.AnimateView })));
     const NoteView = React.lazy(() => import('./components/NoteView').then(m => ({ default: m.NoteView })));
     // viewElement を <Suspense fallback={<LoadingScreen overlay />}>…</Suspense> で包む
     ```
     ※ `NotesPanel` が NoteView から `CanvasWorkspace` を import しているため、Animate を開くと NoteView チャンクも読まれる（依存として自動解決・エラーにはならない）。R2 の分割（CanvasWorkspace 独立ファイル化）後はより綺麗に分かれる。
  3. 確認: `npm run build` の出力で konva/react/index の3+チャンクに分割され、**konva が1チャンクのみ**（dedupe 回帰なし）であること。
- **受入**: 最大チャンク < 400KB・警告消滅・3ビュー遷移と PNG 書き出し（Konva 参照）が正常。PWA precache 合計が概ね不変。

## №19【低】HMR での listener 重複（dev のみ）

- **事象**: `persistStorage.ts` モジュールスコープの `addEventListener('visibilitychange'|'pagehide')` が HMR 再評価毎に増える（古いクロージャの pending を参照し続ける）。
- **修正**（ファクトリ内のリスナー登録部を置換）:
  ```ts
  if (typeof window !== 'undefined') {
      const w = window as unknown as { __manosabaPersistFlushInstalled?: boolean };
      if (!w.__manosabaPersistFlushInstalled) {
          w.__manosabaPersistFlushInstalled = true;
          window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushNow(); });
          window.addEventListener('pagehide', () => { void flushNow(); });
          window.addEventListener('beforeunload', () => { void flushNow(); });   // №8
      }
  }
  ```
  ※ ガードでリスナーは旧モジュールの flushNow を指し続けるが、`createIdbPersistStorage` はアプリ起動で1回しか呼ばれず、HMR で store.ts が再評価される場合はページ自体がリロードされる（zustand ストアはフルリロード）ため実害なし。厳密にやるなら `import.meta.hot?.dispose()` で remove。
- **受入**: dev で数回 HMR 後、DevTools `getEventListeners(window).pagehide` が1件。

## №20【中・設計残】多タブのクロバー継続

- **事象**: E1 実装は「他タブが書いた」の**検知のみ**。バナーを閉じてもこのタブの保存は続き、last-write-wins で相手の変更を上書きする。
- **修正（第1段: 書き込み保留ガード）**: `persistStorage.ts` に rev 管理を追加:
  ```ts
  const REV_KEY = 'mystery-map-storage:rev';
  let knownRev = 0;          // 自分が最後に読んだ/書いた rev
  let writeHeld = false;     // 競合検知で保存停止中

  // getItem 成功時: knownRev = Number(await idbGetString(REV_KEY)) || 0;
  // writeNow 内、stringify の後・put の前に:
  const currentRev = Number(await idbGetString(REV_KEY)) || 0;
  if (currentRev !== knownRev) {
      writeHeld = true;
      pending = { name, value };                 // 破棄しない（リロードまで保持）
      notifyPhase('error');
      void import('./services/appBanner').then(m => m.showAppBanner({
          message: '別のタブがデータを更新したため、上書き防止のためこのタブの保存を停止しました。',
          actionLabel: '再読み込みして再開',
          onAction: () => location.reload(),
      }));
      return;
  }
  knownRev = currentRev + 1;
  await idbPutString(REV_KEY, String(knownRev));
  await idbPutString(name, str);
  // setItem 冒頭に: if (writeHeld) return;（以降の書き込みも停止）
  ```
  `persistCoordinator.notifyPersistWrote()` は従来どおり（相手側の即時バナー用）。バックアップ import（`idbPutString` 直呼び）は rev を+1する処理を `backup.ts` にも追記。
- **受入**: タブA編集→タブB編集→タブAでさらに編集 → タブAの保存が停止し「保存停止」バナー、Bの内容は無傷。Aを再読み込みするとBの内容+以後の編集が正常に保存される。
- **将来（第2段）**: notes/presets などスライス単位の粗マージ（refactoring2 R1 のスライス分割が前提）。本書のスコープ外。

---

## 補遺（対処不要・認知事項）
- `saveHistoryOnceThenSkip` の300msバッチは意図的（高速連続操作を1 undo に融合）。分離したい場合は pointerup でバッチ即終了。
- lint スクリプト未整備 → refactoring2 R7 で導入（№2 型のバグは `react-hooks/rules-of-hooks` で機械検出可能になる）。
- `idbGetString` の localStorage 移行パスは TODO(2026-09) 削除予定（コメント済み）。
