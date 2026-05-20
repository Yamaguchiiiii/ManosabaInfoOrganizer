# バグ修正 実装ステップ 3

CLAUDE.md の規約（カスタム Hook によるロジック分離・`any` 型禁止・アダプターパターン）に従って実装する。

---

## 問題1: Animate ページでアニメーションがまだカクカクする（計算ボトルネック）

### 根本原因

**3 箇所の独立したボトルネックが複合している。**

---

#### ボトルネック A: `calculateRawPosition` が毎フレーム・全キャラ分の配列を生成する

`src/utils/animationUtils.ts:167` — `calculateRawPosition` の中で、呼び出しのたびに 2 つの配列が動的生成される。

```typescript
// animationUtils.ts:167 — 毎フレーム実行
const pathNodes = path.map(id => getNode(id, allNodes)).filter((n): n is MapNode => !!n);

// animationUtils.ts:192-208 — 毎フレーム実行
const distances: number[] = [];
for (let i = 0; i < pathNodes.length - 1; i++) {
    // sqrt 含む距離計算 × (path.length - 1) 回
    distances.push(d);
}
```

**両配列はプリセットが変わらない限り変化しない（時刻に依存しない）。** にもかかわらず、毎フレーム × 13 キャラ × パス長 ≈ 300 ノード分の生成・GC が走る。  
試算: 300ノード × 13キャラ × 60fps = **234,000 配列要素/秒** が生成・破棄される。

---

#### ボトルネック B: `useAnimationLoop.ts:39-50` が毎フレーム `maxDuration` を再計算する

```typescript
// useAnimationLoop.ts:39-50 — isPlaying 中は毎フレーム実行
Object.values(activePreset.data).forEach((val: any) => {
    const start = val.startTime || 0;
    const dur = val.duration !== undefined ? val.duration : ...;
    if (start + dur > maxDuration) maxDuration = start + dur;
});
```

`maxDuration` はプリセットが変わるまで不変。毎フレーム再計算は不要。  
また `any` 型を使用しており CLAUDE.md 規約に違反している。

---

#### ボトルネック C: 2 本の RAF ループが独立して動作する

- `useAnimationLoop`: `currentTime` を更新して store に書き込む  
- `useAnimationPositions`: store から `currentTime` を読み取り位置を計算する  

2 本のループは別の `requestAnimationFrame` コールバックとしてスケジュールされるため、同一フレーム内で必ず「ループ A が先に `currentTime` を更新し、ループ B がそれを読む」順序を保証できない。  
**ループ B が 1 フレーム古い `currentTime` を読むと、LERP がその誤差を増幅してジッターを生じさせる。**

---

### 修正

**ファイル 1: `src/utils/animationUtils.ts`**

プリセット変更時に一度だけ計算できる `pathNodes` / `distances` / `totalDistance` を事前計算用の型・関数としてエクスポートする。  
既存の `calculateRawPosition` は互換性のため残し、キャッシュ済みデータを受け取る `calculateRawPositionCached` を新規追加する。

