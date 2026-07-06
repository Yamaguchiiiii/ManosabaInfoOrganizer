# 未実装項目の整理（2026-07-05 時点）

対象ブランチ: `work/perf-image-ui-foundations`（main は trunk 運用、ff-merge 可）。
実装済みは各文書＋`docs/resolve_error/19.md`、進捗の全体像はこのファイル。凡例:
- 🟢 = この環境（preview/build/test）で検証できる
- 🔴 = 実機のマルチタッチ等が必要で、この環境では安全に検証できない

---

## 1. docs/resolve_error/19.md（06/30 症状）

| 項目 | 状態 |
|---|---|
| 共通原因A P1（persist改修）/ P2（画像Blob分離）/ #1,#3,#8,#9,#10 / #4-7(frame drop) | ✅ 実装済 |
| **#2 hands-on チュートリアル**（ツアーエンジン拡張: 穴あきマスク・達成判定・tutorialBus・全18ステップ） | ⬜ 🟢 未実装（大） |

---

## 2. docs/implement_function/ui.md

| 項目 | 状態 |
|---|---|
| P0 トークン / P2 NavRail+ContextPanel+ContextBar / P3(アクセント・syncマーカー・ターゲット強調・Note区画化) | ✅ 実装済 |
| P1 Toast / :focus-visible | ✅ 実装済（一部） |
| **P1 残: 共通コンポーネント群**（Button/IconButton/Field/Panel/SectionTitle/Chip/EmptyState/FloatingWindow）と全 ad-hoc ボタンの差し替え | ⬜ 🟢 未（中〜大） |
| **P3 残（ビュー別再構築・大きめ）**: Create WaypointPanel→RouteDock 化 / Animate 再生バーの下部ドック固定化 / Note キャンバス上部の選択コンテキストバー / 4ペイントグルのセグメント化 / 画像一覧の FloatingWindow 統一 / メモ Rename・Delete のアイコン化 | ⬜ 🟢 未 |
| **P4 仕上げ**: favicon を logo から専用生成（現状 `/logo.png` 参照のみ）/ tooltip 総点検 | ⬜ 🟢 未（小） |

---

## 3. docs/implement_function/smartphone.md

| 項目 | 状態 |
|---|---|
| M0 シェル / M1 Note / M2 Animate / M3 Create | ✅ 実装済 |
| E1 多タブ競合 / E2 ストレージ健全性 / E5 画像失敗 / E4安全部(touch-action) / B-7 PWA | ✅ 実装済 |
| **タッチ ピンチズーム / 2本指パン**（TouchMapStage 相当） | ⬜ 🔴 未 |
| **E3 ソフトキーボード/回転**（visualViewport 退避・ジェスチャ中の canvasSize 保留） | ⬜ 🔴 未 |
| **E4 完全版**（Konva ゴーストマウスイベント抑止・長押し右クリック `useLongPress`） | ⬜ 🔴 未 |
| PWA アイコンの 192/512 最適化（現状 logo.png 流用） | ⬜ 🟢 未（小） |
| （設計時の理想形との差）Note の InsertSheet/ObjectStyleSheet/SelectionBar・Create の RouteEditorSheet 等の「専用モバイルビュー」は未構築。現状は既存ビューを compactMode/単一フロアで流用する軽量版 | ⬜ 🟢 任意 |

---

## 4. docs/implement_function/refactoring.md

| 項目 | 状態 |
|---|---|
| A-1 / A-5コア / A-6 / A-8(一部) / A-9(vitest計25) / B-1〜B-7 全て（B-4 PNG書出 / B-5 sync検証 / B-6 遭遇検出 含む） | ✅ 実装済 |
| **A-2 store 分割**（uiSlice/mapSlice/presetSlice/noteSlice、`src/store/`化） | ⬜ 🟢 未（中） |
| **A-3 selectedIcons の store 移管**（現状は App ローカル state を props drilling） | ⬜ 🟢 未（中・smartphone M0 の推奨先行と同一） |
| **A-4 巨大ファイル分割**（NoteView 2,368行 / CreateView を小コンポーネント+hooks へ） | ⬜ 🟢 未（大） |
| A-5 残: NoteView 内部の Konva イベント `any` 約16箇所（内部 config builder。A-4 分割時に対応推奨） | ⬜ 🟢 未（小） |
| A-7 画像のモジュールキャッシュ（`imageCache.ts`、遷移の再デコード排除） | ⬜ 🟢 未（小〜中） |
| A-8-6 NOTE_CANVAS 定数の集約（`constants.ts`へ） | ⬜ 🟢 未（小） |

---

## 推奨の進め方

refactoring.md の追加機能 B-1〜B-7 はすべて実装済み。残りは主に保守性リファクタと大型UI。

**この環境で検証できる🟢:**
1. A-7（画像キャッシュ）/ A-8-6（定数集約）/ A-5残（Konva any） — 小さな最適化
2. A-2 → A-3 → A-4（store分割 / selectedIcons移管 / 巨大ファイル分割）— 保守性の土台（大）
3. ui.md P1 コンポーネント化 / P3 残 / 19.md #2 hands-on チュートリアル（大・視覚レビュー前提）

**🔴 実機必要:** タッチ ピンチズーム / E3 / E4完全版 / PWAアイコン最適化

**実機が要る（🔴、環境が整ったとき）:**
- タッチ ピンチズーム/パン、E3 キーボード、E4 完全版
