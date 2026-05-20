# implement_function1 — 希望機能 実装設計書

最終更新: 2026-05-15

---

## 前提: コードベース現状

| コンポーネント | 役割 |
|---|---|
| `Sidebar.tsx` | ICONS セクション（Create 時にキャラアイコンを表示） |
| `TopBar.tsx` | Create 時の DONE / TODO アイコン列 |
| `WaypointPanel.tsx` | 経由地入力 UI（S / 中継地点 / G 行） |
| `NoteView.tsx` | `CanvasWorkspace`（キャンバス本体）・`NoteView`（タブ管理）を export |
| `store.ts` | `NoteObject`・`CanvasState` 型定義 + Zustand アクション |
| `AnimateView.tsx` | `MovingCharIcon`（キャラアイコン Konva コンポーネント） |

---

## 機能1: Createページ — サイドバー ICONS の「作成済み」表示

### 現状
`Sidebar.tsx` のアイコングリッドは選択/死亡状態のみ視覚化。行動経路の作成有無は判定していない。

### 実装方針

**修正ファイル:** `src/components/Sidebar.tsx`

`activePreset.data` に icon キーが存在するかで「作成済み」を判定し、アイコン右上に緑チェックバッジをオーバーレイ表示する。

```tsx
// Sidebar.tsx 内 ICONS セクション
const isDone = !!(activePreset?.data?.[fileName]);

// アイコン div に position: 'relative' を追加し、以下バッジを内包
{isDone && (
    <div style={{
        position: 'absolute', top: 0, right: 0,
        width: '14px', height: '14px',
        backgroundColor: '#10b981',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: 'white', fontWeight: 'bold',
        border: '1px solid #1e1e1e', zIndex: 10
    }}>✓</div>
)}
// アイコン本体は isDone ? 'brightness(0.7)' : 'none' で暗くする
style={{ filter: isDead ? 'grayscale(100%) brightness(40%)' : (isDone ? 'brightness(0.75)' : 'none') }}
```

**注意点:** `activePreset` が `undefined` の場合を `?.` で安全に処理する。

---

## 機能2: Createページ — WaypointPanel のボタン幅問題

### 現状
`WaypointPanel.tsx` の各行の幅内訳:

| 行種別 | 内容 | 追加要素 |
|---|---|---|
| S / G 行 | セグカラー(4px) + 番号(20px) + 名前input(flex:1) | なし |
| 中継地点行 | 同上 + stayTime(30px) + ⏱ボタン(24px, `wp.id`時) + ×ボタン(20px) | 最大 +74px |

S/G 行と中継地点行で合計幅が一致しないため、名前 input の幅がズレる。

### 実装方針

**修正ファイル:** `src/components/create/WaypointPanel.tsx`

名前 input の `flex: 1` を維持しつつ、中継地点行にのみ表示される要素の分だけ固定幅を確保する。方法は「常に同じ幅の右端ゾーンを確保し、表示/非表示で要素を出し分ける」パターン。

```tsx
// 各行の右端に固定幅コンテナを置く
<div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '74px', justifyContent: 'flex-end' }}>
    {/* stayTime input: 中継地点のみ表示。S/G 行は空欄で幅確保 */}
    {(index > 0 && index < waypoints.length - 1) ? (
        <input type="number" ... style={{ width: '30px', ... }} />
    ) : (
        <div style={{ width: '30px' }} />  // 幅確保のダミー
    )}

    {/* Sync ボタン: wp.id あり かつ 中継地点のみ。S/G は透明ダミー */}
    {(index > 0 && index < waypoints.length - 1 && wp.id) ? (
        <button onClick={() => handleSyncTime(wp.id, wp.name)} ...>⏱</button>
    ) : (
        <div style={{ width: '24px' }} />
    )}

    {/* 削除ボタン: 中継地点のみ */}
    {(index > 0 && index < waypoints.length - 1) ? (
        <button onClick={() => handleRemoveWaypoint(index)} ...>×</button>
    ) : (
        <div style={{ width: '20px' }} />
    )}
</div>
```

