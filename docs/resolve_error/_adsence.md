# _adsence — AdSense ポリシー違反「パブリッシャーのコンテンツを含まない画面での広告」解消手順書（実装指示書・詳細版）

最終更新: 2026-07-17（コード未変更・調査済み。方針①採用）
担当引き継ぎ: この文書だけで Sonnet 5 が着手できるよう、原因・方針・作成物・本文・検証まで自己完結で記す。
対象: Google AdSense 審査で「ステータス=要確認 / ポリシー違反が見つかりました」。指摘は
**「パブリッシャーのコンテンツを含まない画面における Google が配信する広告」**
（＝コンテンツが無い・有用性が低い・作成中・ナビゲーション等の行動目的画面に広告を出している）。

行番号・シンボルは 2026-07-17 時点の working tree（ブランチ `main`、直近コミット `38a070c adsense`）基準。ずれても追えるよう **grep 用アンカー文字列**を併記する。

---

## 0. 結論（なぜ違反したか＝根本原因）

Google クローラーが実際に見ているものを基準に考えること。

1. 本アプリは **SSR/プリレンダー無しの純クライアント SPA**。`index.html` の実体は `<div id="root"></div>` のみ（[index.html](../../index.html) の `<body>`）。初回 HTML に読み物コンテンツがゼロ。
2. ユーザーが作る経路・ノートは **localStorage / IndexedDB 内のみ**。Google からは一切見えない。
3. Google がクロールできる「文章コンテンツ」は事実上 [public/privacy.html](../../public/privacy.html) **1枚だけ**。しかもそこに広告は無い。
4. 唯一 AdSense を出している画面は **Create（マップ編集ツール）**（[src/components/AdSlot.tsx](../../src/components/AdSlot.tsx) を [src/components/CreateView.tsx](../../src/components/CreateView.tsx) の 2x2 グリッド右下 `<AdSlot />` で配置）。これはまさに Google の言う「ナビゲーション/行動が目的の画面」に該当する。

つまり違反の本体は「空状態に広告」ではなく **サイトにパブリッシャーコンテンツ（Google が読める公開コンテンツ）が存在しないこと**。広告の出し方を直すだけでは通らない。**Google がクロールできる実コンテンツページを追加する**のが審査通過の主因対策。

---

## 1. 採用方針（ユーザー決定済み・2026-07-17）

**方針①: アプリ機能ガイド中心で実コンテンツページを追加する。**
- 原作『魔法少女の魔女裁判』の設定には**踏み込まない**（推測で書くと不正確・著作権リスク）。
- 追加ページはすべて「このアプリ自身の説明」＝一次情報が [src/data/shortcuts.ts](../../src/data/shortcuts.ts) の `QUICK_START` にある正確な内容のみで構成する。
- キャラ紹介は**画像一覧＋汎用的なアプリ内での使い方説明**に留める（原作プロフィールは書かない）。

**広告の出し方（重要な設計判断・本手順の推奨）:**
審査を確実に通すため、**AdSense の配信は新規の静的コンテンツページ側に限定**する。Create ツール画面の `<ins class="adsbygoogle">`（実広告）は**いったん外し**、ハウス枠プレースホルダのみ残す（＝アプリ内は AdSense 非配信）。理由: localStorage ツール画面は今後も「パブリッシャーコンテンツ」と見なされにくく、残すと再違反リスクが高い。審査通過後にアプリ内配信を再検討する（§F 参照）。

---

## 2. 作成物一覧（このタスクの成果物）