```typescript
// 追加: 事前計算済みパスデータ型
export interface PrecomputedPath {
    pathNodes: MapNode[];
    distances: number[];
    totalDistance: number;
}

// 追加: プリセット変更時に一度だけ呼ぶ関数
export const precomputePath = (
    path: string[],
    allNodes: MapNode[] | Record<string, MapNode>
): PrecomputedPath => {
    const pathNodes = path.map(id => getNode(id, allNodes)).filter((n): n is MapNode => !!n);
    const distances: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const nodeA = pathNodes[i];
        const nodeB = pathNodes[i + 1];
        let d = 0;
        if (nodeA.id === nodeB.id) {
            d = WAIT_VIRTUAL_DISTANCE;
        } else {
            const isStairJump = (nodeA.type === 'stair' && nodeB.type === 'stair');
            const isFloorChange = (nodeA.floor !== nodeB.floor);
            d = (isStairJump || isFloorChange) ? 0 : getDistance(nodeA, nodeB);
        }
        distances.push(d);
        totalDistance += d;
    }
    return { pathNodes, distances, totalDistance };
};

// 追加: キャッシュ済みデータを使う高速版（毎フレーム呼ばれる）
export const calculateRawPositionCached = (
    charData: CharacterTimelineData,
    currentTime: number,
    cached: PrecomputedPath
): { x: number; y: number; floor: string; visible: boolean; vx: number; vy: number; isFinished: boolean } | null => {
    const { path, startTime, duration } = charData;
    const { pathNodes, distances, totalDistance } = cached;

    if (!path || path.length === 0 || pathNodes.length === 0) return null;

    if (currentTime < startTime) {
        const startNode = pathNodes[0];
        return { x: startNode.x, y: startNode.y, floor: startNode.floor, visible: true, vx: 0, vy: 0, isFinished: false };
    }
    if (pathNodes.length === 1) {
        const node = pathNodes[0];
        return { x: node.x, y: node.y, floor: node.floor, visible: true, vx: 0, vy: 0, isFinished: false };
    }

    const rawProgress = duration > 0 ? (currentTime - startTime) / duration : 1;
    const progress = Math.min(Math.max(rawProgress, 0), 1);
    const isFinished = rawProgress >= 1.0;
    const targetDistance = totalDistance * progress;

    let currentDistSum = 0;
    for (let i = 0; i < distances.length; i++) {
        const segmentDist = distances[i];
        if (segmentDist === 0) continue;
        if (currentDistSum + segmentDist >= targetDistance) {
            const segmentProgress = (targetDistance - currentDistSum) / segmentDist;
            const nodeA = pathNodes[i];
            const nodeB = pathNodes[i + 1];
            const x = nodeA.x + (nodeB.x - nodeA.x) * segmentProgress;
            const y = nodeA.y + (nodeB.y - nodeA.y) * segmentProgress;
            const vx = nodeB.x - nodeA.x;
            const vy = nodeB.y - nodeA.y;
            return { x, y, floor: nodeA.floor, visible: true, vx, vy, isFinished: isFinished && progress === 1 };
        }
        currentDistSum += segmentDist;
    }

    const lastNode = pathNodes[pathNodes.length - 1];
    return { x: lastNode.x, y: lastNode.y, floor: lastNode.floor, visible: true, vx: 0, vy: 0, isFinished: true };
};
```

---

**ファイル 2: `src/hooks/useAnimationPositions.ts`**

パスキャッシュ(`pathCacheRef`)をプリセット変更時だけ再構築する。RAF ループ内では `calculateRawPositionCached` を呼ぶ。

```typescript
import { precomputePath, PrecomputedPath, calculateRawPositionCached, getCollisionOffsets, PositionWithVelocity } from '../utils/animationUtils';

// ... 既存の定数・型定義は変更なし ...

export const useAnimationPositions = (
    nodesMapRef: React.MutableRefObject<Record<string, MapNode>>,
    charNodeRefs: React.MutableRefObject<Map<string, Konva.Group>>,
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number }>>
): void => {
    // --- 追加: キャッシュ ---
    const pathCacheRef = useRef<Map<string, { charData: CharacterTimelineData; cached: PrecomputedPath }>>(new Map());
    const activePresetId = useAppStore(state => state.activePresetId);

    // プリセットが変わったときだけキャッシュを再構築（毎フレームではない）
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);
        if (!activePreset) {
            pathCacheRef.current.clear();
            return;
        }
        const nodesMap = nodesMapRef.current;
        const newCache = new Map<string, { charData: CharacterTimelineData; cached: PrecomputedPath }>();
        ICON_FILES.forEach(icon => {
            const charData = toCharacterTimelineData(activePreset.data[icon]);
            if (charData) {
                newCache.set(icon, { charData, cached: precomputePath(charData.path, nodesMap) });
            }
        });
        pathCacheRef.current = newCache;
    }, [activePresetId]);  // ← プリセット変更時のみ

    useEffect(() => {
        const lastVelocities: Record<string, { vx: number; vy: number }> = {};
        let animId: number;

        const animate = () => {
            const { currentTime, presets, activePresetId: currentPresetId } = useAppStore.getState();
            const activePreset = presets.find(p => p.id === currentPresetId);
            const deadIcons: string[] = activePreset?.deadIcons ?? [];

            const activePositions: ActivePosition[] = [];
            ICON_FILES.forEach(icon => {
                if (deadIcons.includes(icon)) return;
                const entry = pathCacheRef.current.get(icon);  // キャッシュから取得
                if (!entry) return;

                // calculateRawPosition の代わりにキャッシュ版を使用
                const pos = calculateRawPositionCached(entry.charData, currentTime, entry.cached);
                if (!pos || !pos.visible) return;

                // ... 以降は既存の lastVelocities / activePositions.push ロジックと同じ ...
            });

            // ... getCollisionOffsets 以降は変更なし ...

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);  // 依存配列は変更なし
};
```

