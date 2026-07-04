# UI全面見直し指示書（UX主導リデザイン）

最終更新: 2026-07-03
状態: 設計のみ・未実装。Opus がこのままフェーズ順に実装できる粒度で記述する。
関連: モバイル専用の構造設計は `docs/implement_function/smartphone.md`、性能は `docs/resolve_error/19.md` 共通原因A を先に読むこと。

---

## 0. 前提と非目標

- 対象: デスクトップ(Tauri)・PCブラウザの UI。スマホレイアウトは smartphone.md 側で定義（本書のトークン/コンポーネントはそちらでも共用する土台になる）。
- **非目標（壊さないこと）**: store のデータ構造・Konva キャンバスの座標系・経路計算ロジック・`data-tour` ターゲット（変更する場合は `tourTargets.ts` と STEPS を同時更新）・既存ショートカット。
- 検証: 各フェーズ完了ごとに `npx tsc -p tsconfig.json --noEmit` → `npm run build` → `npm run dev` / `npm run tauri dev` の両起動確認。

## 1. 現状のUX課題（コード監査から）

1. **スタイルの一貫性がない**: ほぼ全コンポーネントがインラインstyle。灰色だけで `#111/#1e1e1e/#222/#252526/#2d2d2d/#333/#3a3a3a/#444/#555` が混在し、同じ意味のボタンが場所ごとに違う見た目（例: Tools のボタン vs WaypointPanel のボタン vs モーダルのボタン）。
2. **発見可能性が低い**: 重要操作が右クリック（レイヤー/色変更）、ホバー（Create の編集対象フロア、misc の削除ボタン visibility:hidden）、暗黙ショートカットに依存。CLAUDE.md の「hover のみに依存させない」規約に反する箇所が残る。
3. **フィードバック不足**: 保存は無音（persist は 500ms debounce なのに保存状態表示がない）。コピー/貼り付け/グループ化も無音。破壊的操作（Delete Selected、プリセット削除）の見た目が場所により異なる。
4. **フローティング窓が作業領域を覆う**: WaypointPanel（Create 右下固定）がマップ右下ペインに常時被る。画像一覧ギャラリーは移動可能にしたが、そもそもドック先がない。
5. **サイドバーの役割過積載**: グローバルナビ（PAGE）・キャラ選択（ICONS）・モード設定（Create Tools/💀）・ヘルプが1カラムに同居し、視線移動が長い。
6. **ブランド不在**: `index.html` の title が「Tauri + React + Typescript」のまま。favicon は vite.svg。ロゴは入ったが配色・見出し書体に反映されていない。

## 2. デザイントークン（P0・最優先）

`src/styles/_tokens.scss` を新設し、**CSS カスタムプロパティ**として `:root` に注入（SCSS 変数でなく CSS 変数にするのは、テーマ切替とインラインstyleからの参照を可能にするため）。既存の App.scss 変数はこのトークンへ移行する。

```scss
:root {
  /* 面（暗い順にレイヤー番号） */
  --surface-0: #141414;   /* workspace 背景（現 #111 統合） */
  --surface-1: #1e1e1e;   /* ビュー背景 */
  --surface-2: #252526;   /* サイドバー/パネル */
  --surface-3: #2f2f33;   /* カード/入力欄（現 #2d2d2d,#333 統合） */
  --surface-4: #3a3a40;   /* hover（現 #3e3e42,#3a3a3a 統合） */
  --border-default: #3e3e42;
  --border-strong: #55555c;
  /* テキスト */
  --text-primary: #e6e6e6; --text-secondary: #a9a9b0; --text-disabled: #6b6b72;
  /* アクセント: 魔法少女×法廷 = 夜色+金。既存の #007acc は info/選択に残す */
  --accent: #7c5cff;            /* 主アクション（紫: 魔法） */
  --accent-hover: #6a4be6;
  --focus: #66b3ff;             /* 選択・フォーカス（既存の青系を統合） */
  --gold: #d4a94f;              /* 見出し飾り・DONE 系 */
  --danger: #ef4444; --success: #10b981; --warning: #f59e0b;
  /* 寸法 */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
  --radius-1: 4px; --radius-2: 8px; --radius-3: 12px;
  --hit-target: 32px;           /* デスクトップ最小。タッチは 44px（smartphone.md） */
  /* 文字 */
  --font-ui: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  --fs-xs: 0.75rem; --fs-sm: 0.85rem; --fs-md: 1rem; --fs-lg: 1.15rem;
  /* 動き */
  --dur-fast: 120ms; --dur-med: 200ms; --ease: cubic-bezier(.2,.8,.2,1);
  /* 重なり */
  --z-panel: 100; --z-float: 1000; --z-modal: 2000; --z-toast: 3000; --z-tour: 100000;
}
```

