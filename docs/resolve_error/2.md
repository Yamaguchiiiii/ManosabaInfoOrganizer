# バグ修正 実装ステップ 2

CLAUDE.md の規約（カスタム Hook によるロジック分離・`any` 型禁止・アダプターパターン）に従って実装する。

---

## 問題1: Createページで経由地を設定しても経由した経路にならない

### 根本原因

**`handleWaypointChange` が `name` のみを更新し `id` を更新しない** ことと、**`useWaypointPath` が `id === ""` の経由地をフィルタで除外する**ことの組み合わせ。

詳細な再現フロー:

1. ユーザーが "+ Add Stop" で経由地を追加 → `{id:"", name:"", stayTime:0}` が挿入
2. ユーザーが経由地の入力欄にノード名を直接タイプ
3. `handleWaypointChange(index, 'name', value)` が呼ばれ **`name` フィールドのみが更新**
   - `id` は `""` のまま（変更されない）
4. `id` が更新されるはずのエフェクト（`CreateView.tsx:128-148`）は **`nodes`/`nodeMap` が変化したときのみ実行**される（依存配列 `[nodes, nodeMap]`）
   - ユーザーが入力しても `nodes` は変わらないため、このエフェクトは走らない
5. `useWaypointPath.ts` 内: `const validPoints = waypoints.filter(wp => wp.id !== "")` が `id === ""` の経由地をフィルタアウト
6. フィルタされた `validPoints` には経由地が含まれないため、Dijkstra は「スタート → ゴール」の直接経路だけを計算
7. 結果: 経由地を無視した経路が `hookPath` として返り、`displayPath` に反映・保存される

### 修正

**ファイル 1: `src/hooks/useWaypointPath.ts`**

`useMemo` の先頭で `id` が空のウェイポイントをノード名で補完してからフィルタする。`nodes` はすでに引数で渡されているため追加パラメータ不要。

```typescript
// Before
const validPoints = waypoints.filter(wp => wp.id !== "");

// After（name から id を補完してから filter）
const resolvedPoints = waypoints.map(wp => {
    if (wp.id !== "") return wp;
    const match = nodes.find(n => n.name === wp.name);
    return match ? { ...wp, id: match.id } : wp;
});
const validPoints = resolvedPoints.filter(wp => wp.id !== "");
```

**ファイル 2: `src/components/CreateView.tsx`（`handleWaypointChange` 関数）**

`name` フィールドの変更時に即座にノード検索して `id` を設定する（上記 useWaypointPath の修正と組み合わせることで、タイプ中の途中状態でも正確な id がセットされる）。

```typescript
// Before
const handleWaypointChange = (index: number, field: keyof Waypoint, value: string | number) => {
    if (!isEditing) setIsEditing(true);
    setWaypoints(prev => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
};

// After
const handleWaypointChange = (index: number, field: keyof Waypoint, value: string | number) => {
    if (!isEditing) setIsEditing(true);
    setWaypoints(prev => {
        const next = [...prev];
        const updated: Waypoint = { ...next[index], [field]: value };
        if (field === 'name') {
            const match = nodes.find(n => n.name === (value as string));
            updated.id = match ? match.id : '';
        }
        next[index] = updated;
        return next;
    });
};
```

`nodes` は `CreateView` の先頭で `useAppStore()` から取得済みのため、スコープに存在する。

---

## 問題2: 経由地を設定したときにSyncボタンが消える

### 根本原因

**問題1の連鎖的な結果**。`WaypointPanel.tsx` のSync（⏱）ボタンは `{wp.id && (...)}` の条件でのみ描画される。

```typescript
// WaypointPanel.tsx:84-88
{wp.id && (
    <button onClick={() => handleSyncTime(wp.id, wp.name)} title="Sync">⏱</button>
)}
```

問題1により、手入力した経由地の `wp.id` が `""` のままになるため、その経由地ではSyncボタンが非表示になる。

さらに、`id` が設定されていても `handleSyncTime` 内の `calculateNodeArrivalTime(tempData, waypointId, nodes)` は `displayPath` に `waypointId` が含まれていないと `null` を返し「計算不可」アラートが出る。これも問題1（経路が経由地を通らない）の結果として発生する。

### 修正

**問題1を修正すれば連鎖的に解消する。追加変更は不要。**

問題1の修正により:
1. 手入力した経由地でも `wp.id` が設定される → Syncボタンが表示される
2. `displayPath` が経由地を通るようになる → `calculateNodeArrivalTime` が正常値を返す → Syncが機能する

---

## 問題3: Animateページでアニメーションがカクカクする

### 根本原因

**`ReadOnlyMapView.tsx` がセレクタなしでストア全体を購読している**。