---

**ファイル 3: `src/hooks/useAnimationLoop.ts`**

`maxDuration` の計算を RAF ループから取り出し、プリセット変更時のみ `useEffect` で再計算する。  
`any` 型を除去して CLAUDE.md 規約に準拠させる。

```typescript
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { CharacterTimelineData } from '../store';  // 追加

const TARGET_FPS = 60;
const LOOP_DELAY_FRAMES = 60;

export const useAnimationLoop = () => {
    const isPlaying = useAppStore(state => state.isPlaying);
    const activePresetId = useAppStore(state => state.activePresetId);  // 追加

    const requestRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const maxDurationRef = useRef<number>(0);  // 追加

    // --- 追加: maxDuration をプリセット変更時のみ計算 ---
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);
        if (!activePreset?.data) {
            maxDurationRef.current = 0;
            return;
        }
        let max = 0;
        Object.values(activePreset.data).forEach((val) => {
            const charData = toCharacterTimelineData(val);  // 既存のヘルパーを流用
            if (!charData) return;
            const end = charData.startTime + charData.duration;
            if (end > max) max = end;
        });
        maxDurationRef.current = max;
    }, [activePresetId]);

    const animate = (time: number) => {
        const state = useAppStore.getState();
        if (!state.isPlaying) {
            requestRef.current = null;
            lastTimeRef.current = null;
            return;
        }

        if (lastTimeRef.current !== null) {
            const deltaTime = time - lastTimeRef.current;
            const safeDelta = Math.min(deltaTime, 100);
            const speed = state.playbackSpeed || 1.0;
            const deltaFrames = (safeDelta / 1000) * TARGET_FPS * speed;
            let nextTime = state.currentTime + deltaFrames;

            // maxDuration は useEffect で事前計算済み（RAF 内では参照するだけ）
            const maxDuration = maxDurationRef.current;
            if (maxDuration > 0 && nextTime > maxDuration + LOOP_DELAY_FRAMES) {
                nextTime = 0;
            }

            useAppStore.setState({ currentTime: nextTime });
        }
        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    };

    // ... useEffect(isPlaying) は変更なし ...
};
```

`toCharacterTimelineData` は `useAnimationPositions.ts` にローカル定義されているため、`animationUtils.ts` にエクスポートするか、同じ実装を `useAnimationLoop.ts` 内に定義する。

---

## 問題2: Animate ページでアニメーションを動かし続けると OutOfMemory が出る

### 根本原因

**問題1の根本原因 A（毎フレーム配列生成）が GC を枯渇させている。**

詳細:

1. `calculateRawPosition` が毎フレーム `pathNodes`（MapNode 参照の配列）と `distances`（number 配列）を生成
2. 生成速度 ≈ 234,000 要素/秒（ボトルネック A の試算参照）
3. V8 の Young Generation（Scavenge GC）は短命オブジェクトを高速回収できるが、この速度では Young Generation が溢れてオブジェクトが Old Generation に昇格する
4. Old Generation に蓄積すると Major GC（Mark-Compact）が走り、その間 JS スレッドが一時停止（Stop-The-World）→ フレームドロップと見かけ OOM
5. アニメーション時間が長くなるほど Major GC の頻度と停止時間が増加し、最終的に OOM エラーに至る

副次的要因: `getCollisionOffsets` 内の Union-Find 用 `parent` 配列（`Array.from({ length: n }, ...)`）も毎フレーム生成されるが、n ≤ 13 と小さいため主原因ではない。

### 修正

**問題1の修正（`pathCacheRef` + `calculateRawPositionCached`）を実装すれば連鎖的に解消する。独立した追加変更は不要。**

