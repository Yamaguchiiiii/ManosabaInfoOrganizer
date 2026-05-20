# resolve_error5 — 根本原因分析と修正ステップ

最終更新: 2026-05-15

---

## 症状（docs/_symptoms.md より）

1. **Sync 後の速度不一致** — 合流させたキャラが置いていかれたり追い越したりする
2. **Chrome 上での OOM** — Tauri / VSCode では問題なし。「処理待ち → 動く」を繰り返すアニメーション挙動
3. **フロア移動時の座標ズレ** — 移動先フロアに出現した瞬間、正しい経路開始位置と異なる場所にアイコンが現れ、直線的に正しい方向へ移動する

---

## 問題1: Sync 後の速度不一致

### 根本原因

`saveCharacterAnimation`（`store.ts`）が常に `duration = Math.max(path.length * 30, 60)` でセーブする。

**ピクセル速度 = totalPixelDistance / duration**

キャラごとにパス形状（エッジ長の分布）が異なるため、`totalPixelDistance / path.length` の比がバラつく。Sync でキャラが同じノードWで合流しても、W以降の共有セグメントを走るフレーム数がキャラによって異なり、速度差として現れる。

**具体例:**
- キャラA: パス 30ノード, totalDist=1200px → duration=900, speed=1.33px/frame
- キャラB: パス 100ノード, totalDist=2000px → duration=3000, speed=0.67px/frame
- W以降の共有セグメント(同じ200px): A は 150frame, B は 300frame → 2倍の速度差

`MOVEMENT_SPEED_PX_PER_SEC = 100 px/s` という定数が定義されているにもかかわらず、この定数をduration計算に活かしていないことが真の原因。

なお、wait ノード（同一ID重複）は `WAIT_VIRTUAL_DISTANCE = 50px` で表現されており:
`50px × (60fps / 100px/s) = 30 frames/node` ← 旧formula (1node×30) と一致するため、wait 時間は変わらない。

### 修正対象ファイル

- `src/constants.ts` — `TARGET_FPS = 60` を追加
- `src/store.ts` — `saveCharacterAnimation` / `saveBatchCharacterAnimations` の duration 計算を変更

### 修正内容

**src/constants.ts** — 末尾に追加:

```typescript
export const TARGET_FPS = 60;
```

**src/store.ts** — import を拡張:

```typescript
import { INITIAL_NODES, INITIAL_EDGES, WAIT_VIRTUAL_DISTANCE, MOVEMENT_SPEED_PX_PER_SEC, TARGET_FPS } from './constants';
```

store.ts の `saveCharacterAnimation` 内に distance 計算ヘルパーを追加し、duration を差し替える:

```typescript
// store の set callback の中(state にアクセスできる箇所)で使う内部ヘルパー
const computeDuration = (path: string[], nodes: MapNode[]): number => {
    const nodesMap: Record<string, MapNode> = {};
    nodes.forEach(n => { nodesMap[n.id] = n; });
    let totalDist = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const nA = nodesMap[path[i]];
        const nB = nodesMap[path[i + 1]];
        if (!nA || !nB) continue;
        if (nA.id === nB.id) { totalDist += WAIT_VIRTUAL_DISTANCE; continue; }
        if ((nA.type === 'stair' && nB.type === 'stair') || nA.floor !== nB.floor) continue;
        totalDist += Math.sqrt((nB.x - nA.x) ** 2 + (nB.y - nA.y) ** 2);
    }
    return Math.max(totalDist / (MOVEMENT_SPEED_PX_PER_SEC / TARGET_FPS), 60);
};
```

`saveCharacterAnimation` の duration を差し替え:

```typescript
// 変更前
const newData: CharacterTimelineData = { path, startTime: startTIme, duration: Math.max(path.length * 30, 60), waypoints };

// 変更後
const newData: CharacterTimelineData = { path, startTime: startTIme, duration: computeDuration(path, state.nodes), waypoints };
```

`saveBatchCharacterAnimations` も同様に変更する。

---

## 問題2: Chrome 上での OOM（処理待ち → 動くの繰り返し）

### 試みた修正と結果