| # | 種別 | パス | 内容 |
|---|---|---|---|
| A1 | 新規 | `public/index-landing.html` ではなく **既存 `index.html` はSPA用のまま**。ランディングは別途 `public/about.html` に置く | §3-A |
| A2 | 新規 | `public/about.html` | アプリ紹介ランディング（機能概要・使い方の入口） |
| A3 | 新規 | `public/guide.html` | 使い方ガイド（Create/Animate/Note の詳細手順） |
| A4 | 新規 | `public/characters.html` | 登場キャラ画像一覧（アプリで使えるキャラの紹介・原作設定なし） |
| B1 | 改修 | `public/privacy.html` | ヘッダーナビ追加（相互リンクで回遊性を持たせる） |
| B2 | 改修 | `public/robots.txt` | Sitemap 行を追加 |
| B3 | 新規 | `public/sitemap.xml` | 静的ページのサイトマップ |
| C1 | 改修 | `src/components/AdSlot.tsx` | 実広告 `<ins>` を外しハウス枠のみに（アプリ内 AdSense 非配信） |
| C2 | 改修 | `src/components/tutorial/HelpDrawer.tsx` | フッターに about/guide へのリンク追加（回遊性） |
| D1 | 要ユーザー入力 | `index.html` / 各静的HTML / `sitemap.xml` | 公開 URL（現在 `REPLACE-WITH-PUBLIC-URL` プレースホルダ）と X アカウントの確定 |

---

## 3. 詳細手順

### 前提: 静的ページの共通仕様

- 置き場所は `public/`（Vite は `public/` 配下を**加工せずそのままコピー**する。したがって静的 HTML 内で `import.meta.env` は使えない＝AdSense クライアント ID はベタ書きになる。ID はもともと公開情報で [public/ads.txt](../../public/ads.txt) に記載の `pub-3488157439848001`）。
- ダーク基調・`max-width:720px` 中央寄せは [public/privacy.html](../../public/privacy.html) の `<style>` を踏襲して統一感を出す。
- **全ページ共通のヘッダーナビ**を入れて相互リンクさせる（回遊性＝「有用性の低い単独ページ」評価を避ける）。ナビ項目: ホーム(about) / 使い方(guide) / キャラ一覧(characters) / アプリを開く(`/`) / プライバシー(privacy)。
- 各ページに `<meta name="description">` と `<title>` を持たせる。

### AdSense を静的ページに載せる方法（推奨: 自動広告=ページレベル）

静的コンテンツページには **自動広告（Auto ads）のページレベルコード**を入れるのが最も簡単で、スロット ID 不要・コンテンツ量に応じて Google が最適配置する。各静的 HTML の `<head>` に以下を入れる（`crossorigin` 必須、client は ads.txt の値）:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3488157439848001"
        crossorigin="anonymous"></script>
