# _smartphone_jikennote — スマホ Animate で「事件ノート」が初回だけ表示されない（Sonnet5 引き継ぎ実装指示書・詳細版）

最終更新: 2026-07-18（コード未変更・原因調査済み）
対象症状: スマートフォン（Web版・モバイル幅 <768px）で **Animate ページを開くと下段の「事件ノート」（Konva キャンバス）が表示されない**。一度 **Note ページへ遷移してから Animate へ戻ると表示される**。

行番号・シンボルは 2026-07-18 時点の working tree（ブランチ `main`、直近コミット `e6dce35`）基準。行番号がずれても追えるよう **grep 用アンカー文字列**を併記する。

> このドキュメントは「調査済み・実装未着手」。決定的な単一原因を実機なしに断定しきれていないため、**Sonnet5 はまず §1 の「実機での原因確定」を行い、どのゲートで落ちているかを1回のログで特定してから、該当する §A〜§C の修正を入れること**。ただし §A（キャンバス採寸の堅牢化）は原因が A/B のどちらでも安全かつ有効なので、**原因が絞れない場合は §A を無条件で適用してよい**。

| No | 症状 | 区分 | 対応 | 見積り |
|---|---|---|---|---|
| 1 | 初回 Animate で事件ノートが出ない／Note 経由で出る | バグ（描画ゲート特定済み・トリガ実機確認要） | §1 で確定 → §A（必須）| 1〜2ファイル・数行 |
| 2 | 折りたたみ既定値が不安定な `innerHeight` 依存 | 併発要因・予防 | §B（推奨）| 1ファイル・1〜数行 |
| 3 | フォント未ロード中はオブジェクトが出ない | 保険 | §C（任意）| 1ファイル・1行 |

検証コマンド（共通）:

```
npx tsc -p tsconfig.json --noEmit
npm run build
```

（`npx tsc` を引数無しで打たないこと。`-p tsconfig.json --noEmit` 必須。テストは `npx vitest run`）
\+ preview 実機/エミュレーション確認（**必ずモバイル幅 375px**。詳細は §検証手順）。

---

## §0 前提知識: 事件ノートは「どこで」「どのゲートを通って」描画されるか（確定）

### 0-1. コンポーネント経路

スマホ Animate の下段「事件ノート」は次の経路で描かれる（すべて確認済み）:

```
AnimateView(isMobile 分岐)            src/components/AnimateView.tsx L184-232
  └ .animate-mobile-note              L213（折りたたみ状態のクラス付与）
      └ {!noteCollapsed && <.note-body><NotesPanel/></.note-body>}   L225 ★ゲート①
          └ NotesPanel                src/components/NotesPanel.tsx
              └ activePresetId があれば <CanvasWorkspace targetType="preset" compactMode>   L12-17 ★ゲート②
                  └ CanvasWorkspace   src/components/note/CanvasWorkspace.tsx
                      └ {panesW > 0 && [0..3].map(...)}   L1407 ★ゲート③
                          └ <Stage width={stageRenderW} height={stageRenderH}>   L1528-1530 ★ゲート④
                              └ <Layer>{isFontLoaded && objs.map(...)}</Layer>   L1620 ★ゲート⑤
```

上段のフロアマップ（`ReadOnlyMapView`）は **別コンポーネント**で、これらのゲートを通らない。だから「マップは出るのに事件ノートだけ出ない」という症状になる。原因はこの5ゲートのいずれかで初回だけ描画が止まっていること。

### 0-2. 各ゲートの意味（grep アンカー付き）

- **ゲート①** `src/components/AnimateView.tsx` L225（grep: `{!noteCollapsed && <div className="note-body">`）
  `noteCollapsed` が true なら `.note-body` ごと**アンマウント**され、`NotesPanel`/`CanvasWorkspace` は一切マウントされない。既定値は L61（grep: `useState(() => window.innerHeight < 700)`）で **`window.innerHeight < 700` なら折りたたみ start**。