これにより全行で同じ合計幅を保ち、名前 input の flex 幅が安定する。

---

## 機能3・4: Notesページ — フリーハンド手振れ補正 + 設定 UI

### 現状
`CanvasWorkspace.tsx`（`NoteView.tsx` 内）の `handleStageMouseMove` でマウス座標を生のまま `points` に push している。描画色・幅・スタイルも描画開始時にハードコード（`stroke: '#000000', strokeWidth: 3`）。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

#### (a) 手振れ補正（機能3）

描画完了（`handleStageMouseUp`）時に **Chaikin's Corner Cutting** を適用してポイントを滑らかにする。Chaikin アルゴリズムは `n` 回イテレーションすることで折れ線を滑らかにする。

```typescript
// NoteView.tsx 内のヘルパー関数（コンポーネント外に定義）
const applyChaikin = (points: number[], iterations: number): number[] => {
    if (iterations <= 0 || points.length < 4) return points;
    const result: number[] = [];
    for (let i = 0; i < points.length - 2; i += 2) {
        const x0 = points[i], y0 = points[i + 1];
        const x1 = points[i + 2], y1 = points[i + 3];
        result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
        result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    // 始点と終点を保持
    result.unshift(points[0], points[1]);
    result.push(points[points.length - 2], points[points.length - 1]);
    return applyChaikin(result, iterations - 1);
};
```

`handleStageMouseUp` 内の freehand 確定時に適用:
```typescript
const smoothed = applyChaikin(
    drawingShapeInfoRef.current.points,
    freehandSettings.stabilization  // 0〜3 の整数
);
addNoteObject(..., { ...drawingShapeInfoRef.current, points: smoothed });
```

#### (b) 設定 UI（機能4）

```typescript
// CanvasWorkspace 内に state を追加
const [freehandSettings, setFreehandSettings] = useState({
    color: '#000000',
    strokeWidth: 3,
    lineStyle: 'pen' as 'pen' | 'marker',
    stabilization: 2,  // Chaikin イテレーション数（0=なし, 1=弱, 2=中, 3=強）
});
```

描画開始時（`handleStageMouseDown` の freehand ブランチ）に `freehandSettings` を使用:
```typescript
drawingShapeInfoRef.current = {
    ...
    stroke: freehandSettings.color,
    strokeWidth: freehandSettings.strokeWidth,
    lineStyle: freehandSettings.lineStyle,
};
```

ツールバーに freehand 選択時のみ設定パネルを表示:
```tsx
{(placementMode?.type === 'freehand') && (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="color" value={freehandSettings.color}
            onChange={e => setFreehandSettings(s => ({...s, color: e.target.value}))} />
        <input type="range" min="1" max="20" value={freehandSettings.strokeWidth}
            onChange={e => setFreehandSettings(s => ({...s, strokeWidth: +e.target.value}))} />
        <select value={freehandSettings.lineStyle}
            onChange={e => setFreehandSettings(s => ({...s, lineStyle: e.target.value as any}))}>
            <option value="pen">Pen</option>
            <option value="marker">Marker</option>
        </select>
        <select value={freehandSettings.stabilization}
            onChange={e => setFreehandSettings(s => ({...s, stabilization: +e.target.value}))}>
            <option value={0}>補正: なし</option>
            <option value={1}>補正: 弱</option>
            <option value={2}>補正: 中</option>
            <option value={3}>補正: 強</option>
        </select>
    </div>
)}
```

この設定は **compact モード（Animate 内ツールパッド）でも共有して表示**する。

---

## 機能5: Notesページ — Esc キーでツール選択解除

### 現状
`CanvasWorkspace` の `keydown` ハンドラに `Escape` の処理がない。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

既存の `handleKeyDown` useEffect 内に1行追加するのみ:

```typescript
if (e.key === 'Escape') {
    setPlacementMode(null);
    return;
}
```

`editingTextId` チェックの前に置くことで、テキスト編集中の Esc は `editingTextId` のクリア（テキスト編集完了）にも使えるようにする:

```typescript
if (e.key === 'Escape') {
    if (editingTextId) {
        setEditingTextId(null);
    } else {
        setPlacementMode(null);
    }
    return;
}
```