- 導入手順: (1) `_tokens.scss` 作成・`App.scss` 冒頭で `@use`。(2) App.scss / NoteView.scss / AnimateView.scss / Modal.scss の色・余白リテラルをトークン参照へ置換。(3) インラインstyleは**P1 の共通コンポーネント化と同時に**トークン参照へ寄せる（一括置換はしない。コンポーネント化した所から順に）。
- アクセント色の適用範囲: 主ボタン（Save Path・決定・＋）を `--accent`、選択状態（active タブ・選択枠・フォーカス）は `--focus` に統一。**Konva キャンバス内の描画色は変更しない**（ユーザーデータ）。

## 3. 共通UIコンポーネント（P1）

`src/components/ui/` を新設。**純粋な描画コンポーネントのみ**（CLAUDE.md 規約: ロジックは持たない）。

| コンポーネント | 置き換え対象 | 仕様要点 |
|---|---|---|
| `Button` | 全 ad-hoc `<button>` | variant: `primary/ghost/danger/toggle`, size: `sm/md`, `active`, `disabled`。最小高 `--hit-target` |
| `IconButton` | 💀, ×, ✏️, 🗑️ 等 | 必ず `title` + `aria-label` 必須にする（型で強制） |
| `Panel` / `SectionTitle` | Tools/Images の h3 群, section-title | SectionTitle は border-bottom 付き（`.char-sidebar h3` の見た目を昇格） |
| `Field` (`Select`/`NumberInput`/`Slider`/`ColorField`) | WaypointPanel・Tools の生 input | ColorField はスウォッチ+ピッカーで `commitThrottled` 相当を内蔵 |
| `Chip` | TopBar の DONE/TODO, sync 一覧 | removable (×) 対応 |
| `EmptyState` | 「Empty」「No misc notes available.」 | アイコン+一言+主アクション |
| `FloatingWindow` | 画像一覧/再生操作盤の共通化 | ドラッグハンドル・閉じる・位置記憶(prop) |
| `Toast` + `src/services/toast.ts` | 無音操作の通知 | `toast.show(msg, {type})`。DialogHost と同様 store or モジュールstateで管理、`--z-toast` |

- 実装順: Button/SectionTitle/Field → WaypointPanel を移植 → NoteView Tools を移植 → モーダル群 → TopBar/Chip。
- `DialogHost` は既存のまま variant 拡張（`danger` ボタンは `--danger`）。**window.alert 系は既に撤廃済**なので新規導入禁止を維持。

## 4. グローバルレイアウト再構成（P2）

現行: `Sidebar(可変幅200-250px) + main-content(TopBar? + workspace)`。これを次に改める:

```
┌──┬───────────────────────────────┐
│N │ ContextBar（ビュー名+文脈操作+保存状態）      │
│a ├───────────────────────────────┤
│v │                               │
│R │            workspace          │
│a │                               │
│i │                               │
│l ├───────────────────────────────┤
│  │ （ビュー固有の下部バー: Animate再生バー等）   │
└──┴───────────────────────────────┘
```

1. **NavRail（新規 `src/components/NavRail.tsx`、幅64px固定）**: 上からロゴ（`./logo.PNG` を 40px 角にトリム表示）、Create/Animate/Note のアイコン+短ラベル縦積み（active は `--focus` の左バー）、最下部に ?（HelpButton をここへ統合。`data-tour="help-button"` 維持）。`data-tour="sidebar-pages"` は NavRail のページ群 wrapper に移す。
2. **ContextPanel（現 Sidebar の残り、幅 220-280px 可変・折りたたみ可）**: ビューごとに内容を出し分け:
   - Create: ICONS（`data-tour="sidebar-icons"` 維持）+ 💀トグル + Edit Map Graph
   - Animate: ICONS（読み取り専用・死亡表示）
   - Note: ノート種別ツリー（`data-tour="note-tabs"` 維持）
   - ヘッダに ◀ 折りたたみボタン（折りたたみ状態は store `ui.contextPanelCollapsed` に persist）
3. **ContextBar（高さ40px・新規）**: 左=ビュー名とパンくず（例: `Note / キャラクターノート / 桜庭エマ`）、中央=ビュー固有（Create は現 TopBar の DONE/TODO Chip 群と PresetSelector を移設）、右=**保存状態インジケータ**（`保存済み ✓` / `保存中…`。persist の書き込み完了イベントを `src/services/persistStatus.ts` 経由で購読。19.md P1 実装とセットで）。
4. 既存 `TopBar.tsx` は ContextBar に吸収して削除。`useSidebarResizer` は ContextPanel 側で続投。
5. `AnimateView` の `setSidebarWidth(MIN_SIDEBAR_WIDTH)` 強制は廃止し、ContextPanel の折りたたみで代替する。

## 5. ビュー別リデザイン（P3）

### 5.1 Create