- **ゲート②** `src/components/NotesPanel.tsx` L12（grep: `activePresetId ? (`）
  `activePresetId` が falsy なら "No timeline selected" を表示しキャンバスを出さない。既定は `'chapter1'`（`src/store/presetSlice.ts` L36）なので通常は通る。
- **ゲート③** `src/components/note/CanvasWorkspace.tsx` L1407（grep: `{panesW > 0 && [0, 1, 2, 3].map`）
  `panesW = Math.max(0, canvasSize.width - compactToolbarW)`（L1239, grep: `const panesW =`）。モバイルは `compactToolbarW = 0` なので **`panesW === canvasSize.width`**。`canvasSize` は ResizeObserver 採寸（L255-281, grep: `const observer = new ResizeObserver`）で埋まる。**採寸前（=0）だと Stage を1枚も描かない。**
- **ゲート④** L1449-1470（grep: `const useRangeFit = targetType === 'preset'`）
  事件ノートは `useRangeFit=true` で `effScale = Math.min(stageWidth/1200, stageHeight/800)`（L1451）。`stageWidth/Height` は `canvasSize` 由来。`canvasSize` が 0 なら `stageRenderW/H` も 0 → 見えない。
- **ゲート⑤** L1620（grep: `{isFontLoaded && objs.map`）
  `isFontLoaded` が false の間はオブジェクトを描かない（紙面=Stage 背景の方眼だけは出る）。既定 false→`document.fonts.load('24px "Yomogi"')` 解決 or 1.5s タイムアウトで true（L283-290, grep: `document.fonts.load('24px "Yomogi"')`）。

### 0-3. 「Note 経由で直る」が指し示すもの（重要な推論）

症状のキモは **「初回 Animate では出ないが、Note を一度開いてから戻ると出る」＝ 2回目の Animate マウントでは出る**という決定性。つまり「初回マウントと2回目マウントで状態が違う」何かがある。候補は次の2系統に絞られる:

- **系統A（ゲート①）**: `noteCollapsed` の既定値が **マウント時点の `window.innerHeight`** に依存している。スマホは**アドレスバーの出入りで `innerHeight` が変動**する（[[smartphone-address-bar]] と同根の不安定性）。初回 Animate 時にアドレスバーが出ていて `innerHeight < 700` → 折りたたみ start（ノート丸ごと非マウント）。Note を触ってアドレスバーが縮む／閾値をまたぐと、戻った時の再マウントで `innerHeight >= 700` → 展開 start → 出る。
- **系統B（ゲート③/④）**: `canvasSize` を **非同期 ResizeObserver だけ**で埋めており、**初回描画時に同期シードが無い**。初回マウントで採寸コールバックが遅延／0 のまま確定してしまうと `panesW=0`・`effScale=0` で空白。CanvasWorkspace を一度 Note でマウント済みだと、2回目は各種ウォームアップ後で採寸が間に合い出る。

> どちらも「モバイル特有・初回だけ・レイアウト採寸/ビューポート絡み」という症状の性質に合致する。**§1 で実機ログを取れば1発でどちらか（あるいは両方）が確定する。** そのうえで A なら §B、B なら §A を必ず入れる。**§A は B/A どちらの場合でも安全に効く堅牢化なので、原因確定前でも入れてよい。**

---

## §1 【最初にやる】実機での原因確定（1回のログで5ゲートを切り分ける）

**DevTools のデバイスエミュレーションではアドレスバーの動的な出入りを再現できない**ため、系統Aの確認は実機（iPhone Safari / Android Chrome）が確実。系統Bはエミュレーションでも観測できることが多い。

### 1-1. 一時計測コードを仕込む（確認後に必ず削除）

`src/components/AnimateView.tsx` の `isMobile` 分岐 `return (` の直前（L184 付近、grep: `if (isMobile) {` の内側）に、次の一時 effect を足す。これで初回 Animate マウント時の各ゲート値を1行で吐く。