---

## 機能6: Notesページ — Miscページ名変更をモダン UI に

### 現状
`NoteView.tsx` の misc タブ（line 1352-1358）で `window.prompt()` を使用している。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

`window.prompt` を廃止し、インラインの rename ステートで置き換える。`NoteView` コンポーネント内に以下を追加:

```typescript
const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
const [renameInputValue, setRenameInputValue] = useState('');
```

✏️ ボタンのクリックハンドラを変更:
```typescript
// 変更前
onClick={() => { const newTitle = window.prompt(...); ... }}

// 変更後
onClick={() => {
    const page = notes.miscPages?.find(p => p.id === actualMiscPageId);
    if (page) {
        setRenamingPageId(page.id);
        setRenameInputValue(page.title);
    }
}}
```

ヘッダー内に `renamingPageId` が設定されているときインライン入力を表示:
```tsx
{renamingPageId === actualMiscPageId ? (
    <input
        autoFocus
        value={renameInputValue}
        onChange={e => setRenameInputValue(e.target.value)}
        onBlur={() => {
            if (renameInputValue.trim()) renameMiscPage(renamingPageId, renameInputValue.trim());
            setRenamingPageId(null);
        }}
        onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenamingPageId(null);
        }}
        style={{ background: '#333', color: 'white', border: '1px solid #007acc', padding: '4px 8px', borderRadius: '4px' }}
    />
) : (
    <span style={{ color: '#ccc' }}>{notes.miscPages?.find(p => p.id === actualMiscPageId)?.title}</span>
)}
```

セレクトボックスはページ切り替え専用のまま維持し、ページ名表示は上記インライン入力で管理する。

---

## 機能7: Notesページ — オブジェクトのグループ化 (Ctrl+G / Ctrl+Shift+G)

### 現状
`NoteObject` に `groupId` フィールドがない。グループ概念が存在しない。

### 実装方針

**修正ファイル:** `src/store.ts`, `src/components/NoteView.tsx`

#### (a) store.ts — NoteObject に groupId を追加

```typescript
export interface NoteObject {
    // 既存フィールドはそのまま
    ...
    groupId?: string;  // 追加: グループ識別子
}
```

#### (b) NoteView.tsx — グループ操作をキーハンドラに追加

```typescript
// handleKeyDown 内に追加
if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    if (selectedIds.length < 2) return;
    const newGroupId = `group_${Date.now()}`;
    const updates = selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } }));
    updateNoteObjects(targetType, displayTargetId, updates);
    saveNoteHistory();
    return;
}

if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    const updates = selectedIds.map(id => ({ id, attrs: { groupId: undefined } }));
    updateNoteObjects(targetType, displayTargetId, updates);
    saveNoteHistory();
    return;
}
```

#### (c) グループ全体選択

オブジェクトの `onSelect` コールバックを拡張し、クリックされたオブジェクトが `groupId` を持つ場合は同一グループ全体を選択する:

```typescript
onSelect: (e: any) => {
    if (placementMode) return;
    const clickedObj = obj;
    if (clickedObj.groupId && !e.evt?.shiftKey) {
        // グループ全体選択
        const groupMembers = currentCanvasObjects
            .filter(o => o.groupId === clickedObj.groupId)
            .map(o => o.id);
        setSelectedIds(groupMembers);
    } else if (e.evt?.shiftKey) {
        setSelectedIds(prev => prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]);
    } else {
        setSelectedIds([obj.id]);
    }
}
```

**注意点:** `updateNoteObjects` は `store.ts` に既に実装済みのため、store 変更は型定義の `groupId?: string` 追加のみ。

---

## 機能8: Notesページ — オブジェクトのレイヤー移動

### 現状
`objects` 配列の順序 = 描画順（= z オーダー）。現在、順序操作のストアアクションがない。

### 実装方針

**修正ファイル:** `src/store.ts`, `src/components/NoteView.tsx`

#### (a) store.ts — reorderNoteObject アクションを追加

