# refactoring3 — Canvas 周りの潜在不具合 15 件 + UX 阻害 20 件の修正指示書

最終更新: 2026-07-11（コード未変更・調査済み）
対象範囲: Note/Animate の Canvas 実装一式 — `src/components/note/*`（CanvasWorkspace / NoteObjectComponents / SelectionContextBar / CompactToolbar / NoteToolsSidebar / ShapeContextMenu / ImageGalleryWindow / noteConstants）、`src/hooks/{useNoteKeyboard, useNoteClipboard, useTextEditing, useNoteHistoryBatch}.ts`、`src/store/noteSlice.ts`、および Canvas と直接相互作用する `AnimationTimeline` の一部。
行番号は 2026-07-11 時点の working tree（ブランチ `work/perf-image-ui-foundations`）基準。ズレてもよいよう **grep 用アンカー**を併記する。

関連文書: `docs/resolve_error/22.md`（0711_2 症状対応。**§A のビューポート方式変更・§B の選択バー移設と本書の一部項目は互いに触る箇所が重なる**。22.md を先に実施してから本書に着手すること）。

検証コマンド（各項目共通）:
```
npx tsc -p tsconfig.json --noEmit
npm run build
npx vitest run
```
+ preview 実機確認（デスクトップ 1280px / モバイル 375px。タッチ系項目は DevTools のデバイスエミュレーションでタッチイベントを有効にする）。

**進め方**: 1項目=1コミット。Part A（バグ）を番号順 → Part B（UX）を番号順が基本だが、同一ファイルの近接箇所を触る項目はまとめてよい（コミットは分ける）。B-3（ピンチズーム）だけは規模が大きいので最後に回す。

---

# Part A — 不具合になりうる実装 15 件

## A-1【中】画像ドロップの配置座標が論理座標に変換されていない

- 対象: `CanvasWorkspace.tsx` L505-527（grep: `const handleDrop = async`）
- 現象: `e.nativeEvent.offsetX/offsetY`（= ドロップ先 DOM 要素基準の**画面px**）をそのまま論理座標として `addNoteObject` している。Stage には `effScale` と（preset の）レターボックスオフセットがあるため、**ドロップ位置とズレた場所に画像が置かれる**。縮尺が小さいほどズレは拡大（例: effScale 0.5 なら実際のドロップ点の 2 倍遠くへ）。さらに 4 ペイン表示中はどのペインに落としても `currentCanvasIndex` 固定、preset の 1200×800 クランプも無い。
- 修正: ドロップ点をペイン特定 → Layer 論理座標へ変換する。既存の「跨ぎ移動」の変換式（grep: `const srcBox = srcStage.container().getBoundingClientRect()`）と同じ手法を使う:
```tsx
const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!(files && files.length > 0 && files[0].type.startsWith('image/'))) return;

    // ドロップされた画面座標を、該当ペインの Layer 論理座標へ変換する（revise3 A-1）。
    // 旧: offsetX/Y（コンテナ画面px）をそのまま論理座標にしていたため、縮尺ぶんズレていた。
    let dropIndex = currentCanvasIndex;
    let pos = { x: 100, y: 100 };   // 変換不能時のフォールバック
    const paneHit = paneRefs.current.findIndex(div => {
        if (!div) return false;
        const r = div.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (paneHit !== -1) dropIndex = paneHit;
    const stage = stageRefs.current[dropIndex];
    const layer = stage?.getLayers()[0];
    if (stage && layer) {
        const box = stage.container().getBoundingClientRect();
        pos = {
            x: (e.clientX - box.left - layer.x()) / (layer.scaleX() || 1),
            y: (e.clientY - box.top - layer.y()) / (layer.scaleY() || 1),
        };
    }
    if (targetType === 'preset') {   // 基準範囲クランプ（クリック配置と同じ制約）
        pos.x = Math.max(0, Math.min(NOTE_CANVAS.W, pos.x));
        pos.y = Math.max(0, Math.min(NOTE_CANVAS.H, pos.y));
    }
    try {
        const { blob, width, height } = await processFile(files[0]);
        const key = await putAsset(blob);
        addNoteAsset(targetType, displayTargetId, key);
        addNoteObject(targetType, displayTargetId, {
            id: genObjId('img'), type: 'image',
            x: pos.x, y: pos.y, width, height, content: key,
            rotation: 0, scaleX: 1, scaleY: 1, keepRatio: true,
            canvasIndex: dropIndex,
        });
    } catch { /* 既存の catch のまま */ }
};
```
（`CANVAS_BASE_W/H` 定数はファイル先頭で定義済みなのでそちらを使ってもよい）
- 受入: 単一表示でキャンバス中央/四隅へ画像ファイルをドロップ → **マウスを離した位置**に画像の左上が来る。4面表示では落としたペインに入る。preset では範囲外ドロップが縁にクランプされる。

## A-2【高】テキスト編集確定の undo 履歴が「編集後」を保存している（1回目の Ctrl+Z が無反応・編集前テキストが復元不能）

- 対象: `src/hooks/useTextEditing.ts` L35-42（grep: `const finishTextEditing = useCallback`）
- 現象: `updateNoteObject(..., skipHistory=true)` で**先に**テキストを書き換えてから `saveNoteHistory()` を呼んでいる。`saveNoteHistory` は「現在の notes」を履歴に積む仕組み（他のミューテータは**変更前に**呼ぶ規約。noteSlice L117-121 参照）なので、履歴には**編集後**のスナップショットが積まれる。結果: (1) テキスト編集直後の Ctrl+Z は見かけ無反応（同一状態へ戻るだけ）、(2) 編集前のテキストは履歴のどこにも無く復元不能、(3) 続けて Ctrl+Z すると 1 つ前の操作までまとめて巻き戻る。カラーピッカー系は commit 56db688 で同種の問題を修正済みだが、テキストは未修正。
- 修正:
```tsx
const finishTextEditing = useCallback(() => {
    const id = editingTextIdRef.current;
    if (!id) return;
    editingTextIdRef.current = null;
    // 変更前スナップショットを積んでからコミットする（56db688 のピッカー修正と同じ規約）。
    // 値が変わっていない場合は履歴も更新も行わない（空 undo ステップ防止）。
    const cur = useAppStore.getState();
    const find = (): string | undefined => {
        const notes = cur.notes;
        const canvas = targetType === 'overview' ? notes.overviewCanvas
            : targetType === 'preset' ? notes.presets?.[displayTargetId]
            : targetType === 'character' ? notes.characters?.[displayTargetId]
            : notes.miscPages?.find(p => p.id === displayTargetId)?.canvas;
        return canvas?.objects.find(o => o.id === id)?.text;
    };
    if (find() !== editingTextValueRef.current) {
        saveNoteHistory();
        updateNoteObject(targetType, displayTargetId, id, { text: editingTextValueRef.current }, true);
    }
    setEditingTextId(null);
}, [targetType, displayTargetId, updateNoteObject, saveNoteHistory]);
```
`useAppStore` を import に追加（`import { NoteObject, NoteTargetType, useAppStore } from '../store';`）。
- 受入: テキストをダブルクリック→「ABC」→「XYZ」に書き換えて Enter → Ctrl+Z 1回で「ABC」に戻る。テキストを開いて**無変更のまま** blur → Ctrl+Z は直前の別操作を取り消す（空ステップが挟まらない）。

## A-3【高】ノート切替後も選択状態(selectedIds)が残り、幽霊選択バー・空 undo が発生する