当初、毎フレームのオブジェクト生成（GC 圧力）が原因と想定し、pre-allocated バッファへの変更を実装した。
**結果: カクつきが悪化。** この事実から、真の原因はGCではなく **Canvas 2D の描画計算量** であると判断した。

### 根本原因

`ReadOnlyMapView.tsx` のKonva構造が問題:

```
<Stage>
  <Layer>             ← 1枚のレイヤーに全部乗っている
    <MapImage />      ← 大きなマップ画像PNG
    <Group>edges</Group>
    <Group>nodes</Group>
    {children}        ← キャラクターアイコン（AnimateViewから注入）
  </Layer>
</Stage>
```

`useAnimationPositions.ts` の RAF ループが毎フレーム `node.x(newX)` / `node.y(newY)` でキャラ位置を更新すると、Konva は **そのノードが属する `<Layer>` 全体を dirty にして `layer.batchDraw()` を呼ぶ**。

マップ画像・エッジ・ノード・キャラアイコンがすべて同じレイヤーにあるため、**キャラ 1 体の位置更新が大きなマップ PNG の再ラスタライズを引き起こす**。

**フロアごとに 60fps で発生する1回の再描画コスト（Canvas 2D `drawImage` + ライン描画 + 円描画 + 画像描画）が、3フロア×60fps = 毎秒 180 回の全マップ再描画** として積み重なる。

これが Tauri / VSCode の WebView（異なるGPUメモリ管理・レンダリングパイプライン）では問題にならず、Chrome ブラウザでは OOM・スタッタリングとして現れる理由だと考えられる。

### 修正対象ファイル

- `src/components/ReadOnlyMapView.tsx` — Konva レイヤーを静的・動的に分割

### 修正内容

**`src/components/ReadOnlyMapView.tsx`** — 単一 `<Layer>` を2つに分割する:

```tsx
// 変更前: 1枚のレイヤーに全コンテンツ
<Stage ...>
  <Layer>
    <MapImage ... />
    <Group>{edges}</Group>
    <Group>{nodes}</Group>
    {children}        {/* キャラアイコン */}
  </Layer>
</Stage>

// 変更後: 静的レイヤー + 動的レイヤーに分離
<Stage ...>
  <Layer listening={false}>   {/* 静的: 滅多にdirtyにならない */}
    <MapImage ... />
    <Group>{edges}</Group>
    <Group>{nodes}</Group>
  </Layer>
  <Layer>                     {/* 動的: キャラ更新のみ → 小さいキャンバスだけ再描画 */}
    {children}
  </Layer>
</Stage>
```

`listening={false}` は静的レイヤーのヒット判定をスキップしてさらに軽量化する。

これにより、`node.x()` / `node.y()` がキャラレイヤーのみを dirty にし、マップPNGを含む静的レイヤーは `nodes` / `edges` の変化（プリセット切り替え時のみ）にしか反応しなくなる。

---

## 問題3: フロア移動時の座標ズレ

### 根本原因

`currentVisualPositions.current[icon]` の型が `{ x: number; y: number }` で、フロア情報を持たない。

キャラがフロアを移動した瞬間:
1. 前フレーム: キャラが 1F の階段 `(821, 429)` にいる → `currentVisualPositions["char.png"] = { x: 821, y: 429 }`
2. 次フレーム: キャラが B1 の階段 `(764, 264)` に移動 → target.floor = "B1"
3. LERP 計算: `prev = { x: 821, y: 429 }`（1F 座標のまま）
4. 距離 = `sqrt((821-764)² + (429-264)²) ≈ 175px`
5. `TELEPORT_THRESHOLD = 200px` → **175 < 200 のため LERP 適用** ← ここがバグ

B1 マップ上に `(821, 429)` 付近（1F の座標）から LERP 開始するため、B1 上の誤った初期位置にアイコンが出現し、直線的に `(764, 264)` へ移動するように見える。