```typescript
// AppState インターフェースに追加
reorderNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, direction: 'front' | 'back' | 'up' | 'down') => void;
```

```typescript
// アクション実装（useAppStore 内）
reorderNoteObject: (targetType, targetId, objId, direction) => set((state) =>
    updateCanvasState(state, targetType, targetId, (canvas) => {
        const objs = [...canvas.objects];
        const idx = objs.findIndex(o => o.id === objId);
        if (idx === -1) return canvas;
        const [item] = objs.splice(idx, 1);
        if (direction === 'front') objs.push(item);
        else if (direction === 'back') objs.unshift(item);
        else if (direction === 'up' && idx < objs.length) objs.splice(idx + 1, 0, item);
        else if (direction === 'down' && idx > 0) objs.splice(idx - 1, 0, item);
        else objs.splice(idx, 0, item);
        return { ...canvas, objects: objs };
    })
),
```

#### (b) NoteView.tsx — コンテキストメニューにレイヤー操作を追加

`shapeContextMenu` が表示されている領域に以下のボタン群を追加:

```tsx
<div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px' }}>
    <div style={{ fontSize: '0.85rem', marginBottom: '5px', color: '#aaa' }}>Layer</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        <button onClick={() => { reorderNoteObject(targetType, displayTargetId, shapeContextMenu.id, 'front'); saveNoteHistory(); }}>最前面</button>
        <button onClick={() => { reorderNoteObject(targetType, displayTargetId, shapeContextMenu.id, 'back'); saveNoteHistory(); }}>最背面</button>
        <button onClick={() => { reorderNoteObject(targetType, displayTargetId, shapeContextMenu.id, 'up'); saveNoteHistory(); }}>前へ</button>
        <button onClick={() => { reorderNoteObject(targetType, displayTargetId, shapeContextMenu.id, 'down'); saveNoteHistory(); }}>後へ</button>
    </div>
</div>
```

`reorderNoteObject` を `useAppStore(state => state.reorderNoteObject)` で取得して使用する。

---

## 機能9: Notesページ — ドラッグで図形/画像をサイジング

### 現状
`handleStageMouseDown` の placement mode で shape/image はクリック時に即座にデフォルトサイズで追加される。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

既存の line/arrow/freehand の「ドラッグで描画」仕組みを shape/image に拡張する。

`drawingShapeInfoRef.current` に `startX, startY` と現在 type を保持し、`handleStageMouseMove` でサイズ更新、`handleStageMouseUp` で確定する。

```typescript
// handleStageMouseDown - shape ブランチを変更
if (['rect', 'circle', 'triangle', 'image'].includes(placementMode.type as string)) {
    isDrawingRef.current = true;
    drawingShapeInfoRef.current = {
        id: `${placementMode.type}_${Date.now()}`,
        type: placementMode.type,
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        fill: '#A8D5BA', stroke: '#000000', strokeWidth: 2,
        rotation: 0, scaleX: 1, scaleY: 1,
        content: placementMode.type === 'image' ? placementMode.data : undefined,
        canvasIndex: index,
        _startX: pos.x, _startY: pos.y,  // ドラッグ開始座標（一時フィールド）
    };
    setDrawingActive(true);
    return;
}
```

```typescript
// handleStageMouseMove に shape ドラッグ対応を追加
if (isDrawingRef.current && ['rect', 'circle', 'triangle', 'image'].includes(drawingShapeInfoRef.current?.type)) {
    const dx = logicalPos.x - drawingShapeInfoRef.current._startX;
    const dy = logicalPos.y - drawingShapeInfoRef.current._startY;
    // 描画中の Rect/Circle をプレビュー用に更新
    drawingShapeInfoRef.current.x = Math.min(logicalPos.x, drawingShapeInfoRef.current._startX);
    drawingShapeInfoRef.current.y = Math.min(logicalPos.y, drawingShapeInfoRef.current._startY);
    drawingShapeInfoRef.current.width = Math.abs(dx);
    drawingShapeInfoRef.current.height = Math.abs(dy);
    drawingNodeRef.current?.width(Math.abs(dx));
    drawingNodeRef.current?.height(Math.abs(dy));
    drawingNodeRef.current?.x(drawingShapeInfoRef.current.x);
    drawingNodeRef.current?.y(drawingShapeInfoRef.current.y);
    drawingNodeRef.current?.getLayer()?.batchDraw();
    return;
}
```