```tsx
  // ⚠️一時計測（原因確定後に削除）: 初回 Animate マウント時のゲート値を記録
  useEffect(() => {
    const note = document.querySelector('.animate-mobile-note');
    const body = document.querySelector('.animate-mobile-note .note-body');
    const wrap = document.querySelector('.char-canvas-wrapper');
    const r = (el: Element | null) => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    // eslint-disable-next-line no-console
    console.log('[jikennote]', {
      innerH: window.innerHeight,
      noteCollapsed_initWouldBe: window.innerHeight < 700, // ゲート①の既定判定
      activePresetId: useAppStore.getState().activePresetId, // ゲート②
      noteBodyMounted: !!body,                               // ①が効いていれば false
      noteRect: r(note), bodyRect: r(body), wrapRect: r(wrap), // ③④の採寸源
    });
    const t = setInterval(() => {
      const w = document.querySelector('.char-canvas-wrapper');
      // eslint-disable-next-line no-console
      console.log('[jikennote:poll]', r(w), 'canvasEls=', document.querySelectorAll('.animate-mobile canvas').length);
    }, 500);
    setTimeout(() => clearInterval(t), 3000);
    return () => clearInterval(t);
  }, []);
```

（`useAppStore` は同ファイルで import 済み。`useEffect` も import 済み。）

### 1-2. 判定表

実機で「アプリ再読込 → 初回に Animate タブ」を押し、コンソール（iOS は Mac の Safari 開発メニュー、Android は chrome://inspect）で `[jikennote]` を読む:

| 観測 | 落ちているゲート | 主因 | 打つ手 |
|---|---|---|---|
| `noteBodyMounted: false`（＝`innerH < 700`）| ①（折りたたみ）| 系統A | §B（＋保険で §A）|
| `noteBodyMounted: true` かつ `wrapRect.h > 0` だが `canvasEls=0` が続く | ③（panesW=0）| 系統B | §A |
| `wrapRect: {w>0,h>0}` かつ `canvasEls>0` だが紙面に**文字/図形だけ出ない** | ⑤（font）| フォント | §C |
| `activePresetId` が空/undefined | ②| データ | §D 補足参照 |

> `[jikennote:poll]` で `wrapRect.h` が **0→正の値に変わるのに canvas が増えない**なら、ResizeObserver 更新後の再描画で `panesW>0` に切り替わっていない＝③のタイミング不具合が濃厚（§A で確定的に直る）。

### 1-3. 確認後

計測 effect は**必ず削除**してからコミットする（`console.log` を残さない）。

---

## §A 【必須／原因B対策・かつA時の保険】CanvasWorkspace の採寸を同期シード＋再採寸で堅牢化する

**狙い**: `canvasSize` を「非同期 ResizeObserver 頼み」から「マウント直後に同期採寸 → その後 ResizeObserver で追従」に変え、初回描画で `panesW=0`/`effScale=0` の空白フレームが確定しないようにする。系統Bの直接対策であり、系統Aで折りたたみを解除した後の再マウントでも空白を出さない保険になる。

### A-1. 実装（`src/components/note/CanvasWorkspace.tsx`・1箇所）

対象は L255-281 の ResizeObserver effect（grep: `const container = canvasContainerRef.current;` を含む `useEffect`）。**`useEffect` を `useLayoutEffect` に変え、observe 登録の前に「その場で1回同期採寸する」行を足す**。

**変更前（抜粋・L255-281）:**