- 対象: `CanvasWorkspace.tsx`（grep: `const [selectedIds, setSelectedIds] = useState`）
- 現象: `targetId`/`displayTargetId` が変わっても selectedIds をクリアする処理が無い。キャラノートで選択→A/D でキャラ切替（または preset 切替・misc 切替）すると、(1) 存在しない ID を選択中のまま `SelectionContextBar` が「N個選択」を表示し続ける（Transformer は findOne 失敗で枠は出ない=見た目と不整合）、(2) その状態で Delete を押すと `removeNoteObjects` が**対象0件でも履歴を保存**し、空の undo ステップが積まれる（A-4 も参照）、(3) 削除・色変更ボタンは無反応に見える。
- 修正: displayTargetId/targetType の変更で選択系 state を一括リセットする effect を追加（`currentCanvasObjects` 定義の近くに）:
```tsx
// ノート切替時に前ノートの選択・編集・メニュー状態を持ち越さない（revise3 A-3）
useEffect(() => {
    setSelectedIds([]);
    setShapeContextMenu(null);
    setAssetContextMenu(null);
    finishTextEditing();   // 切替直前の編集中テキストは確定してから破棄
    setPlacementMode(null);
}, [targetType, displayTargetId]);   // eslint-disable-line react-hooks/exhaustive-deps
```
注意: `finishTextEditing` は displayTargetId で closure しているため、**この effect は displayTargetId 更新「後」に走ると旧ノートへコミットできない**。useTextEditing 側は refs でコミット対象 id を持っており `updateNoteObject` に渡す displayTargetId だけが新値になる恐れがある → 対策として effect ではなく、`displayTargetId` を更新している既存 effect（grep: `if (targetId !== displayTargetId)`）の `setDisplayTargetId(targetId)` **直前**に `finishTextEditing()` と選択クリアを入れる方が安全:
```tsx
useEffect(() => {
    if (targetId !== displayTargetId) {
        setCanvasOpacity(0);
        const timer = setTimeout(() => {
            finishTextEditing();          // 旧ノートの編集を旧IDのうちに確定
            setSelectedIds([]);
            setShapeContextMenu(null);
            setAssetContextMenu(null);
            setPlacementMode(null);
            setDisplayTargetId(targetId);
            setTimeout(() => setCanvasOpacity(1), 50);
        }, 200);
        return () => clearTimeout(timer);
    }
}, [targetId, displayTargetId, finishTextEditing]);
```
- 受入: オブジェクト選択中にキャラを A/D で切替 → 選択バーが消え、Delete を押しても何も起きず undo 履歴も汚れない（切替→Ctrl+Z で直前の実操作が取り消される）。テキスト編集中に切替した場合、編集内容は**旧ノート側に**確定されている。

## A-4【中】noteSlice のミューテータが「変更0件」でも履歴を積む

- 対象: `src/store/noteSlice.ts` — `updateNoteObject` L129 / `updateNoteObjects` L134 / `removeNoteObject(s)` L145-154 / `reorderNoteObject` L183（grep: `removeNoteObjects: (targetType`）
- 現象: 対象 ID が存在しなくても `saveNoteHistory()` が先に走る。A-3 の幽霊選択や、タイミング差（undo 直後のドラッグ確定など）で**「何も変わらない undo ステップ」**が積まれ、Ctrl+Z の体感が「効かない」「2回押さないと戻らない」になる。
- 修正: 各ミューテータで対象の存在を確認してから履歴を保存する。共通ヘルパを noteSlice 冒頭に追加:
```ts
// 対象キャンバスを読むだけのセレクタ（存在チェック用・updateCanvasState と同じ解決規則）
const readCanvas = (state: AppState, targetType: NoteTargetType, targetId: string): CanvasState | undefined =>
    targetType === 'overview' ? state.notes.overviewCanvas
    : targetType === 'preset' ? (state.notes.presets || {})[targetId]
    : targetType === 'character' ? (state.notes.characters || {})[targetId]
    : state.notes.miscPages?.find(p => p.id === targetId)?.canvas;
```
例（removeNoteObjects）:
```ts
removeNoteObjects: (targetType, targetId, objIds) => {
    if (!get()._hasHydrated) return;
    const canvas = readCanvas(get(), targetType, targetId);
    if (!canvas || !canvas.objects.some(o => objIds.includes(o.id))) return;  // 変更なし→履歴も積まない
    get().saveNoteHistory();
    set((state) => updateCanvasState(state, targetType, targetId, (c) => ({ ...c, objects: c.objects.filter(o => !objIds.includes(o.id)) })));
},
```
`updateNoteObject(s)` は「id が1つも見つからない場合のみ return」、`reorderNoteObject` は「idx === -1 なら return」を saveNoteHistory の**前**に移す。
- 受入: 存在しない ID で removeNoteObjects を呼んでも `noteHistory.length` が増えない（vitest にユニットテストを1本追加: store を直接叩き、無効 ID 操作前後で `noteHistory.length` 不変を確認）。

## A-5【中】Stage 外で mouseup すると描画/範囲選択が宙づりになる

- 対象: `CanvasWorkspace.tsx` — `handleStageMouseUp` は Stage 上でしか発火しない（grep: `const handleStageMouseUp`）
- 現象: 図形ドラッグ作成・フリーハンド・範囲選択の途中でカーソルが Stage 外（ツールバー・パネル・ウィンドウ外）へ出たままボタンを離すと、`isDrawingRef.current = true` / `selectionRect.visible = true` のまま残る。次にキャンバスへ戻ると**押していないのに描画/選択矩形が続いてしまい**、クリックの意味が壊れる。
- 修正: 描画/範囲選択がアクティブな間だけ window の `mouseup`/`touchend` を監視し、Stage 外なら「その時点の内容で確定」する。`drawingActive` state が既にあるので:
```tsx
// Stage 外で指/ボタンが離された場合も描画・範囲選択を確定する（revise3 A-5）
useEffect(() => {
    if (!drawingActive && !selectionRect.visible) return;
    const finish = () => {
        if (isDrawingRef.current && drawingShapeInfoRef.current) {
            // Konva を介さず現在の drawingShapeInfoRef の内容で確定する。
            // handleStageMouseUp の確定ロジックを共通関数 commitDrawing(index) に抽出して呼ぶこと。
            commitDrawing(drawingShapeInfoRef.current.canvasIndex ?? currentCanvasIndex);
        }
        setSelectionRect(prev => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('mouseup', finish);
    window.addEventListener('touchend', finish);
    return () => { window.removeEventListener('mouseup', finish); window.removeEventListener('touchend', finish); };
}, [drawingActive, selectionRect.visible]);
```
実装手順: `handleStageMouseUp` 内の「isDrawingRef.current && drawingShapeInfoRef.current」ブロック（矩形系確定＋線系確定）を `commitDrawing(index: number)` として関数抽出し、`handleStageMouseUp` と上記 finish の両方から呼ぶ。**Stage 上の mouseup では従来どおり範囲選択の交差判定を行い、window 側 finish では選択矩形は単に閉じるだけ**（ポインタ位置が不明のため）。二重確定は `isDrawingRef.current` を確定冒頭で false にすることで防ぐ（既存コードがそうなっている）。
- 受入: 矩形をドラッグ作成中にそのまま左の Tools 上へドラッグしてボタンを離す → その時点のサイズで矩形が確定し、キャンバスへ戻っても描画が続かない。範囲選択中に Stage 外で離す → 矩形が消え、次のクリックは通常動作。

## A-6【中】レイヤー順の up/down が「全ペイン共通配列」基準で、別ペインのオブジェクトを跨ぐだけの空振りが起きる