mouseup 時、`width/height` が 5px 未満なら「クリック」とみなしてデフォルトサイズで確定。5px 以上ならドラッグサイズで確定。

プレビュー用に `drawingActive` が true の shape 種別向けの描画を `drawingActive && ...` ブロックに追加する。

**`_startX/_startY` の型対応:** `NoteObject` に一時フィールドを混入させないよう、`drawingShapeInfoRef` を `Partial<NoteObject> & { _startX?: number; _startY?: number }` 型のオブジェクトとして管理する。

---

## 機能10・11: Notesページ — スケール時に枠線・テキストサイズを変化させない

### 現状
Konva の `Transformer` でドラッグすると `scaleX/scaleY` が変化し、`strokeWidth` や Text の `fontSize` も比例してスケールされてしまう。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

#### (a) 図形の枠線: `strokeScaleEnabled={false}` を追加

```tsx
// ShapeObject 内の各図形要素に追加
<Rect {...commonProps} strokeScaleEnabled={false} strokeWidth={shapeObj.strokeWidth || 0} ... />
<Circle {...commonProps} strokeScaleEnabled={false} ... />
<RegularPolygon {...commonProps} strokeScaleEnabled={false} ... />
```

line/arrow/curve も同様（ただしこれらは `scaleX/scaleY` を使わずに `points` で形状を変えているため、変換後に `resetScale` が必要）。

#### (b) テキストのフォントサイズ: スケールをサイズに焼き込む

テキストの `onTransformEnd` で `scaleX/scaleY` を `fontSize` に反映してリセットする（PowerPoint と同じ動作）。`width/height` で領域を管理する方式に切り替える:

```typescript
// EditableText の onTransformEnd
onTransformEnd: (e: any) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // scaleを1にリセットし、fontSizeとwidthに焼き込む
    const newFontSize = Math.round((textObj.fontSize || 24) * Math.max(scaleX, scaleY));
    node.scaleX(1);
    node.scaleY(1);
    onChange({
        x: node.x(), y: node.y(),
        fontSize: Math.max(8, Math.min(200, newFontSize)),
        scaleX: 1, scaleY: 1,
        rotation: node.rotation(),
    });
}
```

図形については `onTransformEnd` で `width/height` にスケールを焼き込み、`scaleX/scaleY` を 1 に戻す:

```typescript
// ShapeObject の onTransformEnd（rect/circle）
onTransformEnd: (e: any) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    onChange({
        x: node.x(), y: node.y(),
        width: (shapeObj.width || 100) * scaleX,
        height: (shapeObj.height || 100) * scaleY,
        scaleX: 1, scaleY: 1,
        rotation: node.rotation()
    });
}
```

**注意:** `Rect` / `Circle` / `RegularPolygon` は現在 `width/height` を `NoteObject` から読んでいないため、`shapeObj.width || 100` 等のデフォルト値から始めて Transformer 後に実寸を保存する形に移行する。

---

## 機能12: Notesページ — テキスト編集をPowerPoint風インプレースに

### 現状
ダブルクリックでオーバーレイ `<textarea>` が出るが `resize: 'both'` で自由に引き伸ばせる。テキストボックスの実寸と初期サイズが一致していない。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

編集用 `<textarea>` の初期サイズを、対応する Konva `Text` ノードの **実際の画面上の境界** に合わせる。

