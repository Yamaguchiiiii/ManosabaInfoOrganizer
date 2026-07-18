# _smartphone_address — スマホブラウザのアドレスバーで下部ナビ（タブバー）が隠れる（Sonnet5 引き継ぎ実装指示書・詳細版）

最終更新: 2026-07-18（コード未変更・原因調査済み）
対象症状: iOS Safari / Android Chrome などスマホのブラウザで本アプリ（Web版）を開くと、ブラウザ上部のアドレスバー（URLバー）や下部ツールバーが表示されている間、**画面下部の固定ナビゲーション（Create/Animate/Note のタブバー）がブラウザUIの裏に潜り込み、隠れて押せなくなる**。
行番号・シンボルは 2026-07-18 時点の working tree（ブランチ `main`、直近コミット `e6dce35`）基準。行番号がずれても追えるよう **grep 用アンカー文字列**を併記する。

> このドキュメントは「調査済み・実装未着手」。Sonnet5 はまず §0（前提知識）を読んで原因の理屈を掴んでから §A を実装すること。§A だけで症状は解消する。§B は再発予防、§C は旧端末向けの保険。

| No | 症状 | 区分 | 対応 | 見積り |
|---|---|---|---|---|
| 1 | スマホブラウザのアドレスバー/ツールバー表示中に下部タブバーが隠れる | バグ（原因特定済み） | §A（必須） | 1ファイル・2行 |
| 2 | 同種の「vh 基準で URL バー分はみ出す」フルスクリーン要素の掃討 | 予防 | §B（推奨） | 3ファイル・各1〜2行 |
| 3 | 旧ブラウザ（Safari <15.4 等）まで確実に守る堅牢化 | 任意 | §C（オプション） | App.tsx に effect 1つ + CSS 1行 |

検証コマンド（§A/§B/§C 共通）:

```
npx tsc -p tsconfig.json --noEmit
npm run build
```

（`npx tsc` を引数無しで打たないこと。`-p tsconfig.json --noEmit` 必須。テストがあれば `npx vitest run` も）
\+ preview 実機/エミュレーション確認（**必ずモバイル幅 375px で、かつ「アドレスバーが表示された状態」で確認**。方法は §検証手順を厳守）。

---

## §0 前提知識: なぜ `100vh` だとアドレスバーで下端が隠れるのか（確定・理屈）

### 0-1. モバイルのビューポート単位

モバイルブラウザのビューポート高さには複数の定義があり、CSS の高さ単位もそれに対応する（W3C CSS Values Level 4 の large/small/dynamic viewport）:

| 単位 | 意味 | アドレスバー**表示中**の高さ | アドレスバー**引っ込み中**の高さ |
|---|---|---|---|
| `vh` / `100vh` | **Large viewport**（`lvh` と同じ）。バーが引っ込んだ最大状態で固定 | **可視領域より大きい**（＝はみ出す） | 可視領域と一致 |
| `svh` | **Small viewport**。バーが出た最小状態で固定 | 可視領域と一致 | 可視領域より小さい（下に隙間） |
| `dvh` | **Dynamic viewport**。今の可視領域に追従して伸縮 | 可視領域と一致 | 可視領域と一致 |

`100vh` は「アドレスバーが引っ込んだ状態の高さ」で常に固定される。そのため**アドレスバーが表示されている間は、`100vh` の箱は可視領域より縦に長くなり、箱の下端が画面外（ブラウザUIの裏）へ押し出される**。

### 0-2. なぜ「下端のタブバー」だけが消え、上部バーは消えないのか

`.mobile-shell` は `display: flex; flex-direction: column;` の縦積みコラム（`src/components/mobile/MobileShell.tsx`）。中身は上から:

```
┌─ .mobile-shell (height: 100vh) ──────────┐
│  .mobile-appbar     (height: 44px, flex-shrink:0)   ← 画面上端に張り付く
│  .mobile-workspace  (flex: 1)             ← 余った高さを全部もらう（Konvaマップ）
│  .mobile-tabbar     (flex-shrink:0)       ← コラム末尾。100vhの一番下に置かれる
│  .mobile-workspace より下 …
└──────────────────────────────────────────┘
```