```tsx
    useEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;

        // ノート切替で新しい紙面に合わせ直す（stableSize を初期化）
        setStableSize({ width: 0, height: 0, winW: 0, winH: 0 });

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = Math.round(entry.contentRect.width);
                const newHeight = Math.round(entry.contentRect.height);
                setCanvasSize(prev => (prev.width === newWidth && prev.height === newHeight) ? prev : { width: newWidth, height: newHeight });
                setStableSize(prev => {
                    const winW = window.innerWidth, winH = window.innerHeight;
                    if (prev.width === 0 || prev.winW !== winW || prev.winH !== winH) {
                        return { width: newWidth, height: newHeight, winW, winH };
                    }
                    return prev;
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [targetType, targetId]);
```

**変更後**（`useLayoutEffect` 化 ＋ 同期シード ＋ 次フレーム再採寸を追加）:

```tsx
    // #smartphone_jikennote-A: 初回マウントで canvasSize=0 のまま描画が確定すると panesW=0 で
    // Stage が1枚も出ない。ResizeObserver の初回コールバックを待たず、マウント直後に同期採寸して
    // シードし、さらに次フレームでも測り直す（flex 高さ確定が1フレーム遅れる端末対策）。
    useLayoutEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;

        // ノート切替で新しい紙面に合わせ直す（stableSize を初期化）
        setStableSize({ width: 0, height: 0, winW: 0, winH: 0 });

        const measure = () => {
            const r = container.getBoundingClientRect();
            const w = Math.round(r.width), h = Math.round(r.height);
            if (w === 0 && h === 0) return;
            setCanvasSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h });
            setStableSize(prev => {
                const winW = window.innerWidth, winH = window.innerHeight;
                return (prev.width === 0 || prev.winW !== winW || prev.winH !== winH)
                    ? { width: w, height: h, winW, winH } : prev;
            });
        };

        measure();                              // 同期シード（初回空白フレーム防止）
        const raf = requestAnimationFrame(measure); // flex 高さ確定が遅れる端末の取りこぼし回収

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = Math.round(entry.contentRect.width);
                const newHeight = Math.round(entry.contentRect.height);
                setCanvasSize(prev => (prev.width === newWidth && prev.height === newHeight) ? prev : { width: newWidth, height: newHeight });
                setStableSize(prev => {
                    const winW = window.innerWidth, winH = window.innerHeight;
                    if (prev.width === 0 || prev.winW !== winW || prev.winH !== winH) {
                        return { width: newWidth, height: newHeight, winW, winH };
                    }
                    return prev;
                });
            }
        });

        observer.observe(container);
        return () => { cancelAnimationFrame(raf); observer.disconnect(); };
    }, [targetType, targetId]);
```

### A-2. import の追加

ファイル先頭 L1（grep: `import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';`）に `useLayoutEffect` を足す:

```tsx
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
```

### A-3. なぜこれで直るか／副作用

- **同期シード**: `useLayoutEffect` はブラウザ描画前に走るので、`getBoundingClientRect()` で得た実寸を**最初のペイント前**に `canvasSize` へ入れられる。これで `panesW>0` が初回から成立し、Stage が1枚目のフレームから描かれる。
- **次フレーム再採寸**: flex チェーンの高さ確定が1フレーム遅れて `rect` が 0 になる端末でも、`requestAnimationFrame(measure)` で取りこぼしを回収する。
- **ResizeObserver は従来どおり**存置（リサイズ追従／ズーム対応は不変）。`measure()` と observer は同じ setter を使い、値が同じなら `prev` を返してスキップするので**多重更新にならない**。
- **非モバイル（デスクトップ Note セル）にも同じ経路が走る**が、元々 ResizeObserver で埋めていた値を「少し早く」入れるだけなので**挙動は不変**（初回チラつきがむしろ減る）。
- `stableSize` の初期化タイミングも `useLayoutEffect` 側へ移るが、ロジックは同一。

### A-4. §A 受入条件