- 対象: `src/store/noteSlice.ts` L183-198（grep: `reorderNoteObject: (targetType`）
- 現象: `objects` 配列は 4 ペイン分を混載しており（`canvasIndex` で振り分け）、「前へ/後へ」は配列上の隣と入れ替わる。隣が**別ペインのオブジェクト**だと、描画順は変わらないのに履歴だけ積まれ「ボタンが効かない」ように見える。
- 修正: 同一ペイン内の次/前の要素の位置まで移動させる:
```ts
reorderNoteObject: (targetType, targetId, objId, direction) => {
    if (!get()._hasHydrated) return;
    const canvas = readCanvas(get(), targetType, targetId);           // A-4 のヘルパ
    const idx = canvas?.objects.findIndex(o => o.id === objId) ?? -1;
    if (!canvas || idx === -1) return;
    get().saveNoteHistory();
    set((state) => updateCanvasState(state, targetType, targetId, (c) => {
        const objs = [...c.objects];
        const i = objs.findIndex(o => o.id === objId);
        if (i === -1) return c;
        const pane = objs[i].canvasIndex || 0;
        const [item] = objs.splice(i, 1);
        if (direction === 'front') { objs.push(item); return { ...c, objects: objs }; }
        if (direction === 'back')  { objs.unshift(item); return { ...c, objects: objs }; }
        // up: 同一ペインで自分より後ろにある最初の要素の「後ろ」へ。down: 前にある最後の要素の「前」へ。
        if (direction === 'up') {
            let j = i; // splice 後、旧 i 位置以降が「自分より後ろ」
            while (j < objs.length && (objs[j].canvasIndex || 0) !== pane) j++;
            objs.splice(Math.min(j + 1, objs.length), 0, item);
        } else {
            let j = i - 1;
            while (j >= 0 && (objs[j].canvasIndex || 0) !== pane) j--;
            objs.splice(Math.max(j, 0), 0, item);
        }
        return { ...c, objects: objs };
    }));
},
```
- 受入: ペイン1に図形A/B（Bが上）、ペイン2に図形Cがあり配列順が A,C,B のとき、Bの「後へ」1回で A より下に描画される（従来は C と入れ替わって見た目不変だった）。既存の front/back は挙動不変。vitest にユニットテスト追加（配列順を直接検証）。

## A-7【低】円/三角のドラッグ作成でプレビュー矩形と確定形状が食い違う

- 対象: `CanvasWorkspace.tsx` L709-737（grep: `const isCentered = type === 'circle'`）と `NoteObjectComponents.tsx` L198-203（grep: `radius={(obj.width || 100) / 2}`）
- 現象: 描画中プレビューはドラッグ矩形（w×h）だが、Circle/RegularPolygon は `radius = width/2` で **height を無視**して描画される。縦長にドラッグすると「プレビューより小さい円」、横長だと「プレビューどおりの幅だが上下がはみ出す位置」になり、中心補正 `y + dragH/2` とも整合しない（半径は w/2 なのに中心は h/2 で置く）。
- 修正（作成時に正円へ正規化する。既存データはそのまま表示互換）: `handleStageMouseUp` の isDrag 分岐で circle/triangle のときは直径を `Math.min(dragW, dragH)` に丸め、width=height=その値、中心はドラッグ矩形の中心にする:
```tsx
if (isDrag) {
    const isCentered = type === 'circle' || type === 'triangle';
    const d = Math.min(dragW, dragH);   // 正円/正三角の直径（revise3 A-7）
    newObj = {
        id: baseId,
        type: type as NoteObjectType,
        x: isCentered ? (drawingShapeInfoRef.current.x as number) + dragW / 2 : (drawingShapeInfoRef.current.x as number),
        y: isCentered ? (drawingShapeInfoRef.current.y as number) + dragH / 2 : (drawingShapeInfoRef.current.y as number),
        width: isCentered ? d : dragW,
        height: isCentered ? d : dragH,
        // 以下既存のまま
    };
}
```
あわせて描画中プレビューも circle/triangle は正方形で出すと一貫する（`handleStageMouseMove` の rect 系ブロックで、type が circle/triangle のとき `newW = newH = Math.min(...)` にしてから node へ反映）。
- 受入: 縦長・横長どちらにドラッグしても、確定した円がプレビューの示した領域内に収まり中心が一致する。既存の保存済みオブジェクトの見た目が変わらない。

## A-8【中】貼り付けが preset の基準範囲外・画面外に落ちることがある

- 対象: `src/hooks/useNoteClipboard.ts` L41-64（grep: `const handlePasteClipboard`）
- 現象: 貼り付け位置は「元座標 +20」固定。fill 系の広いノートで右下に置いたオブジェクトをコピーし、事件ノート(preset)へ貼ると **1200×800 の範囲外**（Animate に映らない・ドラッグでしか救出できない）へ、狭いウィンドウの fill ノートへ貼るとビューポート外へ落ちる。ドラッグ移動時のクランプ（handleObjectDragEnd）や配置時クランプはあるのに、貼り付けだけ素通し。
- 修正: preset への貼り付けは基準範囲へクランプする（複数オブジェクトの相対位置は保ちたいので、**まとめて平行移動**でクランプ）:
```tsx
const handlePasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return;
    // ...既存の newObjs 生成...
    if (targetType === 'preset') {
        // 全体のバウンディングを 0..1200/0..800 内へ平行移動（相対位置は維持・revise3 A-8）
        const xs = newObjs.map(o => o.x || 0), ys = newObjs.map(o => o.y || 0);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const dx = minX < 0 ? -minX : (maxX > 1200 ? 1200 - maxX : 0);
        const dy = minY < 0 ? -minY : (maxY > 800 ? 800 - maxY : 0);
        // 幅が範囲より大きい場合は最低限先頭が見える位置へ
        newObjs.forEach(o => { o.x = Math.max(0, Math.min(1200, (o.x || 0) + dx)); o.y = Math.max(0, Math.min(800, (o.y || 0) + dy)); });
    }
    addNoteObjects(targetType, displayTargetId, newObjs);
    // ...既存...
}, [...]);
```
数値リテラルは `NOTE_CANVAS.W/H` を import して使うこと（`src/constants.ts`）。
- 受入: fill ノートの (2000, 900) にあるオブジェクトをコピー → 事件ノートに貼り付け → 1200×800 内に現れて選択状態になる。preset 以外への貼り付け挙動は不変。

## A-9【中】手書きフォントを Google Fonts CDN から取得している（オフライン/Tauri で欠落・表示ブロック）