コラムの起点は画面上端（＝可視領域の上端）に一致するので上部バーは常に見える。一方コラムの全長が `100vh`（可視領域より長い）なので、**末尾の `.mobile-tabbar` はコラムの一番下＝可視領域の外側に配置され、アドレスバーの裏に隠れる**。`flex:1` の workspace が可視領域外までの余剰高さを吸ってしまうため、タブバーが下へ押し出される、という構図。

→ 対策は「コラム全長を可視領域ちょうどにする」こと。＝ `.mobile-shell` の高さを `dvh`（可視領域追従）にすれば末尾のタブバーが常に画面内に収まる。

### 0-3. 本アプリでの発生箇所（確定）

`src/styles/App.scss` L382-388（grep: `.mobile-shell {`）:

```scss
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;              // ← ★原因。ここだけが取り残されている
  width: 100vw;
  overflow: hidden;
  background-color: var(--surface-1);
```

`.mobile-shell` を描画するのは `src/App.tsx` L141-152（grep: `if (viewport === 'mobile')`）のモバイル分岐のみ。`useViewport() === 'mobile'`（<768px）でしか通らないので、PC には影響しない。

### 0-4. 既に入っている関連対策（＝これらは原因ではない／触らない）

調査で確認済みの「もう入っているもの」。混同して二重に直さないこと:

- `index.html` L6（grep: `<meta name="viewport"`）に **`viewport-fit=cover` は既にある** → `env(safe-area-inset-bottom)` は有効化済み。セーフエリア余白の仕組み自体は機能する。**meta は変更不要**。
- `.mobile-tabbar` L450（grep: `padding-bottom: env(safe-area-inset-bottom)`）でホームバー分の余白は確保済み。
- `.bottom-sheet` L657-661（grep: `max-height: 90dvh`）は**既に `dvh` フォールバック済み**。

> つまり **dvh 対応の前例（bottom-sheet）はプロジェクト内に既にあり、シェル本体だけが `100vh` のまま取り残されている**。本修正は「その前例と同じ2連記パターンをシェルへ適用するだけ」。新概念は不要。

---

## §A 【必須】`.mobile-shell` の高さを `100dvh`（`100vh` フォールバック付き）にする

非スクロールのアプリシェル（`overflow: hidden`、workspace が flex 伸縮でページ自体はスクロールしない）なので、**ページ内スクロールでアドレスバーが出入りしてガタつく心配がない**。可視領域にちょうど収まる `dvh` が最適（`svh` だとバー引っ込み時に下に隙間が空く）。

### A-1. 実装（`src/styles/App.scss`・1箇所）

L385（grep: `.mobile-shell {` ブロック内の `height: 100vh;`）を **1行 → 2行に置換**。

**変更前:**

```scss
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
```

**変更後:**

```scss
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;        // フォールバック（dvh 非対応の古いブラウザ用）
  height: 100dvh;       // アドレスバー表示中も可視領域にちょうど収める #smartphone_address-A
  width: 100vw;
  overflow: hidden;
```

これだけ。編集は `height: 100vh;` の直後に `  height: 100dvh;` の1行を挿入するのと同義（既存行は消さない）。

### A-2. なぜこれで直るか / 副作用の確認ポイント

- **CSS の後勝ち解決**: 同一セレクタ内で同名プロパティを2回書くと、ブラウザは「自分が解釈できる最後の宣言」を採用する。`dvh` を知らない古いブラウザは2行目を無視して1行目(`100vh`)を、知っているブラウザは2行目(`100dvh`)を使う。SCSS は両行をそのまま CSS へ出力する（変換しない）。既存 `.bottom-sheet` L657-658 と全く同じ書き方なので、プロジェクトの既存パターンに一致。
- **Konva マップの再サイズは自動で追従する（追加対応不要）**: アドレスバーの出入りで `100dvh` が変化 → `.mobile-workspace`（flex:1）の高さが変わる → `CreateView.tsx` の `FloorPane` が持つ ResizeObserver が発火 → Konva `Stage` の width/height が再計算される。既存の仕組みでカバーされるので、追加コードは不要。**「バー出入り時にマップが一瞬リサイズされる」のは正常挙動**（レイアウトが壊れるわけではない）。
- **`width: 100vw` は変更しない**: 横方向はアドレスバーの影響を受けない。`dvw` に変えると縦スクロールバー幅ぶんずれる端末があるため、あえて据え置く。
- **セーフエリア余白は維持される**: `.mobile-tabbar` の `padding-bottom: env(safe-area-inset-bottom)` はそのまま効く。dvh 化してもホームバー分の下余白は残る。