```

そのうえで **AdSense 管理画面 → 広告 → サイトごと → 自動広告 ON**（この画面操作はユーザーが行う。コードだけでは有効化されない）。手動ユニットを使いたい場合のみ `<ins class="adsbygoogle" ... data-ad-slot="...">` を本文中に置くが、まずは自動広告で良い。

> 注意: **審査が完了する（ポリシー違反が解消され承認される）まで、実広告は表示されない**のが正常。まず「クロール可能な実コンテンツ＋広告コードの設置」を整えてから、AdSense 画面で再審査を申請する。

---

### §3-A2 `public/about.html`（ランディング）

目的: サイトのトップに来る読み物。アプリが何かを説明し、guide/characters へ誘導する。本文は `QUICK_START` の "はじめに — 3つのページ" を正確な一次ソースとして使う。

雛形（コピーして使用可。`<PUBLIC_URL>` と X ハンドルは §D1 で確定）:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>魔法少女の魔女裁判 推理ノート — 行動経路とキャラノートの整理アプリ</title>
  <meta name="description" content="『魔法少女の魔女裁判』の推理を整理するWebアプリのガイドサイト。登場人物の行動経路を作成・再生し、キャラクターノートや推理メモをブラウザだけで整理できます。" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3488157439848001" crossorigin="anonymous"></script>
  <style>
    body { max-width: 720px; margin: 0 auto; padding: 24px 16px; font-family: sans-serif;
           background: #1e1e1e; color: #ddd; line-height: 1.8; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2em; }
    a { color: #66b3ff; }
    nav { display: flex; flex-wrap: wrap; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #333; font-size: .9rem; }
    .cta { display:inline-block; margin-top: 8px; padding: 10px 18px; background:#2a6; color:#fff; border-radius:6px; text-decoration:none; }
    ul { padding-left: 1.2em; }
  </style>
</head>
<body>
  <nav>
    <a href="./about.html">ホーム</a>
    <a href="./guide.html">使い方ガイド</a>
    <a href="./characters.html">キャラクター一覧</a>
    <a href="/">アプリを開く</a>
    <a href="./privacy.html">プライバシー</a>
  </nav>

  <h1>魔法少女の魔女裁判 推理ノート</h1>
  <p>『魔法少女の魔女裁判』をより深く楽しむための、推理整理支援 Web アプリです。登場人物の行動経路を地図上で作成し、時間に沿って再生して矛盾を検証し、キャラクターノートや推理メモを 1 か所にまとめられます。インストール不要で、スマートフォンでも PC ブラウザでも動作します。</p>
  <p><a class="cta" href="/">▶ アプリを開いて使ってみる</a></p>

  <h2>3 つのページでできること</h2>
  <ul>
    <li><strong>Create（作成）</strong> — 2F／1F／B1 の地図上で、登場人物の行動経路（出発地・経由地・目的地と滞在時間）を作成します。</li>
    <li><strong>Animate（再生）</strong> — 作った経路を時間に沿って再生し、キャラの移動やすれ違いを目で見て検証します。</li>
    <li><strong>Note（ノート）</strong> — 全体ノート・事件ノート・キャラクターノート・メモの 4 種類で、推理や気づきを図・テキスト・画像で整理します。</li>
  </ul>

  <h2>特徴</h2>
  <ul>
    <li>作業内容は自動保存され、再読み込みしても復元されます。</li>
    <li>データはお使いの端末のブラウザ内にのみ保存され、サーバーには送信されません。</li>
    <li>スマートフォン（タッチ）と PC（マウス）の両方に最適化したレスポンシブ設計です。</li>
  </ul>

  <h2>使い方をもっと詳しく</h2>
  <p><a href="./guide.html">使い方ガイド</a>で各ページの操作手順を、<a href="./characters.html">キャラクター一覧</a>でアプリに登場するキャラを確認できます。</p>

  <hr style="margin:2em 0; border-color:#333;" />
  <p style="font-size:.8rem; color:#888;">お問い合わせ: X <a href="https://x.com/＜Xハンドル＞">@＜Xハンドル＞</a>／<a href="./privacy.html">プライバシーポリシー</a></p>
</body>
</html>
```

> QA 注意: 雛形をコピペした後は各 HTML を読み直し、日本語に紛れる異体字・キリル文字の混入が無いか grep（`grep -nP "[А-Яа-яЁё]" public/*.html`、ヒット 0 が正常）で確認すること。

### §3-A3 `public/guide.html`（使い方ガイド）

目的: 最もボリュームのある読み物。`QUICK_START` の create/animate/note 各カードの `points` を**そのまま正確に**文章化する（この内容は実装済み機能に基づく一次情報なので事実誤りが無い）。同じヘッダーナビ・同じ `<style>`・同じ AdSense loader を入れる。

構成（見出しと本文の対応）:
- `<h1>使い方ガイド`
- `<h2>Create — 行動経路をつくる` … `QUICK_START` create の 8 points を `<ul><li>` 化。
- `<h2>Animate — 再生して検証する` … animate の 4 points。
- `<h2>Note — 推理を整理する` … note の 8 points。
- `<h2>キーボードショートカット` … [src/data/shortcuts.ts](../../src/data/shortcuts.ts) `SHORTCUT_GROUPS` の内容を表にする（PC 向けの有用情報として厚みが出る）。
- 末尾に「アプリを開く」CTA と privacy リンク。

一次ソース（`QUICK_START` / `SHORTCUT_GROUPS`）は [src/data/shortcuts.ts](../../src/data/shortcuts.ts) を参照して転記すること。**推測で機能を書き足さない**（例: 存在しない機能を書くと逆に「有用性の低い/誤情報」評価になる）。

### §3-A4 `public/characters.html`（キャラクター一覧）

目的: 画像を伴う一覧で読み物のボリュームを足す。**原作設定は書かない。**「アプリ上でこのキャラをどう使うか（Create の ICONS で選択、Note のキャラクターノートで立ち絵が配置される 等）」の汎用説明に限定する。

素材: `public/character/` に 15 体分の PNG がある（ファイル名は `<番号>_<ローマ字名>.png`。実ファイルを `ls public/character` で確認して全件リンクする）。

