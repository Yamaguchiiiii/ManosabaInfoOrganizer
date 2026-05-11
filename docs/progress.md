# 引き継ぎ資料 — 作業進捗

最終更新: 2026-05-10

セッション情報：
claude --resume eb765f05-3903-4b31-97f2-b04aa5ec752e

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
| **カスタム Hook** | `useAnimationLoop`, `useAnimationPositions`, `useSidebarResizer`, `useStageZoom`, `useWaypointPath` | 実装済み |
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

## 既知の残存 TypeScript エラー（未修正・機能影響なし）

以下のエラーはセッション開始時点から存在しており、今回の修正対象外。

| ファイル | エラー内容 |
|---|---|
| `src/components/MapView.tsx` | `updateCharacterMemo`・`addCharacterImage`・`removeCharacterImage`・`customImages`・`memo` が store 型に存在しない |
| `src/components/TopBar.tsx` | `setActivePreset`・`addPreset` が store 型に存在しない、未使用変数複数 |
| `src/components/common/MapElements.tsx` | `React` が未使用 |
| `src/components/CreateView.tsx` | `findShortestPath`・`nodeId` が未使用 |
| `src/components/modals/MergeModal.tsx` | `useCallback` が未使用 |
| `src/utils/dijkstra.ts` | `FloorId` が未使用 |

---

## 次のセッションで最初にやること

現在、修正待ちの既知問題はありません。  
`npm run dev` と `npm run tauri dev` で以下を確認してください。

### 動作確認チェックリスト

**Animate モード:**
- [ ] 再生ボタンを押し 30 秒以上連続再生してもアイコンがスムーズに動く
- [ ] 10 分以上再生しても OOM が発生しない
- [ ] 4 ペイン表示（Timeline Notes のグリッドモード）のペインサイズが安定している
- [ ] Timeline Notes キャンバスの背景が beige（方眼紙）色で表示される
- [ ] プリセット切り替え時にアイコン位置が正しくリセットされる

**Create モード:**
- [ ] 経由地をノード名で直接タイプしたとき、マップ上の経路が経由地を通る
- [ ] 経由地に Sync ボタン（⏱）が表示される

**Note モード:**
- [ ] キャラクターノートを複数キャラ連続で開いても OOM が発生しない

新たなバグや問題が見つかった場合は `docs/resolve_error4.md` を作成して根本原因を分析してから実装してください。