### A-3. §A 受入条件

1. `npx tsc -p tsconfig.json --noEmit` / `npm run build` 成功（SCSS のみの変更だが、ビルドが通ることの確認）。
2. **iOS Safari 実機で 375px 相当**、ページ読み込み直後（＝アドレスバーが大きく表示された状態）で、下部タブバー（Create/Animate/Note）が**画面内に全部見え、3つともタップできる**。
3. 画面内を少しスクロール/操作してアドレスバーが縮んだ状態でも、タブバーが可視のまま（`dvh` が追従して隙間も欠けも生じない）。
4. Android Chrome でも同様（下部ツールバー表示中でもタブバーが隠れない）。
5. ノッチ/ホームバー端末（iPhone X 以降）で、タブバーの下にセーフエリア余白が残り、ホームバーと重ならない（`env(safe-area-inset-bottom)` の非退行）。
6. **デスクトップ 1280px 非退行**: `.mobile-shell` はモバイル分岐でしか描画されないため PC レイアウト（`.app-container`）には無影響。念のため PC 表示が従来どおりであることを確認。

---

## §B 【推奨】同種の `vh` 依存箇所の掃討（フルスクリーン要素のみ）

「画面いっぱいに広げる」意図の `100vh` は同じ理由でスマホでずれる。**フルスクリーン用途の外枠だけ** `dvh` フォールバックへ揃える。
**内部スクロール領域の `max-height: NNvh`（候補リスト・ガント・タイムライン等）は触らない**——多少の伸縮が実害にならず、変えるとレイアウトが変わる副作用のほうが大きいため。対象外リストは B-4 に明記。

### B-1. `src/styles/Modal.scss` L8（モーダルオーバーレイ外枠）

grep: `height: 100vh;`。**変更前:**

```scss
  height: 100vh;
```

**変更後:**

```scss
  height: 100vh;
  height: 100dvh;   // #smartphone_address-B: URLバー表示中もオーバーレイが可視領域に収まる
```

### B-2. `src/components/create/FollowConfirmModal.tsx` L29（インライン全画面オーバーレイ）

grep: `height: '100vh'`。インライン style は同名2連記が書けないので `dvh` へ単純置換する（`dvh` 非対応ブラウザは今や稀で、かつ中身は中央寄せなので実害小）。**変更前:**

```tsx
        <div className="modal-overlay" style={{ zIndex: 2000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
```

**変更後**（`height: '100vh'` → `height: '100dvh'` の1トークンのみ変更）:

```tsx
        <div className="modal-overlay" style={{ zIndex: 2000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
```

### B-3. `src/components/common/LoadingScreen.tsx` L28（起動/遷移ローディング全面）

grep: `height: overlay ? undefined : '100vh'`。**変更前:**

```tsx
                height: overlay ? undefined : '100vh',
```

**変更後:**

```tsx
                height: overlay ? undefined : '100dvh',
```

（`overlay` 版は `undefined`＝親サイズに従うので元から影響なし。非 overlay の全画面版のみ `dvh` に。）

### B-4. 触らないもの（意図的に対象外）

以下は「フルスクリーン外枠」ではなく「パネル内スクロール領域の上限」なので**変更しない**:

- `src/styles/App.scss` L84（grep: `.app-container` の `height: 100vh;`）→ **PC/タブレット専用レイアウトの外枠**。PC ブラウザにアドレスバー隠れ問題は無い。触ると PC の高さ挙動を変えるリスクだけ。
- `src/styles/App.scss` L578 `max-height: 34vh;` / L657-661 `.bottom-sheet`（既に dvh 済み）
- `src/styles/components/_waypoint-panel.scss` L31 `max-height: 45vh;` / L298 `max-height: 30vh;`
- `src/styles/AnimateView.scss` L17 `max-height: 45vh;`
- `TimelineGantt.tsx` L72 `maxHeight: '35vh'` / `AnimationTimeline.tsx` L235 `maxHeight: '28vh'` / `ContextPanel.tsx` L155 `maxHeight: '32vh'` / `CharacterSelectModal.tsx` L60 `maxHeight: '60vh'` / `ImageGalleryWindow.tsx` L23 `maxHeight: '45vh'`