問題1の修正により:
1. `pathNodes` / `distances` 配列がプリセット変更時に一度だけ生成される
2. RAF ループ内での配列生成がなくなり GC 圧力が激減する
3. Young Generation が枯渇せず、Old Generation への昇格が起きなくなる → OOM が発生しない

---

## 問題3: 4 ペインウィンドウにすると上 2 つのペインがだんだん下に伸びていく

### 根本原因

**`NotesPanel.tsx:34` の `overflow: 'visible'` が `CanvasWorkspace` 内の `ResizeObserver` と正のフィードバックループを形成している。**

詳細な再現フロー:

1. `NotesPanel.tsx:34` — `CanvasWorkspace` を包む div が `overflow: 'visible'`
   ```jsx
   <div style={{ flex: 1, position: 'relative', overflow: 'visible', ... }}>
       <CanvasWorkspace compactMode={true} ... />
   </div>
   ```
2. `CanvasWorkspace` 内の `canvasContainerRef` div に `ResizeObserver` が設定されている（`NoteView.tsx:334-353`）
3. `CanvasWorkspace` が Konva Stage を描画すると、canvas 要素が `overflow: 'visible'` の div から視覚的にはみ出す
4. ブラウザは「はみ出し要素も含めた実効サイズ」を `ResizeObserver` に報告することがある（`contentRect` への影響）
5. `setCanvasSize` が呼ばれて Stage サイズが大きくなり、より大きくはみ出す
6. 次の `ResizeObserver` コールバックでさらに大きいサイズが報告される → **繰り返し**
7. これが特に 4 ペイン表示（`isGridMode: true`）で顕著なのは、Stage が 4 つ同時にレンダリングされて干渉するため

また compactMode の `padPos` 初期化エフェクト（`NoteView.tsx:287-292`）が `canvasSize` を依存に持つため、この循環が起きるたびに `getBoundingClientRect()` が再実行される副次効果もある。

### 修正

**ファイル: `src/components/NotesPanel.tsx`（1 行変更）**

```tsx
// Before
<div style={{ flex: 1, position: 'relative', overflow: 'visible', display: 'flex', flexDirection: 'column' }}>

// After
<div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
```

`overflow: 'hidden'` にすることで Konva の canvas 要素が div の境界を越えられなくなり、ResizeObserver のフィードバックループが断ち切られる。

---

## 問題4: Timeline notes (canvas) の背景が真っ黒

### 根本原因

**`NoteView.scss` の `.konvajs-content { background-color: transparent !important; }` ルールが、compactMode（AnimateView 内の `NotesPanel`）で適用されない。**

詳細:

Konva の `<Stage>` は `<div class="konvajs-content">` を生成し、その内部に canvas を配置する。Konva はデフォルトで `konvajs-content` に黒い（または不透明な）背景を設定するため、明示的に `transparent` を指定する必要がある。

現在の SCSS:
```scss
// NoteView.scss（現状）
.note-view-container {
  .note-content {
    .character-canvas-layout {   // ← ここに囲われている
      .char-canvas-wrapper {
        .konvajs-content {
          background-color: transparent !important;
        }
      }
    }
  }
}
```

この CSS セレクターは `.character-canvas-layout` 内でのみ有効。  
`AnimateView` の `NotesPanel` から使われる `CanvasWorkspace`（compactMode）は `character-canvas-layout` クラスを持たない（`NoteView.tsx:708`:`className={compactMode ? "" : "character-canvas-layout"}`）。  
そのため `konvajs-content` の Konva デフォルト背景（黒）が残り、beige 色の pane div の背景を覆い隠す。

### 修正

**ファイル: `src/styles/NoteView.scss`（数行追加）**

`character-canvas-layout` に依存しない独立したセレクターを追加することで、compactMode でも `transparent` が適用されるようにする。

```scss
// NoteView.scss の末尾（または先頭）に追加
// compactMode（AnimateView 内）でも Konva コンテンツが透明になるようにする
.char-canvas-wrapper .konvajs-content {
    background-color: transparent !important;
}
```

既存の `.character-canvas-layout .char-canvas-wrapper .konvajs-content` ルールはそのまま残してよい（競合しない）。