```typescript
// editingTextId が設定されたタイミングで Konva ノードのサイズを取得
const getTextNodeScreenBounds = (id: string, stage: Konva.Stage) => {
    const node = stage.findOne(`#${id}`);
    if (!node) return null;
    const rect = node.getClientRect({ relativeTo: stage.container() });
    return rect; // { x, y, width, height } (スクリーン座標)
};
```

`<textarea>` のスタイルをノードの実寸に合わせて初期化し、`overflow: 'hidden'` + `input` イベントで自動拡張:

```tsx
<textarea
    value={obj.text}
    onChange={(e) => {
        updateNoteObject(targetType, displayTargetId, obj.id, { text: e.target.value }, true);
        // 高さ自動調整
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }}
    onBlur={() => { saveNoteHistory(); setEditingTextId(null); }}
    autoFocus
    style={{
        position: 'absolute',
        top: obj.y * scale,
        left: obj.x * scale,
        width: `${(textNode?.width() || 200) * scale}px`,  // Konvaノードの実幅
        height: 'auto',
        minHeight: `${(textObj.fontSize || 24) * 1.4 * scale}px`,
        fontSize: `${(obj.fontSize || 24) * scale}px`,
        fontWeight: obj.fontWeight || 'normal',
        fontFamily: HANDWRITING_FONT,
        color: obj.fill || 'black',
        background: 'rgba(255,255,255,0.05)',
        border: '1px dashed #007acc',
        outline: 'none',
        resize: 'none',        // resize を廃止
        overflow: 'hidden',
        padding: '2px',
        transform: `rotate(${obj.rotation || 0}deg)`,
        transformOrigin: 'top left',
        zIndex: 100,
        boxSizing: 'border-box',
    }}
/>
```

**実装手順:**
1. `trRefs` を通じてステージを取得し、`stage.findOne('#id')` で Konva Text ノードを取得。
2. `node.getClientRect()` でスクリーン座標を取得し、`<textarea>` の left/top/width に使用。
3. スケールと回転も考慮する（`node.getAbsoluteTransform()` を使用）。

---

## 機能13: Notesページ — テキスト選択時フローティングツールバー

### 現状
テキスト選択時の Size/Bold コントロールは `char-topbar`（非compact）または `position: fixed` の固定位置（compact）に表示されている。

### 実装方針

**修正ファイル:** `src/components/NoteView.tsx`

選択テキストオブジェクトの **Konva ノードのスクリーン上位置** を計算し、その近傍に `position: fixed` のフローティングツールバーを表示する。

```typescript
// テキスト選択時のノード座標計算
const getNodeScreenPosition = (id: string): { x: number; y: number; width: number } | null => {
    // 各 Stage の trRefs から対象ノードを探す
    for (const tr of trRefs.current) {
        if (!tr) continue;
        const stage = tr.getStage();
        if (!stage) continue;
        const node = stage.findOne(`#${id}`);
        if (node) {
            const rect = node.getClientRect();
            const container = stage.container().getBoundingClientRect();
            return {
                x: container.left + rect.x,
                y: container.top + rect.y,
                width: rect.width
            };
        }
    }
    return null;
};
```

フローティングツールバーのレンダリング（`renderPortalUI` 内または専用関数）:

```tsx
{selectedIds.length === 1 && selectedObject?.type === 'text' && (() => {
    const pos = getNodeScreenPosition(selectedIds[0]);
    if (!pos) return null;
    // ツールバーをノードの上に表示。画面端でははみ出さないようにクランプ
    const tbTop = Math.max(10, pos.y - 50);
    const tbLeft = Math.min(window.innerWidth - 220, pos.x);
    return createPortal(
        <div style={{
            position: 'fixed',
            top: tbTop, left: tbLeft,
            background: 'rgba(30,30,30,0.97)',
            border: '1px solid #555',
            borderRadius: '8px',
            padding: '5px 10px',
            display: 'flex', gap: '10px', alignItems: 'center',
            zIndex: 999999,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            fontSize: '0.85rem', color: '#ccc'
        }}>
            <label>Size:
                <input type="number" min="8" max="200"
                    value={selectedObject.fontSize || 24}
                    onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontSize: +e.target.value }, true)}
                    onBlur={() => saveNoteHistory()}
                    style={{ width: '50px', background: '#222', border: '1px solid #555', color: 'white', borderRadius: '3px', padding: '2px 5px', marginLeft: '5px' }}
                />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="checkbox"
                    checked={selectedObject.fontWeight === 'bold'}
                    onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontWeight: e.target.checked ? 'bold' : 'normal' }, true)}
                    onBlur={() => saveNoteHistory()}
                />
                Bold
            </label>
            <input type="color"
                value={selectedObject.fill || '#000000'}
                onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fill: e.target.value }, true)}
                onBlur={() => saveNoteHistory()}
                title="Text Color"
                style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
            />
        </div>,
        document.body
    );
})()}
```

**既存の char-topbar の property-bar と compact モードの固定位置ツールバーは削除**し、このフローティング実装に一本化する。

---

## 機能14: Animateページ — キャラクターアイコン縁色の変更

### 現状
`AnimateView.tsx` の `MovingCharIcon` コンポーネント:
```tsx
<KonvaImage stroke="#007acc" strokeWidth={3} ... />  // 青い縁取り
```

### 実装方針

**修正ファイル:** `src/components/AnimateView.tsx`

アプリのテーマカラー（ダーク + 温かみのある方眼紙色 `#ECD2B3`）に合わせ、縁取りをモダンな **半透明ホワイト + 細い影** に変更する。