構成:
- 同じヘッダーナビ・`<style>`・AdSense loader。
- 冒頭に説明文: 「本アプリには『魔法少女の魔女裁判』の登場人物の立ち絵を、行動経路の作成（Create の ICONS）やキャラクターノートで利用できます。以下はアプリで扱えるキャラクターの一覧です。」
- 画像グリッド: 各キャラを `<figure><img src="./character/xxx.png" alt="＜表示名＞" loading="lazy" width="160"><figcaption>＜表示名＞</figcaption></figure>` で並べる。`<style>` に `.grid{display:flex;flex-wrap:wrap;gap:16px} figure{margin:0;text-align:center} img{border-radius:8px}` を追加。
- 表示名はファイル名のローマ字から日本語表記を起こす（例: `1_sakuraba_ema.png` → 桜庭 恵麻）。**確信が持てない読みは無理に断定せず**ローマ字併記（例: 「Sakuraba Ema」）で可。ここは事実性より「画像一覧としての体裁」が目的。
- 著作権への配慮として末尾に一文: 「立ち絵などの画像の権利は原作者・権利者に帰属します。本サイトはファンによる非公式の推理支援ツールです。」

> キャラ画像の権利表記は必須。原作の二次利用にあたるため、非公式・ファンメイドである旨を明記する。ユーザーに公開可否（権利者ガイドライン確認）を一度確認するのが望ましい（§D1）。

### §3-B1 `public/privacy.html` 改修

先頭 `<body>` 直後に §3-A と同じ `<nav>...</nav>` を差し込み、単独ページを回遊網に組み込む。既存の X プレースホルダ `@（ユーザーのXアカウント）` は §D1 で確定した実ハンドルに置換。

### §3-B2 `public/robots.txt` 改修

現状:
```
User-agent: *
Allow: /
```
末尾に 1 行追加（`<PUBLIC_URL>` は実ドメイン）:
```
Sitemap: <PUBLIC_URL>/sitemap.xml
```

### §3-B3 `public/sitemap.xml` 新規

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc><PUBLIC_URL>/</loc></url>
  <url><loc><PUBLIC_URL>/about.html</loc></url>
  <url><loc><PUBLIC_URL>/guide.html</loc></url>
  <url><loc><PUBLIC_URL>/characters.html</loc></url>
  <url><loc><PUBLIC_URL>/privacy.html</loc></url>
</urlset>
```

### §3-C1 `src/components/AdSlot.tsx` 改修（アプリ内 AdSense をいったん外す）

現状（[src/components/AdSlot.tsx](../../src/components/AdSlot.tsx)）は Web+設定時に `<ins class="adsbygoogle">` を出す。**審査通過までアプリ内では実広告を配信しない**方針のため、実広告 `<ins>` 描画をやめ、常にハウス枠プレースホルダを返すようにする。

最小改修（推奨）:
- `return (<div style={boxStyle}><ins .../></div>)` のブロックを削除し、**常にフォールバック（「広告スペース」ハウス枠）を返す**。
- `useEffect` の AdSense ロード/`pushAd` 呼び出しも実行されないので、`ensureAdSenseLoaded`/`pushAd` の呼び出しを削除（[src/services/ads.ts](../../src/services/ads.ts) の関数自体は将来復帰用に残してよい）。
- grep アンカー: `className="adsbygoogle"`（この行を含む `<ins>` を削除）、`pushedRef`（不要になる）。

> これによりレイアウト（2x2 グリッド右下のハウス枠）は変わらず、Google に対しては「SPA ツール画面に AdSense 広告は無い」状態になり、違反対象が静的コンテンツページ側の適正配置のみになる。

代替案（§F・審査後に検討）: アプリ内でも配信したい場合は、「保存済み経路が 1 件以上ある等の"コンテンツがある状態"のときだけ `<ins>` を出す」ゲーティングを [src/store.ts](../../src/store.ts) の保存データ有無シグナルで実装する。ただし審査通過を優先するなら Phase 1 では入れない。

### §3-C2 `src/components/tutorial/HelpDrawer.tsx` 改修

既存の privacy リンク（[src/components/tutorial/HelpDrawer.tsx](../../src/components/tutorial/HelpDrawer.tsx) の `href="./privacy.html"` 付近、grep アンカー `プライバシーポリシー`）の並びに、`about.html`/`guide.html` へのリンクを追加してアプリ→コンテンツページの導線を作る（回遊性・被リンク）。`isWeb()` 分岐内に置く（Tauri では静的 URL を開けないため Web のみ）。

---

## 4. §D1 ユーザー入力が必要な項目（実装前に確定）

以下は推測で埋めないこと。未確定なら実装を進めつつ**プレースホルダのまま残し、ユーザーに確認**する。

1. **公開 URL（本番ドメイン）**: [index.html](../../index.html) の `og:url`/`og:image` が `https://REPLACE-WITH-PUBLIC-URL/` のまま。sitemap.xml・robots.txt でも必要。実 URL を確定して一括置換。
2. **X アカウントのハンドル**: privacy.html・about.html のプレースホルダを置換。
3. **キャラ画像の公開可否**: 二次利用のため、権利者ガイドライン上 characters.html での画像掲載が問題ないかユーザーに確認。NG の場合は characters.html を「テキストのみのキャラ名一覧」に切替。
4. **AdSense 管理画面操作（コードでは不可）**: 自動広告の ON、サイトの再審査申請はユーザーが AdSense 画面で行う。