---

## 変更対象ファイルまとめ

| ファイル | 変更種別 | 問題 | 内容 |
|---|---|---|---|
| `src/utils/animationUtils.ts` | 追加 | 1 | `PrecomputedPath` 型・`precomputePath`・`calculateRawPositionCached` を追加 |
| `src/hooks/useAnimationPositions.ts` | 修正 | 1・2 | `pathCacheRef` を追加、RAF 内で `calculateRawPositionCached` を使用 |
| `src/hooks/useAnimationLoop.ts` | 修正 | 1 | `maxDurationRef` + `useEffect` でプリセット変更時のみ再計算。`any` 型除去 |
| `src/components/NotesPanel.tsx` | 修正 | 3 | `overflow: 'visible'` → `overflow: 'hidden'`（1 行変更） |
| `src/styles/NoteView.scss` | 追加 | 4 | `.char-canvas-wrapper .konvajs-content { background-color: transparent !important; }` を追加 |

問題2は問題1の修正で連鎖的に解消するため、独立した変更ファイルはない。

---

## 推奨実装順序

1. **問題3を最初に修正**（`NotesPanel.tsx` の1行変更、即時確認可能）
2. **問題4を修正**（`NoteView.scss` に数行追加、即時確認可能）
3. **問題1・2をまとめて修正**（3ファイル変更、以下の順で）
   1. `animationUtils.ts` に型・関数を追加
   2. `useAnimationLoop.ts` を修正（`maxDuration` + `any` 除去）
   3. `useAnimationPositions.ts` を修正（キャッシュ追加 + `calculateRawPositionCached` に切り替え）

---

## CLAUDE.md 規約との対応

| 規約 | 対応内容 |
|---|---|
| **`any` 型禁止** | `useAnimationLoop.ts` の `forEach((val: any) => ...)` を `CharacterTimelineData` 型キャストに変更 |
| **UI とロジックの分離** | 計算ロジック（`precomputePath`・`calculateRawPositionCached`）は `animationUtils.ts` に集約。Hook はキャッシュ管理のみ担当 |
| **カスタム Hook** | `useAnimationPositions` にキャッシュ管理を追加。UI コンポーネント（`AnimateView`）は変更不要 |
| **アダプターパターン** | 修正はすべて `src/hooks/`・`src/utils/`・`src/styles/`・`src/components/NotesPanel.tsx` 内で完結。プラットフォーム固有 API を含まない |
| **レスポンシブ（モバイルファースト）** | 修正は計算最適化・CSS 修正のみ。タッチ操作・レイアウトに影響しない |

---

## 実装後の検証手順

```bash
npm run dev          # Web 環境（ブラウザ）で動作確認
npm run tauri dev    # Tauri デスクトップ環境で動作確認
```

### 問題1・2 確認項目
- Animate モードで再生ボタンを押し、30 秒以上連続再生してもアイコンがスムーズに動くこと
- ブラウザの DevTools > Performance タブで、アニメーション再生中に長いフレーム（>16ms）がほぼ発生しないこと
- ブラウザの DevTools > Memory タブで、10 分以上再生しても使用メモリが一定範囲内に収まること（OOM が出ないこと）
- プリセット切り替え時にアイコン位置が正しくリセット・再計算されること

### 問題3 確認項目
- Animate ページの 4 ペイン表示（Timeline Notes のグリッドモード）に切り替えたとき、各ペインのサイズが一定のまま安定すること（数秒待っても伸び続けないこと）
- 1 ペイン ↔ 4 ペインを繰り返し切り替えても安定すること

### 問題4 確認項目
- Animate ページの Timeline Notes キャンバスの背景が beige（方眼紙）色で表示されること
- 1 ペイン・4 ペイン両方で背景が正常に表示されること
- キャラクターノート（Note モード）の Canvas 背景に影響がないこと（beige が維持されること）

### 回帰確認項目
- Create モードの経由地設定が引き続き正常動作すること
- Note モード（キャラノート・概要ノート・Misc）が正常動作すること
- Animate モードのプリセット切り替え・再生/停止が正常動作すること
- Tauri デスクトップ版で同じ動作が確認できること
