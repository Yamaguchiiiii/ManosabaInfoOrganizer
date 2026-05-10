# 引き継ぎ資料 — 作業進捗

最終更新: 2026-05-10

# セッション情報
Resume this session with:
claude --resume b53b7d98-16ec-4fb4-b73b-085fb5471f16

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
| **Animate モード** — タイムライン付きアニメーション再生 | `AnimateView`, `AnimationTimeline`, `ReadOnlyMapView`, `CharacterSelectModal` | 実装済み・**バグあり**（後述） |
| **Note モード** — キャンバスノート (overview / preset / character / misc) | `NoteView`, `NotesPanel`, `CanvasWorkspace` | 実装済み・**バグあり**（後述） |
| **共通 UI** | `Sidebar`, `TopBar`, `SuggestionSidebar`, `PresetSelector` | 実装済み |
| **カスタム Hook** | `useAnimationLoop`, `useSidebarResizer`, `useStageZoom`, `useWaypointPath` | 実装済み |
| **ユーティリティ** | `dijkstra.ts`, `animationUtils.ts`, `mapDrawUtils.ts` | 実装済み |
| **アダプター層** | `src/services/`, `src/adapters/` | **未作成**（現時点では必要な機能なし） |

---

## 確認済みバグ（修正済み）

### バグ1: Animate モードでキャラクターアイコンの動きがカクカクする

**根本原因:**

1. `AnimateView.tsx:32` — `useAppStore()` をセレクタなしで使用しており、`currentTime` が毎フレーム更新されるたびにコンポーネント全体が再レンダリングされる
2. `AnimateView.tsx:59-108` — `useMemo(activeCharData)` が `currentTime` を依存に持つため、毎フレーム `calculateRawPosition()` (O(n)) + `getCollisionOffsets()` (O(n²)) が再実行される
3. `AnimateView.tsx:110-112` — `targetPositionsRef` の更新が `useEffect`（コミット後の非同期実行）なため、LERP ループが 1 フレーム古い値を読む

**修正状況:** **完了（2026-05-10）** — `useAnimationPositions.ts` 新規作成、`AnimateView.tsx` 全面改修済み

---

### バグ2: キャラクターノートで 2 枚目以降のキャラクターを開くと Out of Memory エラー

**根本原因:**

1. `NoteView.tsx:1260-1282` の `initDefaultImage` エフェクトが `notes.characters` を依存に持つ
2. `store.ts:190-219` の `updateCanvasState` が、内容変化なしでも必ず新しい `notes.characters` オブジェクト参照を生成する（`{ ...newNotes.characters, [targetId]: canvas }` のスプレッド）
3. 新参照 → エフェクト再実行 → `addNoteAsset` → 新参照 → … の無限ループが形成される
4. ループ中に `getImageSizeFromUrl` が N 回呼ばれ、画像ロード完了時に N 個の `addNoteObject` が一斉発火 → キャンバスに N 個の重複 `NoteObject` が蓄積
5. N 個の Konva ノード（`KonvaImage`）が生成されてメモリを圧迫 → OOM
6. キャラクターを切り替えるたびに `notes.characters` が肥大化し、React レンダーが遅くなり N が増える自己増幅的な悪化

**修正状況:** **完了（2026-05-10）** — `NoteView.tsx` の `initDefaultImage` エフェクト修正、`store.ts` の `updateCanvasState` 早期リターン追加、`addNoteAsset` 事前重複チェック追加済み

---

## 修正計画（すべて完了）

`docs/resolve_error.md` に詳細な実装ステップを記載済み。以下は概要。

### バグ1 修正（4ファイル）

| Step | ファイル | 作業内容 |
|---|---|---|
| 1 | `src/hooks/useAnimationPositions.ts` | **新規作成** — 位置計算 + LERP + Konva 直接操作の統合 Hook |
| 2 | `src/components/AnimateView.tsx:32` | `useAppStore()` → 個別セレクタに変更。`currentTime` を除外 |
| 3 | `src/components/AnimateView.tsx:40-44` | `useMemo(nodesMap)` → `useRef` + `useEffect` に変更 |
| 4 | `src/components/AnimateView.tsx` | `useMemo(activeCharData)` + 2つの `useEffect` を削除し Hook 呼び出しに置き換え |
| 5 | `src/components/AnimateView.tsx` | `renderFloorChars` → 全キャラ全フロア事前レンダリング方式に変更 |

### バグ2 修正（2ファイル）

| Step | ファイル | 作業内容 |
|---|---|---|
| 7 | `src/components/NoteView.tsx:1260-1282` | `initializedCharsRef = useRef<Set<string>>(new Set())` を追加し、依存配列から `notes.characters` を除去 |
| 8 | `src/store.ts:190-219` | `updateCanvasState` に早期リターン追加（内容変化なし時に参照を生成しない） |
| 9 | `src/store.ts` `addNoteAsset` | 呼び出し冒頭に重複チェックを追加し、重複なら履歴保存も state 更新もスキップ |

**推奨実装順序:** バグ2（Step 7→8→9）を先に修正してからバグ1（Step 1→2→3→4→5）を対応する。バグ2のほうがクラッシュするため優先度が高く、修正範囲も局所的で確認しやすい。

---

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | プロジェクト規約（クロスプラットフォーム設計・コーディング規約・レスポンシブ規約） |
| `docs/architecture.md` | 実装状況の把握内容 + 確認済みバグの根本原因分析（詳細） |
| `docs/resolve_error.md` | バグ修正の実装ステップ（コードレベルの具体的な手順） |
| `docs/progress.md` | 本ファイル（引き継ぎ資料） |

---

## 次のセッションで最初にやること

両バグの修正は完了。次回は以下を実施する。

1. `npm run dev` でブラウザを開き、Animate モードを再生してスムーズに動くか確認
2. キャラクターノートで全 13 キャラを順番に開いてクラッシュしないか確認
3. 問題なければ `npm run tauri dev` でデスクトップ版も確認
4. その後、新機能追加や残存する TypeScript エラー（MapView.tsx / TopBar.tsx）の対応などを検討する