1. `npx tsc -p tsconfig.json --noEmit` / `npm run build` 成功。
2. **モバイル幅で「アプリ再読込 → 初回に Animate」**で事件ノートの紙面（セピア方眼）と既存オブジェクトが**最初から**表示される（Note 経由不要）。
3. 事件ノートの1面/4面/編集モード切替、ピンチズーム、PNG 書き出しが従来どおり動く（回帰なし）。
4. デスクトップ 1280px の Note ページ（全体/事件/キャラ/メモ各タブ）で表示・採寸が従来どおり。
5. ノート切替（プリセット変更・キャラ切替）で紙面が正しく再フィットする。

---

## §B 【推奨／原因A対策】折りたたみ既定値を「不安定な innerHeight 閾値」から切り離す

**狙い**: 事件ノートを**初回から必ずマウント**させ、`noteCollapsed` の既定を `window.innerHeight` 一発の閾値判定に依存させない。系統Aの直接対策。

### B-1. 最小対策（既定を「常に展開」にする）

`src/components/AnimateView.tsx` L61（grep: `const [noteCollapsed, setNoteCollapsed] = useState(() => window.innerHeight < 700);`）。

**変更前:**

```tsx
  const [noteCollapsed, setNoteCollapsed] = useState(() => window.innerHeight < 700);
```

**変更後（案1・最小）:**

```tsx
  // #smartphone_jikennote-B: 既定は常に展開。旧実装は初回マウント時の innerHeight（アドレスバー
  // 出入りで変動）に依存し、初回だけ折りたたまれて事件ノートが出ない不具合の一因だった。
  const [noteCollapsed, setNoteCollapsed] = useState(false);
```

> 「縦が低い端末では初期折りたたみたい」という元の意図を残したい場合は案2:

**変更後（案2・意図維持だが安定閾値）:**

```tsx
  // 縦が低い端末のみ初期折りたたみ。ただしアドレスバーで変動する innerHeight ではなく、
  // より安定な screen.availHeight を使い、初回だけ畳まれる不具合を避ける（保険で §A も入れること）。
  const [noteCollapsed, setNoteCollapsed] = useState(
    () => (typeof window !== 'undefined' && (window.screen?.availHeight ?? window.innerHeight) < 640)
  );
```

案1・案2いずれでも「初回だけ非表示」の再現条件（`innerHeight` が 700 をまたぐ端末）を外せる。**まず案1で確実に潰し、UX 上どうしても低背端末で畳みたいと分かってから案2へ**でよい。

### B-2. §B 受入条件

- モバイルで初回 Animate に事件ノートの折りたたみバーが「▾（展開）」状態で出て、中身（キャンバス）が見える。
- 折りたたみバーのタップで開閉が従来どおり効く。
- `npx tsc` / `npm run build` 成功。

---

## §C 【任意／保険】フォント未ロード中の空白を避ける

ゲート⑤（L1620, grep: `{isFontLoaded && objs.map`）は、`isFontLoaded` が false の間オブジェクトを描かない。既定で 1.5s タイムアウトの保険があるため「永続的に出ない」原因にはなりにくいが、初回体感を良くするなら**紙面（Stage 背景）は先に出す**現状のままで十分。§1 の判定表で⑤が主因と出た場合のみ、`document.fonts.load` の対象フォント名が実際に @font-face 登録名と一致しているかを確認する（grep: `@font-face`／`Yomogi`／`HANDWRITING_FONT`）。不一致だと `.load()` が resolve せず 1.5s 待ちが常に発生する。**通常は変更不要。**

---

## §D 補足: ゲート②（activePresetId 空）だった場合

§1 で `activePresetId` が空/undefined と出たら、それは別問題（プリセット初期化）。`src/store/presetSlice.ts` L36 で既定 `'chapter1'` が入るはずなので、通常は起きない。もし起きるなら永続化データの破損か初期化順序の問題。その場合はこの手順書の範囲外として別途調査すること（NotesPanel L18-25 の "No timeline selected" が出ているはず＝空白ではなく文言が出るので §1 で判別可能）。

---

## 検証手順（重要・DevTools だけでは系統Aが再現しないことに注意）

