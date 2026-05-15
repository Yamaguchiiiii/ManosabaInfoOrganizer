# 引き継ぎ資料 — 作業進捗

最終更新: 2026-05-15

Resume this session with:
claude --resume 1d2f3b7a-8d70-4e18-b7c3-6d138a6d0ae2

---

## プロジェクト概要

ゲーム「魔法少女の魔女裁判」のプレイ支援ツール。  
推理整理・キャラクターノート・行動ルート可視化を一体化したデスクトップ + ブラウザ対応アプリ。

**技術スタック:** React 19 + TypeScript + Vite + Zustand + Konva.js + SCSS + Tauri 2 (Rust)  
**状態永続化:** IndexedDB（Zustand persist ミドルウェア経由）  
**重要規約（CLAUDE.md）:**
- UIコンポーネントから `@tauri-apps/api` / `localStorage` / `window.showOpenFilePicker` を**直接呼ばない**
- プラットフォーム分岐は `src/services/` または `src/adapters/` に集約（`window.__TAURI__` で判定）
- `any` 型の使用禁止
- カスタム Hook でビジネスロジックと UI を分離
- モバイルファースト・レスポンシブ設計

---

## 現在のコードベース状態（実装済み機能）

| 機能 | 主要ファイル | 状態 |
|---|---|---|
| **Create モード** — マップグラフ編集 | `CreateView`, `MapObjectLayer`, `WaypointPanel`, `NodeEditModal` | 実装済み・動作確認済み |
| **Animate モード** — タイムライン付きアニメーション再生 | `AnimateView`, `AnimationTimeline`, `ReadOnlyMapView`, `CharacterSelectModal` | 実装済み |
| **Note モード** — キャンバスノート (overview / preset / character / misc) | `NoteView`, `NotesPanel`, `CanvasWorkspace` | 実装済み |
| **共通 UI** | `Sidebar`, `TopBar`, `SuggestionSidebar`, `PresetSelector` | 実装済み |
| **カスタム Hook** | `useAnimationPositions`, `useSidebarResizer`, `useStageZoom`, `useWaypointPath` | 実装済み（`useAnimationLoop` はセッション4で削除済み） |
| **ユーティリティ** | `dijkstra.ts`, `animationUtils.ts`, `mapDrawUtils.ts` | 実装済み |
| **アダプター層** | `src/services/`, `src/adapters/` | **未作成**（現時点では必要な機能なし） |

---

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | プロジェクト規約（クロスプラットフォーム設計・コーディング規約・レスポンシブ規約） |
| `docs/architecture.md` | 実装状況の把握内容 + 確認済みバグの根本原因分析（詳細） |
| `docs/resolve_error.md` | バグ1（カクつき）・バグ2（OOM）の修正ステップ（完了済み） |
| `docs/resolve_error2.md` | 3問題の根本原因分析と修正ステップ（完了済み） |
| `docs/resolve_error3.md` | 4問題の根本原因分析と修正ステップ（**すべて完了**） |
| `docs/resolve_error4.md` | 3問題の根本原因分析と修正ステップ（問題1・2完了、問題3は差し戻し） |
| `docs/progress.md` | 本ファイル（引き継ぎ資料） |

---

## 修正済みバグ一覧（時系列）

### 【セッション1】resolve_error.md 分（2026-05-10 完了）

#### バグ1: Animate モードでキャラクターアイコンの動きがカクカクする
- `useAppStore()` をセレクタなしで使用 → `currentTime` 毎フレーム全体再レンダリング
- **修正:** `useAnimationPositions.ts` 新規作成（Konva 直接操作 + 単一 RAF ループ）、`AnimateView.tsx` 全面改修

#### バグ2: キャラクターノートで 2 枚目以降を開くと Out of Memory エラー
- `initDefaultImage` エフェクトの無限ループ → Konva ノード蓄積 → OOM
- **修正:** `NoteView.tsx` の `initializedCharsRef` 追加、`store.ts` の `updateCanvasState` 早期リターン・`addNoteAsset` 重複チェック追加

---

### 【セッション2】resolve_error2.md 分（2026-05-10 完了）

#### 問題1: Create ページで経由地を設定しても経由した経路にならない
- `handleWaypointChange` が `name` のみ更新し `id` を更新しない → Dijkstra が経由地をスキップ
- **修正:** `useWaypointPath.ts` に name→id 補完ステップ追加、`CreateView.tsx` の `handleWaypointChange` で即時 id 解決