- **WaypointPanel を右ドック化**: `position:absolute 右下` のフローティングをやめ、workspace 右端に幅 300px のドックパネル（`RouteDock`）として常設（折りたたみ→タブ化可）。4ペインのマップを覆わなくなる。SuggestionSidebar（地点候補）は RouteDock 内の上部に統合し「地点を選択中」の文脈を1カラムに閉じる。
- **経路の段階表示**: パネル上部に `Start → 経由地 ×n → Goal` のステッパー。現在ターゲット中のボックスを `--focus` で明示（クリック対象の迷いを消す）。
- **sync の可視化**: syncConstraints を `Chip`（`⏱ 地点X で 花菱レイアと合流 ×`）のリストで表示。マップ上の該当ノードにも ⏱ バッジを描画（`MapObjectLayer` に小さな Konva.Text 追加）。
- Save Path / Delete は `Button primary / danger` を右下固定行に。保存成功時に `toast('経路を保存しました')`。

### 5.2 Animate

- **再生バーを下部ドックに**: フローティング操作盤を workspace 下端の固定バー（高さ56px）へ変更（`FloatingWindow` としての切り離しはオプションで残す: 📌ピン留めトグル）。行構成は要件どおり `プリセット | 速度 | ▶ / 現在時刻 | シークバー | 総時間`。
- **シークバーに sync マーカー**: 各キャラの syncConstraints の meetingTime 位置に点を打ち、ホバー/クリックでツールチップ（誰と誰がどこで）。データは activePreset から算出（`animationUtils.resolveStartTimes` 使用）。
- **キャラ凡例**: ContextPanel の ICONS に「移動中/待機/死亡（グレースケール+横線）」の状態を反映。クリックでそのキャラを全ペインでハイライト（追跡）。
- 右下の事件ノートペインへッダに「Note ページで開く ↗」リンク（`enterMode('note')`+`setActiveNoteTab('preset')`）。

### 5.3 Note

- **Tools サイドバーを SectionTitle で区画化**: `配置（Image/Text/ペン/図形grid）` `選択中（縦横比/Layer/Group/Delete）` `Images` `Character Images`。選択中セクションは**選択があるときだけ**出す（今は縦に伸びて迷子になる）。
- **選択コンテキストバー**: キャンバス上部に薄いバー（高さ36px）を出し、選択中オブジェクトの色/線幅/フォントサイズ/太字を置く。**右クリックメニュー依存を解消**（右クリックは残すが同機能をバーにも）。
- 4ペイン関連（グリッド表示/編集トグル）はキャンバス右上のセグメンテッドコントロールに統一（現在ボタンの場所が発見しにくい）。
- 画像一覧（compact/Animate 内）は `FloatingWindow` 共通実装に乗せ替え、位置を localStorage でなく store（persist）に記憶。
- 「メモ」タブの Rename/Delete は misc select 横の IconButton に（現在の2段ボタン行を1行に）。

## 6. インタラクション規約（全フェーズ共通のDoD）

1. hover 依存の操作すべてに常設代替を用意（例: misc の削除は常時表示の IconButton に。Create の「ホバー=編集対象フロア」は**最後にクリック/操作したペイン**も編集対象として保持し、ペイン左上に `編集中` バッジを常時表示）。
2. すべての操作可能要素: `cursor:pointer` + `:focus-visible` リング（`outline: 2px solid var(--focus)`）+ `title`。
3. 破壊的操作は必ず `DialogHost` 確認 + `danger` ボタン + toast で結果通知。
4. ショートカットは tooltip に併記（`title="コピー (Ctrl+C)"` 形式を全ボタンに）。ヘルプドロワーの一覧（`data/shortcuts.ts`）と自動同期できるよう、ラベル文字列は shortcuts.ts から import する。
5. `index.html`: `<title>魔法少女の魔女裁判 推理ノート</title>`（仮・要ユーザー確認）、favicon を `./logo.PNG` から生成した `favicon.ico`/`icon.png` に差し替え。

## 7. 実装フェーズまとめ

| フェーズ | 内容 | 主な変更ファイル | 完了条件 |
|---|---|---|---|
| P0 | トークン導入 | `styles/_tokens.scss`(新), 各scss | 見た目ほぼ不変で色/余白がトークン参照になる。tsc/build 緑 |
| P1 | ui/ コンポーネント + Toast | `components/ui/*`(新), `services/toast.ts`(新), WaypointPanel, NoteView Tools, モーダル | ad-hoc button が主要画面から消える。保存/コピー時に toast |
| P2 | NavRail + ContextPanel + ContextBar | `NavRail.tsx`(新), `Sidebar.tsx`(改), `TopBar.tsx`(削), `App.tsx` | 3ビュー遷移・data-tour・チュートリアルが全て動く |
| P3 | ビュー別（Create ドック→Animate バー→Note 区画化） | CreateView, AnimateView, NoteView ほか | 各ビューの主要フローが被り物なしで完結 |
| P4 | 仕上げ | index.html, focus リング, tooltip 総点検 | 規約6のチェックリスト全通過 |

- 各フェーズは独立コミット。P2 完了時は**チュートリアル全ステップ実走**（ハイライト位置崩れの回帰確認）を必須とする。
- 性能改修（19.md 共通原因A P1）は本リデザインの**前**に入れること。ContextBar の保存状態表示が persist 改修のイベントに依存するため。