**⚠️ Chrome DevTools のデバイスエミュレーションはアドレスバーの動的な出入りを再現しない**ため、系統A（`innerHeight` 変動起因）は**実機**でしか確実に再現・確認できない。系統B（採寸）はエミュレーションでも観測しやすい。

1. **実機（推奨）**: iPhone Safari / Android Chrome で Cloudflare Pages（`https://manosabainfodiary.pages.dev/`）を開く。**アプリ再読込直後（アドレスバー大の状態）で初回に Animate タブ**を押し、事件ノートが出るか確認。修正前は出ない／修正後は出る。
2. **preview（アプリ内ブラウザ / `npm run dev`）**: ビューポート幅 375px にして `.animate-mobile` が出る（`useViewport` の mobile 判定 <768px）ことを確認。§A の系統Bはここで確認できる。§1 の計測ログでゲート値を読むのが確実。
   - 注意: プレビュータブが非フォアグラウンドだと `requestAnimationFrame` がスロットルされ、アプリのモード遷移（`App.tsx handleTransition` が rAF 依存）が進まないことがある。**タブを最前面にしてから**タブ操作すること。
3. **回帰**: デスクトップ 1280px の Note ページ全タブ、モバイル Note、Animate の再生・ズーム・PNG 書き出しを一通り。
4. **Tauri**（`npm run tauri dev`）: 事件ノート表示が従来どおり（`useLayoutEffect` 化・折りたたみ既定変更ともデスクトップ挙動不変）。

preview でのゲート値確認スクリプト（コンソール実行・修正効果の目安）:

```js
// Animate 表示中に実行。修正後は wrap.h>0 かつ canvas>0 が初期から成立する。
const wrap = document.querySelector('.char-canvas-wrapper');
console.log({
  innerH: innerHeight,
  noteBody: !!document.querySelector('.animate-mobile-note .note-body'),
  wrap: wrap && { w: Math.round(wrap.getBoundingClientRect().width), h: Math.round(wrap.getBoundingClientRect().height) },
  canvasEls: document.querySelectorAll('.animate-mobile canvas').length,
});
```

---

## 実施順・コミット単位（推奨）

1. **§1**（一時計測を入れて実機で原因確定 → 計測は削除）。※コミットしない。
2. **§A**（CanvasWorkspace 採寸の堅牢化）→ preview/実機で確認 → 1コミット。原因が絞れなくてもここは入れて良い。
3. 系統Aだと確定した場合のみ **§B**（折りたたみ既定の安定化）→ 確認 → 1コミット。
4. §C/§D は §1 の結果で必要になった場合のみ。

コミットメッセージ例:
`fix(mobile): seed canvas size synchronously so the incident note renders on first Animate mount`
（§B 併用時）`fix(mobile): don't collapse the incident note based on unstable innerHeight`

## ロールバック指針

- §A で万一 Note/デスクトップの初回レイアウトにチラつきが出たら、`useLayoutEffect` を元の `useEffect` に戻しつつ `measure()`＋`requestAnimationFrame(measure)` の2行だけ残す（同期シードを諦め、次フレーム採寸のみにする）と副作用を最小化しつつ大半のケースを救える。
- §B は案1（`useState(false)`）に戻すのが最も安全。低背端末で畳みたい要望が再燃したら案2へ。

## 全体最終チェックリスト

1. `npx tsc -p tsconfig.json --noEmit` / `npm run build` 全成功。
2. 一時計測コード（§1）を削除済み。`console.log` を残していない。
3. モバイル 375px・**アプリ再読込直後の初回 Animate** で事件ノートが表示される（Note 経由不要）。
4. 折りたたみバーの開閉、1面/4面/編集、ピンチズーム、PNG 書き出しが回帰なし。
5. デスクトップ 1280px の Note 全タブ・モバイル Note が非退行。
6. Tauri デスクトップ（`npm run tauri dev`）非退行。