#### 問題2: 経由地に Sync ボタンが消える
- 問題1の連鎖（`wp.id === ""` のため `{wp.id && ...}` が非表示）
- **修正:** 問題1の修正で連鎖的に解消（独立変更なし）

#### 問題3: Animate ページのアニメーションがカクカクする（ReadOnlyMapView 全購読）
- `ReadOnlyMapView.tsx` が `useAppStore()` 全購読 → `currentTime` 変化で 60fps × 3インスタンス 再レンダリング
- **修正:** `ReadOnlyMapView.tsx` を個別セレクタ（`state => state.nodes` / `state.edges`）に変更

---

### 【セッション3】resolve_error3.md 分（2026-05-10 完了）

#### 問題1: Animate ページのアニメーションがまだカクカクする（計算ボトルネック）

**根本原因3点:**
1. `calculateRawPosition` が毎フレーム `pathNodes`・`distances` 配列を生成（234,000要素/秒）
2. `useAnimationLoop` が毎フレーム `maxDuration` を再計算（`any` 型使用）
3. 2本の RAF ループ（`useAnimationLoop` + `useAnimationPositions`）のタイミングずれで LERP ジッター

**修正ファイル:**
- `src/utils/animationUtils.ts` — `PrecomputedPath` 型・`precomputePath()`・`calculateRawPositionCached()` を追加（`getNode` の後に配置）
- `src/hooks/useAnimationPositions.ts` — `pathCacheRef` を追加。`useEffect([activePresetId])` でプリセット変更時のみキャッシュ再構築。RAF 内で `calculateRawPositionCached` を使用
- `src/hooks/useAnimationLoop.ts` — `maxDurationRef` + `useEffect([activePresetId])` でプリセット変更時のみ再計算。`any` 型を除去して `CharacterTimelineData` 型ガードに変更

#### 問題2: Animate ページでアニメーションを動かし続けると OutOfMemory が出る
- 問題1と同根（毎フレーム配列生成 → GC 枯渇 → OOM）
- **修正:** 問題1の修正で連鎖的に解消（独立変更なし）

#### 問題3: 4 ペインウィンドウにすると上 2 つのペインがだんだん下に伸びていく
- `NotesPanel.tsx` の `overflow: 'visible'` が `CanvasWorkspace` 内 `ResizeObserver` と正のフィードバックループを形成
- **修正:** `src/components/NotesPanel.tsx` — `overflow: 'visible'` → `overflow: 'hidden'`（1行変更）

#### 問題4: Timeline notes (canvas) の背景が真っ黒
- `NoteView.scss` の `.konvajs-content { transparent }` ルールが `.character-canvas-layout` にネストされており、compactMode（AnimateView 文脈）では適用されない
- **修正:** `src/styles/NoteView.scss` — ファイル末尾に独立セレクター `.char-canvas-wrapper .konvajs-content { background-color: transparent !important; }` を追加

---

### 【セッション4】resolve_error4.md 分（2026-05-11 部分完了）

#### 問題1 & 2: 数分再生後 OOM ＋ アニメーションのカクつき（同根）

**根本原因3層:**
1. `useAnimationLoop`（時刻進行）と `useAnimationPositions`（位置計算）が**別々の RAF**で動作 → 同フレーム同期が保証されず 1 フレーム遅延・ジッター
2. `useAnimationLoop` が `useAppStore.setState({ currentTime })` を**毎秒 60 回**実行 → Zustand 全購読者への通知が毎フレーム走る → React scheduler に仕事が積み重なる
3. `getCollisionOffsets` 等が毎フレーム多数のオブジェクトを生成 → GC 追いつかず数分で OOM

**修正内容:**
- `src/hooks/useAnimationPositions.ts` — 全面改修。`timeRef` / `maxDurationRef` / `lastTsRef` / `frameCountRef` を追加し、時刻進行ロジックを移植。`animate()` に `timestamp` 引数を追加して単一 RAF に統合。Zustand への `currentTime` 書き込みを **4 フレームに 1 回**にスロットル。ループ折り返し時は即時 Zustand 書き込みでシーク誤検知を防止
- `src/hooks/useAnimationLoop.ts` — **削除**（ロジックを `useAnimationPositions` に統合）
- `src/components/AnimateView.tsx` — `useAnimationLoop` の import と呼び出し行を削除