```typescript
// ReadOnlyMapView.tsx:29（現状）
const { nodes, edges } = useAppStore();  // ← セレクタなし = store 全体を購読
```

Zustand において `useAppStore()` をセレクタなしで呼ぶと、**ストア上のどの値が変化しても再レンダリングが発生する**。アニメーション再生中は `useAnimationLoop` が毎フレーム `currentTime` を更新するため、`ReadOnlyMapView` が60fps で再レンダリングされる。

`AnimateView` に `ReadOnlyMapView` のインスタンスは3つ（2F・1F・B1）存在するため、**合計で毎秒 60×3 = 180 回**の React 再レンダリングが発生する。

各再レンダリングで実行される処理:
- フロアの全エッジ（`Line` コンポーネント）の reconciliation
- フロアの全ノード（`Circle` / `Group` コンポーネント）の reconciliation
- 子として渡された 13 個の `MovingCharIcon` の reconciliation

前回セッションで `AnimateView` 自体のセレクタ化と `useAnimationPositions` Hook 化を実施したが、`ReadOnlyMapView` が依然として全購読だったため、カクつきが残っていた。

`AnimationTimeline` は既に個別セレクタを使用しており `displayTime` の更新も 30 フレームごとに抑制されているため、こちらは問題なし。

### 修正

**ファイル: `src/components/ReadOnlyMapView.tsx`（2行変更）**

```typescript
// Before（セレクタなし = store 全体を購読 → currentTime 変化のたびに再レンダリング）
const { nodes, edges } = useAppStore();

// After（個別セレクタ = nodes/edges が変化したときのみ再レンダリング）
const nodes = useAppStore(state => state.nodes);
const edges = useAppStore(state => state.edges);
```

これにより `ReadOnlyMapView` の再レンダリング条件が「`nodes` または `edges` の変化時（ユーザーのグラフ編集時）のみ」に限定され、アニメーション再生中（`currentTime` の変化）では再レンダリングされなくなる。

---

## 変更対象ファイルまとめ

| ファイル | 変更種別 | 問題 | 内容 |
|---|---|---|---|
| `src/hooks/useWaypointPath.ts` | 修正 | 1 | `id` 空の経由地を `name` で補完してから filter |
| `src/components/CreateView.tsx` | 修正 | 1 | `handleWaypointChange` で `name` 変更時に即座に `id` を解決 |
| `src/components/ReadOnlyMapView.tsx` | 修正 | 3 | `useAppStore()` → 個別セレクタに変更（2行変更） |

問題2は問題1の修正で連鎖的に解消するため、独立した変更ファイルはない。

---

## CLAUDE.md 規約との対応

| 規約 | 対応内容 |
|---|---|
| **`any` 型禁止** | `handleWaypointChange` の修正で `nodes.find()` の戻り値は `MapNode \| undefined` と型が確定。`as string` キャストは `field === 'name'` のブランチで `value` が `string` であることが保証される |
| **UI とロジックの分離** | `useWaypointPath` への name→id 補完追加はフック内で完結し、UI コンポーネント（`WaypointPanel`）は変更不要 |
| **アダプターパターン** | 修正はすべて `src/hooks/` と `src/components/` 内で完結し、プラットフォーム固有 API を含まない |
| **レスポンシブ（モバイルファースト）** | 修正は状態管理・ストア購読の最適化のみ。CSS レイアウト・タッチ操作に影響しない |

---

## 実装後の検証手順

```bash
npm run dev          # Web 環境（ブラウザ）で動作確認
npm run tauri dev    # Tauri デスクトップ環境で動作確認
```

### 問題1・2 確認項目
- Create モードでキャラを選択し、始点・経由地・終点を設定したとき、マップ上のハイライト経路が経由地を通ること
- 経由地の入力欄にノード名を**直接タイプ**（候補選択なし）した場合でも、経路が経由地を通ること
- 経由地に Sync ボタン（⏱）が表示されること
- Sync ボタンをクリックしたとき「計算不可」にならず、他キャラとの合流時間選択ダイアログが開くこと

### 問題3 確認項目
- Animate モードで再生ボタンを押し、10 秒以上連続再生してもアイコンがスムーズに動くこと
- ブラウザの DevTools > Performance タブで、アニメーション再生中に `ReadOnlyMapView` の再レンダリングが発生しないこと（または大幅に減少すること）
- 複数キャラクターが同一ノードに集合するときのオフセットがなめらかに変化すること

### 回帰確認項目
- Create モードでノードをクリックして経由地を設定する操作が引き続き正常に動作すること
- SuggestionSidebar からノードを選択する操作が引き続き正常に動作すること
- グラフ編集（ノード追加・削除・エッジ追加）が Animate 画面の地図更新に正常に反映されること
- Note モード（キャラノート・概要ノート）が正常動作すること