---

## 5. 検証（Self-Verification）

コード変更（§3-C1/C2）後:
```
npx tsc -p tsconfig.json --noEmit
npm run build
npx vitest run
```
（`npx tsc` を引数無しで打たないこと。`-p tsconfig.json --noEmit` 必須。）

静的ページの確認:
```
npm run build && npm run preview
```
- `http://localhost:4173/about.html` `/guide.html` `/characters.html` `/privacy.html` が表示され、ヘッダーナビの相互リンクが全て 200 で辿れること。
- `dist/` に about.html/guide.html/characters.html/sitemap.xml が出力されていること（`ls dist`）。
- 各 HTML に文字化け・キリル文字混入が無いこと: `grep -nP "[А-Яа-яЁё]" dist/*.html`（ヒット 0 が正常）。
- Create 画面右下がハウス枠（「広告スペース」）表示のままで、DevTools の Network に `adsbygoogle.js` へのリクエストが**出ていない**こと（アプリ内 AdSense 非配信の確認）。
- 静的ページ側では `adsbygoogle.js` が `<head>` に読まれていること（審査前は広告枠は空でよい）。
- スマホ幅（375px）でも静的ページのナビ・画像グリッドが崩れないこと（レスポンシブ規約）。

Tauri 非退行（任意）: `npm run tauri dev` で AdSlot がハウス枠のまま・エラーが出ないこと。

---

## 6. 完了後の運用（ユーザー作業・§F）

1. デプロイして各静的ページが公開 URL で 200 になることを確認。
2. Google Search Console に sitemap.xml を送信（任意だがクロール促進に有効）。
3. AdSense 管理画面: サイトに自動広告を設定 →「ポリシー違反を解消した」うえで**再審査を申請**。
4. 審査通過後、アプリ内配信を再開したい場合のみ §3-C1 代替案（保存データありの状態でのみ `<ins>` 表示）を別タスクで実装する。

---

## 7. 受入条件（Definition of Done）

- [ ] `public/about.html` `guide.html` `characters.html` を新規作成し、共通ナビで相互リンク済み。
- [ ] 本文は `QUICK_START`/`SHORTCUT_GROUPS` に基づく正確な内容のみ。原作設定の断定記述なし。characters.html に権利表記あり。
- [ ] `privacy.html` にナビ追加。`robots.txt` に Sitemap 行。`sitemap.xml` 作成。
- [ ] `AdSlot.tsx` から実広告 `<ins>` を除去（アプリ内 AdSense 非配信）。ハウス枠は維持。HelpDrawer にコンテンツページ導線追加。
- [ ] `tsc`/`build`/`vitest` 通過。`preview` で全静的ページ 200・相互リンク可・キリル文字混入 0。
- [ ] §D1 の公開 URL・X ハンドル・画像可否・AdSense 画面操作をユーザーに確認（未確定分はプレースホルダで明示し引き継ぎ）。