#### 問題3: 近接グルーピングに「並びかけ」中間状態が出る

**実装・差し戻し済み:**  
`computeGroupKeys` 関数を追加しグループ変化フレームで LERP をスキップするスナップ処理を実装したが、ユーザーから旧実装の方が好ましいとの判断により `git checkout a084efb` で差し戻した。**現在は旧動作（LERP あり）に戻っている。**

---

---

### 【セッション5】resolve_error5.md 分（2026-05-15 部分完了）

#### 問題1: Sync 後に合流キャラの移動速度がばらつく
- `duration = path.length * 30` → パスの経由地点数に依存して速度がまちまちになる
- **修正:** `src/constants.ts` に `TARGET_FPS = 60` 追加。`src/store.ts` に `computeDuration()` 追加（実ピクセル距離 ÷ `MOVEMENT_SPEED_PX_PER_SEC` で統一速度を実現）。`saveCharacterAnimation` / `saveBatchCharacterAnimations` の duration 計算を差し替え

#### 問題3: フロア移動時にアイコンが別フロアの階段位置にチラつく
- `currentVisualPositions` に floor 情報がなく、LERP がフロア変化を検知できない
- **修正:** `src/hooks/useAnimationPositions.ts` の `currentVisualPositions` 型を `{ x, y, floor }` に変更してフロア変化時は LERP をスキップして即テレポート。`src/components/AnimateView.tsx` の `currentVisualPositions` useRef 型も同様に更新

#### 問題2: Chrome で長時間再生すると OOM
- **根本原因:** `ReadOnlyMapView.tsx` が単一 `<Layer>` に MapImage・エッジ・ノード・キャラアイコン (`{children}`) をすべて置いている。キャラアイコン位置の `node.x()` 呼び出しのたびに Layer 全体（マップ PNG を含む）が再描画される
- **修正:** `src/components/ReadOnlyMapView.tsx` — 静的 `<Layer listening={false}>` (マップ・エッジ・ノード) と動的 `<Layer>` (children のみ) に分割 ✅

#### TypeScript エラー 19 件を一括解消（2026-05-15）

| ファイル | 対応 |
|---|---|
| `src/components/MapView.tsx` | 孤立ファイルのため**削除** |
| `src/components/TopBar.tsx` | 存在しないストアアクション・未使用 state を除去 |
| `src/components/CreateView.tsx` | 未使用 import・未使用引数 (`_nodeId`) を修正 |
| `src/components/common/MapElements.tsx` | 未使用 `React` import を除去 |
| `src/components/modals/MergeModal.tsx` | 未使用 `useCallback` import を除去 |
| `src/utils/dijkstra.ts` | 未使用 `FloorId` import を除去 |

**結果:** TypeScript エラー 19 → 0 件

---

## 残存する既知の問題

現時点で TypeScript エラーは 0 件。未実装の機能要件は `docs/implement_function1.md` に設計済み。

---

## 次のセッションで最初にやること

`docs/implement_function1.md` の機能を優先順位順に実装する（Problem 2 は解消済み）。

### 動作確認チェックリスト

**Animate モード:**
- [ ] 再生ボタンを押し 30 秒以上連続再生してもアイコンがスムーズに動く
- [ ] **Chrome で 10 分以上再生しても OOM が発生しない**（最重要）
- [ ] フロア移動時にアイコンが目的地フロアの正しい階段位置に即座に出現する（LERP ズレなし）
- [ ] スクラバー（シークバー）をドラッグするとアイコン位置が正しく追従する
- [ ] プリセットを切り替えると時刻が 0 にリセットされ、アイコン位置も初期化される
- [ ] 再生速度変更（x0.25〜x8）が正常に機能する
- [ ] 4 ペイン表示のペインサイズが安定している
- [ ] Timeline Notes キャンバスの背景が beige（方眼紙）色で表示される

**Create モード:**
- [ ] 経由地をノード名で直接タイプしたとき、マップ上の経路が経由地を通る
- [ ] 経由地に Sync ボタン（⏱）が表示される
- [ ] Sync 後に合流したキャラが同じ速度で並走する

**Note モード:**
- [ ] キャラクターノートを複数キャラ連続で開いても OOM が発生しない