### B-5. §B 受入条件

- 変更した各オーバーレイ（Modal / FollowConfirm / LoadingScreen 非overlay）がモバイルでアドレスバー表示中も画面内に収まる。デスクトップで見た目が不変。
- `npx tsc -p tsconfig.json --noEmit` / `npm run build` 成功。

---

## §C 【任意】旧ブラウザまで守る JS ベースの堅牢化（`--app-height`）

Safari 15.4 未満・Chrome 108 未満など `dvh` 非対応の古い端末まで確実に守りたい場合のみ。CLAUDE.md 準拠（プラットフォーム直接判定はせず、純粋なビューポート計測のみ。`window.__TAURI__` 等は使わない）。**2026年時点では §A の `dvh` だけで実質全端末をカバーできるため、「古い端末での不具合報告が実際に出たら入れる」方針で良い。**

### C-1. なぜ `window.innerHeight` を基準にするか

`window.innerHeight` はモバイルでアドレスバーの出入りに追従して変化する（＝実質 `dvh` 相当）。かつ**iOS ではソフトキーボード表示で縮まない**（縮むのは `visualViewport.height` のみ）。シェル全体の高さ基準としては「キーボードで縮まない」ほうが望ましい（キーボードで下タブが飛び上がるのを防げる）ので、`window.innerHeight` を採用する。

### C-2. 実装（`src/App.tsx`）

既存の effect 群（テーマ切替 effect、L61-63 `document.documentElement.dataset.theme = theme;`）の**直後**に、新しい effect を1つ追加する。`useEffect` は L1 で import 済み。

grep 挿入位置アンカー（この effect の閉じ `}, [theme]);` の直後）:

```ts
    // F6: テーマ切替（ダーク/セピア）。Konva内の色・紙面は対象外、DOM UIのみCSS変数で切り替える。
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
```

追加する effect:

```ts
    // #smartphone_address-C: スマホのアドレスバー出入りに追従する実高さを CSS 変数へ。
    // dvh 非対応ブラウザ用の保険。window.innerHeight を使う（iOS ではソフトキーボードで
    // 縮まないので、キーボード表示で下タブが飛び上がらない）。プラットフォーム判定はしない。
    useEffect(() => {
        const setH = () => document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        setH();
        window.addEventListener('resize', setH);
        window.visualViewport?.addEventListener('resize', setH);
        return () => {
            window.removeEventListener('resize', setH);
            window.visualViewport?.removeEventListener('resize', setH);
        };
    }, []);
```

補足:
- `React.StrictMode`（`src/main.tsx`）下では開発時に effect が2回走るが、`setProperty` は冪等なので無害。
- 既存の `src/hooks/useViewport.ts` も `resize`/`visualViewport` を購読しているが、あちらは**viewport 種別（mobile/tablet/desktop）判定専用**。責務を混ぜないため、高さ設定は上記の独立 effect に置く（useViewport には手を入れない）。
- この effect はモバイル/PC 問わず常時走るが、PC では `--app-height` が使われない（下記 CSS はモバイル専用の `.mobile-shell` のみ参照）ので無害。

### C-3. CSS を3段フォールバックにする（`src/styles/App.scss`）

§A で2行にした `.mobile-shell` の高さを、間に `var(--app-height)` を挟んだ3段にする:

```scss
  height: 100vh;                 // 1) 最古フォールバック（JSもdvhも無い）
  height: var(--app-height);     // 2) JS計測値（未設定なら宣言ごと無効化され1)へ）
  height: 100dvh;                // 3) dvh対応ブラウザはこれが最終的に勝つ
```

**順序が重要**:
- `dvh` 対応ブラウザ → 最後の `100dvh` が勝つ（JS 値より優先。dvh のほうがネイティブで滑らか）。
- `dvh` 非対応だが JS が動くブラウザ → `100dvh` の行は無効なので `var(--app-height)`（有効な最後の宣言）が勝つ。
- `var(--app-height)` 未設定（effect 実行前の一瞬 or JS 無効）→ その宣言は無効化され `100vh` にフォールバック。