```tsx
// 変更前
<KonvaImage stroke="#007acc" strokeWidth={3} cornerRadius={HALF_SIZE} />

// 変更後: アウターリング（白い外縁）
<KonvaImage
    image={image}
    width={ICON_SIZE} height={ICON_SIZE}
    offsetX={HALF_SIZE} offsetY={HALF_SIZE}
    cornerRadius={HALF_SIZE}
/>
<KonvaImage
    image={image}
    width={ICON_SIZE} height={ICON_SIZE}
    offsetX={HALF_SIZE} offsetY={HALF_SIZE}
    stroke="rgba(255, 255, 255, 0.75)"
    strokeWidth={2.5}
    cornerRadius={HALF_SIZE}
    shadowColor="rgba(0, 0, 0, 0.5)"
    shadowBlur={6}
    shadowOpacity={0.6}
    shadowOffset={{ x: 0, y: 2 }}
/>
```

縁色として `rgba(255, 255, 255, 0.75)` を採用することで、どんな背景（マップ画像）にも馴染むモダンな見た目になる。影でアイコンをマップから浮き立たせる。

---

## 実装優先順位

| 順位 | 機能No | 難易度 | 理由 |
|---|---|---|---|
| 1 | 5 (Esc解除) | 極低 | 1行追加 |
| 2 | 14 (アイコン縁色) | 低 | 数行変更 |
| 3 | 6 (リネームモダン化) | 低 | `window.prompt` 置換のみ |
| 4 | 1 (サイドバー作成済み表示) | 低 | バッジ追加のみ |
| 5 | 2 (Waypoint幅統一) | 低 | 幅計算のみ |
| 6 | 3・4 (フリーハンド補正・設定) | 中 | 補正アルゴリズム追加 + UI |
| 7 | 8 (レイヤー移動) | 中 | store アクション追加 + コンテキストメニュー拡張 |
| 8 | 7 (グループ化) | 中 | 型追加 + キーハンドラ + 選択ロジック |
| 9 | 9 (ドラッグでサイジング) | 中〜高 | 描画ステートマシンを拡張 |
| 10 | 10・11 (スケール時枠線固定) | 中 | strokeScaleEnabled + 変換焼き込み |
| 11 | 13 (フローティングツールバー) | 中 | Konvaノード座標計算 + Portal |
| 12 | 12 (インプレーステキスト編集) | 高 | Konvaノードの実寸取得 + 自動拡張 |

---

## 実施上の注意

- `any` 型の使用禁止（CLAUDE.md）。`drawingShapeInfoRef` の一時フィールドには独立した型を定義する。
- `CanvasWorkspace` は `React.memo` でラップ済みなので、新規 state を追加する際は不要な再レンダリングが生じないか確認する。
- `reorderNoteObject` を store に追加する際は `updateCanvasState` ヘルパーを経由して state を更新し、整合性を保つ。
- コンポーネント内での `window.prompt` / `window.confirm` の使用はモバイル（Safari）で挙動が異なるため、機能6以外にも同パターンがあれば合わせて置換する。