**各階段ペアの座標差（実データ）:**
- 1F→2F 階段: `m42qnzx08(821,429)` ↔ `50x38ddu4(667,360)` → 距離 ≈ 176px < 200px → LERP 発火
- 1F→B1 階段: `knxos57oe(930,352)` ↔ `f4urev17h(764,264)` → 距離 ≈ 200px ≈ 閾値ギリギリ

### 修正対象ファイル

- `src/hooks/useAnimationPositions.ts` — `currentVisualPositions` の型にフロアを追加し、フロア変更時に LERP をスキップ
- `src/components/AnimateView.tsx` — `currentVisualPositions` の型宣言を合わせる

### 修正内容

**src/hooks/useAnimationPositions.ts** — 関数シグネチャの型変更:

```typescript
// 変更前
export const useAnimationPositions = (
    nodesMapRef: React.MutableRefObject<Record<string, MapNode>>,
    charNodeRefs: React.MutableRefObject<Map<string, Konva.Group>>,
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number }>>
): void => {

// 変更後
export const useAnimationPositions = (
    nodesMapRef: React.MutableRefObject<Record<string, MapNode>>,
    charNodeRefs: React.MutableRefObject<Map<string, Konva.Group>>,
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number; floor: string }>>
): void => {
```

RAF ループ内の LERP 判定にフロア変更チェックを追加:

```typescript
// 変更前
const prev = currentVisualPositions.current[icon] ?? { x: target.x, y: target.y };
const diffX = target.x - prev.x;
const diffY = target.y - prev.y;
const distSq = diffX * diffX + diffY * diffY;

let newX: number;
let newY: number;
if (target.isFinished || distSq > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
    newX = target.x;
    newY = target.y;
} else if (...) {
    ...
}
...
currentVisualPositions.current[icon] = { x: newX, y: newY };

// 変更後
const prev = currentVisualPositions.current[icon];
const floorChanged = prev !== undefined && prev.floor !== target.floor;

let newX: number;
let newY: number;
if (!prev || floorChanged) {
    // フロア変化時は即テレポート（旧フロアの座標を LERP 起点にしない）
    newX = target.x;
    newY = target.y;
} else {
    const diffX = target.x - prev.x;
    const diffY = target.y - prev.y;
    const distSq = diffX * diffX + diffY * diffY;
    if (target.isFinished || distSq > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
        newX = target.x;
        newY = target.y;
    } else if (Math.abs(diffX) < 0.1 && Math.abs(diffY) < 0.1) {
        newX = target.x;
        newY = target.y;
    } else {
        newX = prev.x + diffX * LERP_FACTOR;
        newY = prev.y + diffY * LERP_FACTOR;
    }
}
node.x(newX);
node.y(newY);
node.visible(true);
currentVisualPositions.current[icon] = { x: newX, y: newY, floor: target.floor };
```

**src/components/AnimateView.tsx** — `currentVisualPositions` の型を合わせる:

```typescript
// 変更前
const currentVisualPositions = useRef<Record<string, { x: number, y: number }>>({});

// 変更後
const currentVisualPositions = useRef<Record<string, { x: number, y: number, floor: string }>>({});
```

---

## 修正の優先順位と実施順序

| 順序 | 問題 | 難易度 | 理由 |
|---|---|---|---|
| 1 | **問題3** (フロア移動) | 低 | 型変更 + 数行追加のみ。他への影響なし |
| 2 | **問題2** (Chrome OOM) | 低 | `ReadOnlyMapView.tsx` の `<Layer>` を2つに分割するだけ。1ファイル・数行変更 |
| 3 | **問題1** (Sync速度) | 中 | `store.ts` の duration 計算変更。既存アニメーションの速度に影響するため、最後に実施して確認 |

## 動作確認チェックリスト

- [ ] フロア移動時にアイコンが目的地フロアの正しい位置（階段位置）に即座に出現する
- [ ] Chrome で 10 分以上再生しても OOM が発生しない
- [ ] Chrome で「処理待ち → 動く」の繰り返しが消える
- [ ] Sync 後に合流したキャラが同じ速度で移動する
- [ ] Sync 前後で既存のアニメーション動作が壊れていない（既存プリセットの再生確認）
- [ ] Tauri / VSCode でも動作に問題がない