- 対象: `CanvasWorkspace.tsx` L260-269（grep: `yomogi-font`）と `noteConstants.ts` L3（HANDWRITING_FONT）
- 現象: (1) デスクトップ(Tauri)はオフラインでも動く建前だが、フォントだけネットワーク必須で、オフライン起動時は Yomogi が落ちて代替フォントに変わる＝**環境によりノートの見た目が変わる**。(2) `document.fonts.ready` が解決するまで `isFontLoaded=false` でオブジェクトを一切描画しない（grep: `{isFontLoaded && objs.map`）ため、CDN が遅い/落ちている環境では**キャンバスが空に見える時間が生じる**。CLAUDE.md の「Web/デスクトップ両対応・フォールバック必須」に反する。
- 修正:
  1. フォントを self-host する: [Yomogi は SIL OFL](https://fonts.google.com/specimen/Yomogi/license) なので同梱可。`public/fonts/Yomogi-Regular.ttf`（Sonnet は google/fonts の GitHub raw から取得を試み、**ネットワーク不可なら手順だけ残してユーザー作業に委ねる**）。`src/styles/App.scss` 冒頭に:
```scss
@font-face {
    font-family: 'Yomogi';
    src: url('/fonts/Yomogi-Regular.ttf') format('truetype');
    font-display: swap;
}
```
  2. `CanvasWorkspace.tsx` の `<link>` 注入 effect を削除し、タイムアウト付きロード待ちに変更:
```tsx
useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setIsFontLoaded(true); } };
    // FontFaceSet で明示ロード。1.5s で諦めて代替フォントのまま描画を開始する（revise3 A-9）
    document.fonts.load('24px "Yomogi"').then(finish).catch(finish);
    const t = setTimeout(finish, 1500);
    return () => clearTimeout(t);
}, []);
```
  3. PWA precache へ含める: `vite.config.ts` の `globPatterns` に `"**/*.{js,css,html,ttf}"`（grep: `globPatterns`）。
- 受入: ネットワークを切って `npm run dev`（および `npm run tauri dev`）→ テキストが Yomogi で描画される。CDN への `<link>` が DOM に存在しない。フォントロードに失敗させても 1.5 秒以内にオブジェクトが表示される。

## A-10【低】fill 系ノートの PNG 書き出し解像度が無制限（巨大ウィンドウでメモリ急増/失敗）

- 対象: `CanvasWorkspace.tsx` capturePane（grep: `pixelRatio: 2 / s`）
- 現象: fill 系は書き出しサイズ = 論理ビューポート×2。4K 横長ウィンドウ等でビューポートが論理 3000px 超になると出力 6000px 級の canvas を 4 枚（全ペイン書き出し時）生成し、モバイル/低メモリ環境で `toDataURL` 失敗（catch には落ちるが原因が分からない）や freeze の懸念。
- 修正: 出力の長辺を 4096px に制限:
```tsx
const s = layer.scaleX() || 1;
// 論理×2 を基本に、出力長辺が 4096px を超える場合は縮める（revise3 A-10）
const logicalW = stage.width() / s, logicalH = stage.height() / s;
const ratio = Math.min(2, 4096 / Math.max(logicalW, logicalH));
return stage.toDataURL({ pixelRatio: ratio / s, mimeType: 'image/png' });
```
注意: 22.md §E の `drawPaper(…, k)` は k=2 固定で書かれている。この項を実施する場合は capturePane が `{ url, k }` を返すよう変更し、`drawPaper` へ実際の k（=ratio）を渡すこと（方眼ピッチが出力と一致し続けるように）。
- 受入: 通常サイズでは従来どおり論理×2。ウィンドウを極端に広げた fill ノートの書き出しでも成功し、長辺 4096px 以下。方眼ピッチが描画物と相似のまま。

## A-11【低】テキスト選択中のフローティングツールバーがドラッグ/変形に追従しない

- 対象: `CanvasWorkspace.tsx` renderFloatingTextToolbar（grep: `const renderFloatingTextToolbar`）
- 現象: 位置は render 時に Konva ノードから読むが、**ドラッグ中/変形中は React が再レンダリングされない**ため、テキストを動かしてもツールバーが旧位置に残る。確定（dragend で store 更新）まで乖離したまま。
- 修正: 位置を state 化せず、ドラッグ確定/選択変更時に再計算されれば十分なので、最小修正として「ドラッグ中はツールバーを隠す」:
```tsx
const [draggingSelection, setDraggingSelection] = useState(false);
```
オブジェクト props の `onDragStart` 冒頭で `setDraggingSelection(true)`、`handleObjectDragEnd` の末尾で `setDraggingSelection(false)`。`renderFloatingTextToolbar` 冒頭に `if (draggingSelection) return null;` を追加。Transformer での変形も同様に `onTransformStart/End` があれば隠す（Transformer には `onDragStart` が無いので、テキスト単独選択時はアンカー無効のため変形は考慮不要）。
- 受入: テキストをドラッグ中はツールバーが消え、離した位置の上に再表示される。旧位置に残らない。

## A-12【中】ヘルプ/ツアー表示中もキャンバスのショートカット（Delete 等）が生きている + Backspace の既定動作未抑止

- 対象: `src/hooks/useNoteKeyboard.ts` L105-108（grep: `e.key === 'Delete' || e.key === 'Backspace'`）と `src/hooks/useTutorial.ts`
- 現象: (1) ガードは `dialog` と入力要素のみ。HelpDrawer/SpotlightTour を開いたまま Delete/Ctrl+Z 等を押すと**背後のキャンバスで削除や undo が実行される**（ツアーはクリックだけブロックしてキーはブロックしない）。(2) Delete/Backspace に `preventDefault()` が無い。
- 修正:
  1. `uiSlice` に `helpOverlayOpen: boolean; setHelpOverlayOpen: (v: boolean) => void;` を追加（persist 除外。`src/store/persistStorage.ts` の partialize 相当があれば除外リストへ——`noteClipboard` 等と同じ扱い。無ければ何もしなくてよいが確認すること）。
  2. `useTutorial.ts` で `drawerOpen || tourOpen` が変わるたびに `setHelpOverlayOpen(drawerOpen || tourOpen)` を effect で反映。
  3. `useNoteKeyboard.ts` の dialog ガード行の直後に `if (useAppStore.getState().helpOverlayOpen) return;` を追加。
  4. Delete/Backspace 分岐に `e.preventDefault();` を追加。
- 受入: ヘルプを開いて Delete/Ctrl+Z → キャンバスに変化なし。閉じた後は従来どおり。オブジェクト選択中の Backspace でブラウザ側の副作用（スクロール等）が起きない。

## A-13【低】ResizeObserver の 2px 閾値でコンテナと Stage 寸法がズレたままになる

- 対象: `CanvasWorkspace.tsx` L240-245（grep: `Math.abs(prev.width - newWidth) < 2`）
- 現象: パネルのリサイザーを 1px 刻みでゆっくりドラッグすると、変化が閾値未満のため `canvasSize` が更新されず、Stage と実コンテナに最大 2px 弱の不一致が累積し得る（右端に細い背景スジ・クリック座標の僅かなズレ）。閾値は再レンダリング抑制目的だが、ResizeObserver 自体が既に変化時のみ発火する。
- 修正: 閾値を 1px 未満切り捨て（完全一致比較）へ変更:
```tsx
setCanvasSize(prev => (prev.width === newWidth && prev.height === newHeight) ? prev : { width: newWidth, height: newHeight });
```
（Math.round 済みなので同値スキップだけで十分。パフォーマンスが気になる場合のみ rAF デバウンスを足すが、必須ではない）
- 受入: リサイザーを 1px ずつ動かしても Stage 右端とコンテナ境界に隙間が出ない。連続リサイズで体感の重さが増えない。

## A-14【中】画像アセット削除が index 参照で、メニュー表示中に一覧が変わると別の画像を消す

- 対象: `CanvasWorkspace.tsx` assetContextMenu（grep: `removeNoteAsset(targetType, displayTargetId, assetContextMenu.index)`）と `NoteToolsSidebar.tsx` の `onAssetContextMenu(idx, ...)`
- 現象: 右クリック時点の `index` を保持し、クリック時に `removeNoteAsset(index)` する。メニューを開いたまま（メニューは outside-click で必ず閉じるわけではない——Stage 上 mousedown でのみ閉じる）別画像の追加・undo・別タブでの変更が起きると index がズレ、**無関係の画像が削除される**。
- 修正: メニュー state に asset の**値（文字列キー）**を持たせ、削除時に現在の assets から index を解決する:
```tsx
const [assetContextMenu, setAssetContextMenu] = useState<{ asset: string, x: number, y: number } | null>(null);
// NoteToolsSidebar 側: onContextMenu={(e) => { e.preventDefault(); onAssetContextMenu(asset, e.clientX, e.clientY); }}
//（props の型も (asset: string, x, y) => void に変更）
// 削除クリック:
onClick={() => {
    const idx = assets.indexOf(assetContextMenu.asset);
    if (idx !== -1) removeNoteAsset(targetType, displayTargetId, idx);
    else toast.info('この画像は既に削除されています');
    setAssetContextMenu(null);
}}
```
（noteSlice の `removeNoteAsset(index)` API はそのままでよい。なお未参照 Blob の掃除は `sweepOrphanAssets` が起動時に実施済みのため不要）
- 受入: 画像Aのメニューを開いたまま Ctrl+Z でアセット一覧を変化させてから Delete Image → **A が存在すれば A だけ**が消え、無ければトーストが出て何も消えない。

## A-15【低】マルチタッチで描画/選択が混線する（2本目の指が mousedown 扱い）

- 対象: `CanvasWorkspace.tsx` handleStageMouseDown（grep: `const isTouch = typeof TouchEvent`）
- 現象: 1本目の指でフリーハンド描画中に2本目の指が触れると、touchstart が再度 `handleStageMouseDown` に入り、描画情報の作り直し・範囲選択の開始などが混線する（将来ピンチズーム（B-3）を入れる際の前提整備でもある）。
- 修正: ハンドラ冒頭に:
```tsx
const isTouch = typeof TouchEvent !== 'undefined' && e.evt instanceof TouchEvent;
if (isTouch && (e.evt as TouchEvent).touches.length > 1) return;   // マルチタッチはジェスチャ予約（revise3 A-15）
if (!isTouch && (e.evt as MouseEvent).button !== 0) return;
```
`handleStageMouseMove` にも同様のガードを追加（描画中に2本目が増えたら以降の move を無視。touchend で自然に確定される）。
- 受入: フリーハンド描画中に2本目の指を置いても線が飛ばない/選択矩形が出ない。1本指の操作は従来どおり。

---

# Part B — UX を妨げる実装・UI 20 件

## B-1【高・モバイル致命】配置モード（ペン/図形）を解除する手段がタッチに無い

- 対象: `CanvasWorkspace.tsx` startPlacement（grep: `const startPlacement`）、`CompactToolbar.tsx` / `NoteToolsSidebar.tsx` の各ツールボタン
- 問題: 解除は Esc のみ（useNoteKeyboard）。フリーハンドは描き終えても placementMode が残る仕様のため、**ソフトキーボードの無いスマホでは永久にペンモード**になり、以後オブジェクトの選択・移動が一切できなくなる（draggable=false・タップは新規描画になる）。
- 修正: 「同じツールをもう一度押すと解除」のトグル化（両ツールバー共通で効く）:
```tsx
const startPlacement = (type: ExtendedNoteObjectType, data?: string) => {
    setPlacementMode(prev => (prev?.type === type && prev?.data === data) ? null : { type, data });
    setSelectedIds([]);
};
```
`setPlacementMode` は useState のセッタなので関数型更新がそのまま使える。ボタンの active 表示（`placementMode?.type === 'freehand'` 等）は既存のまま「もう一度押すと消灯」となり、視覚的にもトグルだと分かる。B-10 のキャンセルチップと併せて二重の逃げ道を作る。
- 受入: 375px でペンを選び1本描いた後、ペンボタン再タップ → 点灯が消え、オブジェクトをタップ選択できる。デスクトップは Esc も従来どおり。

## B-2【高・モバイル致命】Undo/Redo ボタンが UI に存在しない（Ctrl+Z 専用）

- 対象: `CompactToolbar.tsx`（モバイル/Animate）と `NoteToolsSidebar.tsx`（デスクトップ）
- 問題: スマホでは誤操作（誤削除・誤ドラッグ）を取り消す手段が無い。B-1 と並びタッチ利用の最重要欠落。
- 修正: CanvasWorkspace から `undoNote`/`redoNote` を両ツールバーへ渡す。
  - `CompactToolbar` props に `onUndo: () => void; onRedo: () => void;` を追加し、ボタン列の先頭に:
```tsx
<div style={{ display: 'flex', gap: '4px' }}>
    <button title="元に戻す (Ctrl+Z)" onClick={onUndo} style={{ ...toolTextBtnStyle(false), width: '50%' }}>↩</button>
    <button title="やり直し (Ctrl+Y)" onClick={onRedo} style={{ ...toolTextBtnStyle(false), width: '50%' }}>↪</button>
</div>
```
  - `NoteToolsSidebar` は Tools 見出し行（grep: `<h3 style={{ margin: 0 }}>Tools</h3>`）の右側、スナップ⌗ボタンの隣に同型の小ボタン2つ。
  - CanvasWorkspace 側の handler は選択解除も併せる: `const handleUndo = () => { undoNote(); setSelectedIds([]); };`（useNoteKeyboard と同じ挙動）。
- 受入: 375px でオブジェクト削除 → ↩ タップで復活 → ↪ で再削除。デスクトップ Tools でも同様。

## B-3【高・工数中】モバイルの Canvas にピンチズーム/パンが無く、文字が読めない・細かい操作ができない

- 対象: `CanvasWorkspace.tsx` の Stage/Layer（grep: `<Layer scaleX={effScale}`）
- 問題: 375px 幅では preset の effScale ≈ 0.29。fontSize 24 のテキストは実表示 7px、Transformer のアンカーも米粒で、閲覧も編集も実質不可能。デスクトップ前提の「全体が常に見える」方針がモバイルでは逆効果。
- 修正方針（compactMode かつタッチ時のみの追加レイヤー変換。既存の effScale 系の式は触らない）:
  1. state 追加: `const [touchView, setTouchView] = useState({ scale: 1, x: 0, y: 0 });`（ノート/ペイン切替でリセット）。
  2. Layer に合成適用: `<Layer scaleX={effScale * touchView.scale} scaleY={effScale * touchView.scale} x={touchView.x} y={touchView.y}>`。
  3. Stage の `onTouchMove` で 2 本指を検出したら（A-15 のガードで描画系は既に無視される）、2点間距離の比で scale を、midpoint の移動で x/y を更新する標準的なピンチ実装を入れる。clamp: scale 1〜4、x/y は紙面が完全に画面外へ出ない範囲。`e.evt.preventDefault()` を忘れない。
  4. `onTouchEnd` で指が 1 本以下になったらジェスチャ終了。**ダブルタップでリセット**（`{ scale: 1, x: 0, y: 0 }`）。
  5. 追従が必要な既存 UI: テキスト編集 textarea の position 計算（grep: `stageOffsetY + obj.y * effScale`）を `stageOffsetY + touchView.y + obj.y * effScale * touchView.scale`（fontSize も同様に倍率を掛ける）へ。選択破線/Transformer は Layer 内なので自動追従。`getRelativePointerPosition()` を使っている配置/描画/範囲選択は Layer 変換を自動で吸収するため**修正不要**（これがこの設計の利点）。
  6. compactMode でない場合は一切変更なし。
- 受入: 375px の事件ノートで2本指ピンチ → 拡大され、1200×800 内のテキストが読める。拡大中でもタップ選択・ドラッグ移動・テキスト編集位置が正しい。ダブルタップで全体表示へ戻る。デスクトップ挙動不変。

## B-4【中】タッチで図形の詳細メニュー（線色/塗り/線種）が開けない

- 対象: `NoteObjectComponents.tsx`（onContextMenu は右クリックのみ）、`CanvasWorkspace.tsx` handleShapeContextMenu
- 問題: SelectionContextBar で代表色と線幅は変えられるが、塗り(fill)・線種(lineStyle)・No Fill・最前面/最背面はタッチから到達不能。
- 修正: 長押し（500ms・移動 10px 未満）で ShapeContextMenu を開く。CanvasWorkspace に共有タイマー ref を置き、オブジェクト props に追加:
```tsx
const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null, x: number, y: number }>({ timer: null, x: 0, y: 0 });
// props 生成部（objs.map 内）に追加:
onTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length !== 1) return;
    const t = e.evt.touches[0];
    longPressRef.current = {
        x: t.clientX, y: t.clientY,
        timer: setTimeout(() => { setShapeContextMenu({ id: obj.id, type: obj.type as ExtendedNoteObjectType, x: t.clientX, y: t.clientY, stroke: obj.stroke || '#000000', strokeWidth: obj.strokeWidth || 2, fill: obj.fill, lineStyle: obj.lineStyle || 'normal' }); }, 500),
    };
},
onTouchMove/onTouchEnd 相当: タイマー clear（Stage 側 handleStageMouseMove/Up の冒頭で `if (longPressRef.current.timer) { clearTimeout(...); timer=null; }` を移動量>10px と touchend で呼ぶ）。
```
`NoteObjectComponentProps` に `onTouchStart?` を追加し、URLImage/EditableText/ShapeObject の Konva ノードへ素通しする。テキストは既存メニュー対象外なので付けない（現状の onContextMenu と同じ対象 = 図形/画像）。App.tsx がグローバルで contextmenu を preventDefault 済みなので OS の長押しメニューとは競合しない。
- 受入: 375px で図形を500ms 長押し → メニューが指の位置に開き、No Fill/線種変更ができる。ドラッグ開始（すぐ動かす）ではメニューが開かない。

## B-5【低】右クリック/長押しメニューが画面端で見切れる

- 対象: `ShapeContextMenu.tsx`（width 200 + padding、内容次第で高さ 400px 超）と CanvasWorkspace の assetContextMenu
- 問題: `position: fixed; top: y; left: x` 直置きなので、画面右端・下端で操作不能領域へはみ出す。
- 修正: ShapeContextMenu のルート div を ref 化し、useLayoutEffect で実測クランプ:
```tsx
const ref = useRef<HTMLDivElement>(null);
const [pos, setPos] = useState({ x: menu.x, y: menu.y });
useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
        x: Math.min(menu.x, window.innerWidth - r.width - 8),
        y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
}, [menu.x, menu.y, menu.type]);
// style={{ position:'fixed', top: Math.max(8, pos.y), left: Math.max(8, pos.x), ... }}
```
assetContextMenu は高さ固定 ~36px なので簡易クランプで十分: `top: Math.min(assetContextMenu.y, window.innerHeight - 44), left: Math.min(assetContextMenu.x, window.innerWidth - 130)`。
- 受入: 画面右下隅の図形で メニューを開いてもメニュー全体が画面内に収まり、全項目を操作できる。

## B-6【中】フローティング窓（画像ギャラリー・再生盤）のドラッグ移動がマウス専用

- 対象: `CanvasWorkspace.tsx` handleGalleryDragStart + mousemove/mouseup effect（grep: `const handleGalleryDragStart`）、`AnimateView.tsx` handleTimelineDragStart（grep: `const handleTimelineDragStart`）
- 問題: `onMouseDown` + window `mousemove` 実装なのでタッチで一切動かせない。モバイル Animate で画像ギャラリーがキャンバスに被っても退かせない。
- 修正: Pointer Events へ置換（両方同じパターン）:
```tsx
const handleGalleryDragStart = (e: React.PointerEvent) => {
    const start = galleryPos ?? { /* 既存の初期位置 */ };
    setIsDraggingGallery(true);
    galleryDragRef.current = { x: e.clientX, y: e.clientY, posX: start.x, posY: start.y };
    if (!galleryPos) setGalleryPos(start);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
};
// effect 側: 'mousemove'→'pointermove'、'mouseup'→'pointerup' に変更（ロジック不変）
// ImageGalleryWindow の <div onMouseDown={onDragStart}> → onPointerDown に変更し、
// ヘッダに style={{ touchAction: 'none' }} を追加（スクロールに奪われないように）
```
AnimateView の再生盤フローティングも同様（`onMouseDown={handleTimelineDragStart}` → onPointerDown、effect のイベント名変更、ハンドルに touchAction none）。
- 受入: タッチエミュレーションで画像ギャラリーのヘッダをドラッグ → 移動できる。マウスでも従来どおり。フローティング再生盤（📌解除時）も同様。

## B-7【中】モバイル Note で選択バーがキャンバス上端に被る/出没する（Animate 版 22§B の Note 展開）

- 対象: `CanvasWorkspace.tsx` の compact overlay 分岐（22.md §B 適用後、grep: `compactSlot`）
- 問題: 22§B はモバイル **Animate** のみスロット化する。モバイル **Note**（overview/preset/character/misc）は overlay のままで、選択のたびにバーがキャンバス上端の描画物に被さり、消えるとき「ピコピコ」が残る。
- 修正: compactMode かつスロットが無い場合、overlay ではなく**常設の高さ 36px 行**を headerBar の直下（canvas wrapper の先頭・通常フロー）に置く。選択が無い間はヒント文を出す:
```tsx
{compactMode && !compactSlot && (
    <div style={{ flexShrink: 0, height: 36, display: 'flex', alignItems: 'center', overflowX: 'auto',
                  background: 'var(--surface-2)', borderBottom: '1px solid var(--border-default)' }}>
        {selectedIds.length > 0 ? selectionBar : (
            <span style={{ padding: '0 10px', fontSize: '0.72rem', color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>
                オブジェクトをタップで選択 / ツールをもう一度タップで解除
            </span>
        )}
    </div>
)}
```
既存の absolute overlay 分岐は削除。行が常設なのでキャンバス高さは不変（マウント時から 36px 確保）で、被りもピコピコも消える。selectionBar の variant は `'topbar'` に変更（透明・32px、行内に収まる）。**デスクトップ Animate のセル（compact だがスロット無し）にもこの行が付く**——セル上端に常設ヒント行が出るのは許容（むしろ Animate でも被りが消える）。
- 受入: 375px の Note でオブジェクト選択/解除を繰り返してもキャンバスが動かず、描画物にバーが被らない。ヒント行が非選択時に表示される。

## B-8【中】タッチターゲットが小さすぎるコントロールの一括かさ上げ

- 対象: `SelectionContextBar.tsx` segBtnStyle（padding 3px 8px ≈ 高さ 24px）、`NoteToolsSidebar.tsx` shapes-grid の絵文字ボタン、CanvasWorkspace の表示モードセグメント（grep: `minHeight: '30px'`）、ContextBar の「▶」expand-btn、線幅スライダー（width 70px）
- 問題: CLAUDE.md のタッチ配慮（十分な大きさ）に対し、多数のボタンが 24〜30px。スマホで押しにくく誤タップを誘発。
- 修正: ポインタが粗い環境でだけ底上げする CSS を `src/styles/App.scss` に追加し、インライン style の該当箇所へ最低寸法を付与:
```scss
// タッチ環境ではボタン類の最小ヒット領域を 40px 角へ底上げ（revise3 B-8）
@media (pointer: coarse) {
    .char-sidebar .shapes-grid button,
    .char-sidebar .tool-buttons > button { min-height: 40px; }
    .note-selection-slot button, .note-selection-slot input[type='color'] { min-height: 32px; min-width: 32px; }
    input[type='range'] { min-height: 32px; }   // つまみ自体の拡大は accent-color 依存で可
}
```
インライン定義の SelectionContextBar segBtnStyle は `minHeight: 28`→そのまま、`padding: '3px 8px'`→`'5px 10px'` に増やす（デスクトップでも許容できる差）。表示モードセグメントは `minHeight: '30px'`→`'36px'`。
- 受入: 375px タッチエミュレーションで選択バー・図形ツール・1面/4面/編集セグメントが指で確実に押せる（DevTools で各ボタンの実高さ ≥32px を確認）。デスクトップの見た目が破綻しない。

## B-9【中】4面表示でペインを1回クリックしただけで単一表示へ戻ってしまう

- 対象: `CanvasWorkspace.tsx` ペイン div の onClick（grep: `4ペイン表示中はどのペインをクリックしても単一表示へ戻す`）
- 問題: 4面はレイアウト俯瞰にも使うのに、ちょっと触れただけでモードが変わる。特にタッチではスクロール/誤タップで頻発し、「4面が維持できない」という体感になる。
- 修正: シングルクリック=対象ペインの切替のみ、**ダブルクリック（タッチはダブルタップ）で単一表示へ拡大**:
```tsx
const lastPaneTapRef = useRef<{ index: number, t: number }>({ index: -1, t: 0 });
// onClick を置換:
onClick={(e) => {
    if (!(isGridMode && !isGridEditMode)) return;
    const now = performance.now();
    const isDouble = lastPaneTapRef.current.index === index && now - lastPaneTapRef.current.t < 350;
    lastPaneTapRef.current = { index, t: now };
    if (isDouble) {
        setCurrentCanvasIndex(index);
        setSelectedIds([]);
        setIsGridMode(false);
    } else {
        setCurrentCanvasIndex(index);   // 選択ペインの青枠だけ移動
    }
    e.stopPropagation();
}}
```
「1面」ボタンでも戻れる（既存セグメント）。ペインの title 属性に「ダブルクリックで拡大」を追加。
- 受入: 4面でペインをシングルクリック → 青枠が移るだけで 4 面のまま。素早く2回で単一表示へ。編集モード（isGridEditMode）の挙動は不変。

## B-10【中】配置モード中であることが画面から分からない（特にタッチ・freehand 継続時）

- 対象: `CanvasWorkspace.tsx`（カーソル crosshair のみが手掛かり。grep: `cursor: placementMode && isCurrent`）
- 問題: タッチにはカーソルが無い。ペンモードが継続する仕様（mouseup 後も placementMode 維持）なので、今どのモードかの常時表示と即時解除手段が必要。
- 修正: placementMode 中のみ、canvas wrapper 左上に状態チップを出す（B-1 のトグルと対）:
```tsx
{placementMode && (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
                  display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,122,204,0.9)', color: '#fff',
                  borderRadius: 16, padding: '4px 12px', fontSize: '0.78rem', pointerEvents: 'auto' }}>
        <span>{PLACEMENT_LABELS[placementMode.type] ?? placementMode.type} 配置中</span>
        <button onClick={() => setPlacementMode(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}
            title="解除 (Esc)">✕</button>
    </div>
)}
```
`PLACEMENT_LABELS` は noteConstants.ts に追加: `{ text: 'テキスト', freehand: 'ペン', circle: '円', triangle: '三角', rect: '四角', line: '直線', arrow: '矢印', curve: '曲線', curve_arrow: '曲線矢印', image: '画像' }`。
- 受入: どのツールを選んでも中央上にチップが出て、✕ タップ/Esc で消える。非配置時は何も出ない。

## B-11【低】貼り付けが常に「元位置+20」固定で、連続貼り付けが完全に重なる

- 対象: `src/hooks/useNoteClipboard.ts`（grep: `x: (o.x || 0) + 20`）
- 問題: 同じ内容を2回以上貼ると全部同じ場所に積まれ、貼れていないように見える（実際は N 枚重なっている）。
- 修正: クリップボード世代ごとの貼り付け回数をカウントし、オフセットを累積:
```tsx
const pasteCountRef = useRef(0);
// setClipboard を呼ぶ handleCopySelected / handleCutSelected 内で pasteCountRef.current = 0;
// handlePasteClipboard 内:
pasteCountRef.current += 1;
const off = 20 * pasteCountRef.current;
// x: (o.x || 0) + off, y: (o.y || 0) + off
```
useRef を import。クリップボードは store 管理だがカウンタはコンポーネントローカルで十分（ノートを跨いだら 0 から数え直しでも違和感がない）。A-8 のクランプはオフセット適用後に効かせる。
- 受入: 同一オブジェクトを3回貼り付け → 階段状に3つ並ぶ。コピーし直すとオフセットが 20 に戻る。

## B-12【低】「Canvas N」ラベルが単一表示でも常時紙面に被っている

- 対象: `CanvasWorkspace.tsx`（grep: `Canvas {index + 1}`）
- 問題: 単一表示では現在ペイン番号は左下セグメント等で分かる一方、ラベルが紙面左上を常時占有し、そこに置いた描画物と重なる。
- 修正: 4面（isGridMode）のときだけ表示する:
```tsx
{isGridMode && (
    <div style={{ /* 既存のまま */ }}>Canvas {index + 1}</div>
)}
```
単一表示でどのペインか知りたいニーズには、表示モードセグメント横に小さく `Canvas {currentCanvasIndex + 1}` を出す（同じ bottom バー内、fontSize 0.72rem、color #888）。
- 受入: 単一表示で左上ラベルが消え、右下セグメント付近に現在ペイン番号が見える。4面では従来どおり各ペインに表示。

## B-13【低】色変更がネイティブカラーピッカー頼みで、よく使う色に2タップで届かない

- 対象: `SelectionContextBar.tsx`（input[type=color]）と `CompactToolbar.tsx`/`NoteToolsSidebar.tsx` の freehand 設定
- 問題: スマホの OS カラーピッカーは重く、推理ノート用途では「黒・赤・青・緑」等の定番色を高速に切り替えたい。
- 修正: 定番8色のスウォッチを input[type=color] の隣に置く共通小コンポーネントを `note/ColorSwatches.tsx` として新設:
```tsx
const SWATCH_COLORS = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#7c5cff', '#ffffff', '#8b5e3c'];
export const ColorSwatches: React.FC<{ value: string | null; onPick: (c: string) => void }> = ({ value, onPick }) => (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {SWATCH_COLORS.map(c => (
            <button key={c} onClick={() => onPick(c)} title={c}
                style={{ width: 18, height: 18, minWidth: 18, borderRadius: 4, cursor: 'pointer', padding: 0,
                         background: c, border: value?.toLowerCase() === c ? '2px solid var(--focus, #66b3ff)' : '1px solid #555' }} />
        ))}
    </div>
);
```
SelectionContextBar の色 input の直後（`onPick={onColorChange}`）と、freehand 設定の color input の隣（`onPick={c => onFreehandSettingsChange(s => ({...s, color: c}))}`）に挿す。SelectionContextBar は横スクロール可なので幅増は許容。
- 受入: 選択バー/ペン設定で赤スウォッチをタップ → 即時反映（undo 1回で戻る=既存の saveHistoryOnceThenSkip 経路を通ること。onColorChange をそのまま使えば満たされる）。

## B-14【低】Tools の図形ボタンが記号のみで機能が判別しにくい

- 対象: `NoteToolsSidebar.tsx` shapes-grid（grep: `gridTemplateColumns: 'repeat(4, 1fr)'`）
- 問題: `○ △ ■ ─ → ~ ↷` は初見で「~ と ↷ の違い」「─ が直線ツール」と分からない。CompactToolbar（モバイル）は既にテキスト付きで解決済みなのに、デスクトップだけ記号のみ。
- 修正: 2列グリッドにしてラベルを併記（CompactToolbar と同じ文言）:
```tsx
<div className="shapes-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
    <button ...>✏️ ペン</button>
    <button ...>○ 円</button>
    <button ...>△ 三角</button>
    <button ...>■ 四角</button>
    <button ...>─ 直線</button>
    <button ...>→ 矢印</button>
    <button ...>～ 曲線</button>
    <button ...>↷ 曲線矢印</button>
</div>
```
`NoteView.scss` の `.shapes-grid button` に `font-size: 0.72rem; white-space: nowrap;` を追加してはみ出しを防ぐ（既存スタイルを確認して調整）。
- 受入: デスクトップ Tools で全図形ボタンに日本語ラベルが見え、幅 200px のサイドバーで折り返し・はみ出しが無い。

## B-15【中】Note のツール群・キャンバス余白の色がテーマ（セピア）に追従しない

- 対象: `CanvasWorkspace.tsx` の `toolTextBtnStyle`（#333/#555 直書き、grep: `background: isActive ? 'rgba(0, 122, 204, 0.2)' : '#333'`）、compact ツールバー背景 `#1a1a1a`、canvas wrapper / ペイン背景 `#1e1e1e`（grep: `backgroundColor: '#1e1e1e'`）、`NoteToolsSidebar.tsx` の #3a3a3a ボタン群、選択バーの dividerStyle `#444` ほか
- 問題: F6 のテーマ切替は CSS 変数ベースだが、Canvas 周りはインライン直書き色が大量に残り、セピアにすると Note まわりだけダークのまま浮く（0711 #6 の残党）。紙面(#ECD2B3)と Konva 内はテーマ対象外という決定は維持する。
- 修正:
  1. `src/styles/_tokens.scss` に不足トークンを追加（既存トークン名は現物を確認して合わせる）: `--canvas-margin`（ペイン余白: dark=#1e1e1e / sepia=#d8c6ae など暗すぎない値）。
  2. 直書き色を変数参照へ機械的に置換: `#1e1e1e`→`var(--canvas-margin, #1e1e1e)`（canvas wrapper・ペイン背景・NotesPanel の背景）、`#333`/`#3a3a3a`→`var(--surface-3, #333)` と `var(--surface-4, #3a3a3a)`、`#555`→`var(--border-strong, #555)`、`#444`→`var(--border-default, #444)`、`#ccc`→`var(--text-secondary, #ccc)`、`#1a1a1a`→`var(--surface-1, #1a1a1a)`。フォールバック付きで置換すれば挙動退行はない。
  3. 対象ファイル: CanvasWorkspace.tsx / NoteToolsSidebar.tsx / CompactToolbar.tsx / SelectionContextBar.tsx / ImageGalleryWindow.tsx（こちらは概ね対応済み・残りの #555 系のみ）/ NotesPanel.tsx。
- 受入: セピアに切り替えると Note の Tools・選択バー・ペイン余白・compact ツールバーがセピア系配色になる。ダークでは従来と同一（フォールバック値）。紙面と Konva 内描画は不変。

## B-16【低】イベント一覧クリックのフィードバックが乏しい（どこに飛んだか分からない）

- 対象: `src/components/common/EventList.tsx` / `AnimationTimeline.tsx`（22.md §D 適用後）
- 問題: クリックでシークされても、再生バーの位置がわずかに動くだけで気付きにくい。デスクトップではフロア4面のどこを見ればいいかも示されない。
- 修正:
  1. クリックした行を 1 秒ハイライト: EventList に `const [flashIdx, setFlashIdx] = useState(-1);` を持ち、onClick で `setFlashIdx(i); setTimeout(() => setFlashIdx(-1), 1000);`、行 style に `background: flashIdx === i ? 'rgba(102,179,255,0.18)' : undefined`。
  2. ジャンプ時にトースト: AnimationTimeline の onJump 内で `toast.info(\`${formatTime(Math.max(0, ev.t))} / ${ev.label} へジャンプ\`);`（`services/toast` を import）。
  3. 22§D のフロアバッジ（一覧行の 2F/1F/B1 表示）はデスクトップでも「どのマップを見るべきか」の答えになる——§D を先に適用していることを確認。
- 受入: イベント行クリックで行が一瞬光り、トーストに時刻と地点名が出る。連打してもトーストが溜まりすぎない（toast サービスの既存挙動に従う）。

## B-17【中】事件ノートに書き込むたびに再生が止まる（canvas 全般 pointerdown で一時停止）

- 対象: `AnimationTimeline.tsx` L35-43（grep: `e.target instanceof HTMLCanvasElement`）
- 問題: 「マップをつかんだら再生停止」の意図に対し、判定が **HTMLCanvasElement 全部**なので、Animate 内の事件ノート Canvas（Konva）へ書き込む/選択するだけで毎回停止する。再生を見ながらメモを取る使い方が阻害される。
- 修正: ノート系コンテナ内の canvas を除外する:
```tsx
const handlePointerDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLCanvasElement)) return;
    // 事件ノート（.notes-section=デスクトップ / .note-body=モバイル）内の canvas では停止しない（revise3 B-17）
    if (t.closest('.notes-section, .note-body')) return;
    setIsPlaying(false);
};
```
- 受入: Animate 再生中に事件ノートへペンで書く → 再生が続く。マップの canvas をタッチ → 従来どおり停止する。

## B-18【中】モバイル Note で左ドックのツールバーが横幅を食い、キャンバスがさらに狭くなる

- 対象: `CanvasWorkspace.tsx` compact ツールバー配置（grep: `compactMode && compactToolbarW > 4`）と幅計算（grep: `compactToolbarW = Math.max(COMPACT_SIDE_MIN`）
- 問題: 375px 幅で左に COMPACT_SIDE_MIN（`src/constants.ts` の NOTE_CANVAS.COMPACT_SIDE_MIN。現値を確認）を常時確保するため、ただでさえ狭い紙面が縦画面でさらに削られる。縦スクロールの縦長ツール列は片手操作でも遠い。
- 修正: **モバイルビューポートでは下部の横スクロール列**に切り替える。CanvasWorkspace 内で `const isMobileVp = useViewport() === 'mobile';`（`hooks/useViewport` を import）を追加し:
  1. `compactToolbarW` の計算を `if (compactMode && !isMobileVp) { ...既存... }`（モバイルは 0 のまま → panesW = 全幅）。
  2. ペイン行の後（canvas wrapper 内の最下部、表示モードセグメントより DOM 上前）に:
```tsx
{compactMode && isMobileVp && (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'row', gap: 4, overflowX: 'auto',
                  padding: '4px 6px', background: 'var(--surface-1, #1a1a1a)', borderTop: '1px solid var(--border-default, #333)',
                  WebkitOverflowScrolling: 'touch' }}>
        {renderPortalUI()}
    </div>
)}
```
  3. `CompactToolbar` に `orientation?: 'vertical' | 'horizontal'` prop を追加し、horizontal のときルートを `flexDirection: 'row'`、各ボタンを `width: 'auto', whiteSpace: 'nowrap', flexShrink: 0` に（toolTextBtnStyle の `width: '100%'` を打ち消す）。freehand 設定行は横並びのまま流し込み。
  4. 左ドック分岐は `compactMode && !isMobileVp && compactToolbarW > 4` に変更。
  レイアウト順（モバイル）: headerBar → 選択バー常設行（B-7）→ ペイン → ツールバー行。Canvas の縦は減るが横が全幅になり、ペン/図形ボタンが親指圏に来る。
- 受入: 375px Note でツールが下部の横スクロール列に並び、紙面が画面幅いっぱいに表示される。デスクトップ Animate セル（compact だが mobile でない）は従来の左ドックのまま。

## B-19【低】compact 単一表示でツールバーが余り幅を無制限に吸収し、巨大な帯になる

- 対象: `CanvasWorkspace.tsx`（grep: `const canvasWAtHeightFit = canvasSize.height * COMPACT_ASPECT`）
- 問題: `compactToolbarW = max(COMPACT_SIDE_MIN, width - height*1.5)` は「余白をツールバーで埋める」設計だが、横長セル（例: 幅 1200×高さ 400）ではツールバーが 600px にもなり、間延びしたボタン列と紙面の圧迫感を生む。
- 修正: 上限を設け、余りはレターボックスに回す:
```tsx
compactToolbarW = Math.min(180, Math.max(COMPACT_SIDE_MIN, Math.round(canvasSize.width - canvasWAtHeightFit)));
```
（ペイン側は既にセル中央配置なので、余った分は自然に左右余白になる。B-15 の `--canvas-margin` トークン適用でこの余白の色もテーマ追従する）
- 受入: デスクトップ Animate のウィンドウを横に伸ばしてもツールバー幅が 180px で止まり、事件ノートはセル中央にレターボックス表示される。

## B-20【中】選択・変形ハンドル（Transformer）がタッチには小さすぎる

- 対象: `CanvasWorkspace.tsx` の `<Transformer>`（grep: `<Transformer`）
- 問題: Konva Transformer の既定 anchorSize は 10px。モバイルの縮小率も相まって、リサイズ・回転ハンドルを指で掴むのはほぼ不可能。
- 修正: compactMode（または B-3 導入後はタッチ環境判定）でハンドルを拡大:
```tsx
<Transformer
    ref={...}
    name="__export_exclude"
    anchorSize={compactMode ? 16 : 10}
    anchorCornerRadius={compactMode ? 4 : 0}
    rotateAnchorOffset={compactMode ? 36 : 50}
    padding={compactMode ? 6 : 0}
    boundBoxFunc={...}
    /* 既存 props はそのまま */
/>
```
`padding` はハンドルと枠を描画物から離してタップしやすくする。値は実機で微調整してよいが、**デスクトップ（非 compact）は現状維持**。
- 受入: 375px でオブジェクト選択 → 四隅ハンドルが指で掴めてリサイズできる。回転ハンドルも届く。デスクトップの見た目は不変。

---

# 実施順の推奨

1. **A-2 → A-3 → A-4**（undo/選択まわりの整合。相互に関連するのでこの順で）
2. **A-1 / A-5 / A-14 / A-15**（入力系の独立バグ）
3. **A-6 / A-7 / A-8**（store/形状の独立バグ）
4. **A-12 / A-13 / A-11 / A-9 / A-10**（残りのバグ。A-9 はフォント入手を伴うため単独コミット）
5. **B-1 / B-2 / B-10**（モバイル致命系の即効セット）
6. **B-7 / B-8 / B-20 / B-18**（モバイルレイアウト系。22.md §B 適用後に）
7. **B-4 / B-5 / B-6 / B-9 / B-11 / B-12 / B-13 / B-14 / B-16 / B-17 / B-19**（順不同・各1コミット）
8. **B-15**（色の一括置換は他項目で触る UI が確定してから）
9. **B-3**（ピンチズーム。最大工数・最後に単独で）

各コミット後に `npx tsc --noEmit` / `npm run build` / `npx vitest run`、UI 変更はモバイル 375px + デスクトップ 1280px の両方を preview で確認すること。A-4/A-6 は vitest のユニットテスト追加を受入条件に含む。