### C-4. §C 受入条件

- `dvh` 非対応環境をエミュレートできる場合（例: 古い WebKit）でシェルが可視領域に収まる。
- モダン端末で §A と同じ結果（dvh が勝つので挙動不変）。
- ソフトキーボードを出しても下タブが画面内に留まる（innerHeight 基準のため）。

---

## 検証手順（重要・DevTools だけでは再現しないことに注意）

**⚠️ Chrome DevTools のデバイスエミュレーションは「アドレスバーの動的な出入り」を再現しない**（エミュレータの viewport は固定で、`vh` も `dvh` も同じ値になる）。そのため DevTools だけでは修正の効果を確認できない。以下の順で確認する。

1. **実機が最も確実（推奨）**: iPhone 実機の Safari、または Android 実機の Chrome で、Cloudflare Pages のデプロイ URL（`https://manosabainfodiary.pages.dev/`）を開く。読み込み直後（アドレスバー大）に下タブ3つが見えること、スクロールでバーが縮んでもタブが可視のままを確認。
2. **iOS Safari の Responsive Design Mode**（Mac がある場合）: 動的バーをある程度模擬できる。
3. **ロジック確認（実機が無い場合の代替）**: 任意のブラウザで preview を開き、コンソールで次を実行し、**シェル高さが可視領域を超えていない**ことを確認する:

   ```js
   const el = document.querySelector('.mobile-shell');
   const shellH = el.getBoundingClientRect().height;
   const visH = window.visualViewport?.height ?? window.innerHeight;
   console.log({ shellH, visH, diff: shellH - visH });
   // 修正後は diff がおおよそ 0（±1px）。修正前はバー表示時に diff > 0（はみ出し）。
   ```

   併せて `getComputedStyle(el).height` が `innerHeight` 近傍であることも確認。
4. **デスクトップ非退行**: 幅 1280px（`.app-container`）で従来どおり表示されること。

> preview（アプリ内ブラウザ / `npm run dev`）で確認する場合、ビューポート幅を 375px にして `.mobile-shell` が出る（`useViewport` の mobile 判定は <768px）ことを先に確認してから上記スクリプトを回す。

---

## 実施順・コミット単位（推奨）

1. **§A**（`.mobile-shell` を `100dvh` + `100vh` フォールバックへ。1ファイル2行）→ 実機 or 上記スクリプトで確認 → 1コミット。
2. **§B**（Modal.scss / FollowConfirmModal / LoadingScreen のフルスクリーン `vh` を揃える）→ 確認 → 1コミット。
3. **§C** は必要になったら（App.tsx effect + App.scss 3段化）→ 1コミット。

コミットメッセージ例: `fix(mobile): use 100dvh for mobile shell so bottom tab bar isn't hidden by the browser address bar`

## ロールバック指針

万一 `dvh` 化で予期せぬレイアウト崩れ（特定端末でシェルが伸び縮みしてチラつく等）が出た場合の代替:
- `100dvh` を `100svh`（Small viewport＝常に最小）に替えると、**アドレスバー引っ込み時に下にわずかな隙間が空く代わりに、高さが一切変動しなくなり最も安定**する。チラつきを嫌うならこちらでも症状（タブバー隠れ）は解消する。トレードオフを踏まえて選ぶ。

## 全体最終チェックリスト

1. `npx tsc -p tsconfig.json --noEmit` / `npm run build` 全成功。
2. iOS Safari 実機 375px・読み込み直後（アドレスバー大）で Create/Animate/Note タブが全部見えて押せる。
3. Android Chrome でもタブが隠れない。ノッチ端末でホームバーと重ならない（安全余白維持）。
4. アドレスバー出入り／フロア切替でマップがリサイズされても表示が壊れない。
5. デスクトップ 1280px（PCレイアウト）非退行。
6. Tauri デスクトップ（`npm run tauri dev`）非退行 — `dvh` は WebView2/WKWebView で標準対応。アドレスバーが無い環境では `100dvh == 100vh` なので挙動不変。
