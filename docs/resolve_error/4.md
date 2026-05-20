# 根本原因分析と修正ステップ — resolve_error4

最終更新: 2026-05-11

---

## 対象問題

| # | 症状 | ファイル群 |
|---|---|---|
| 1 | 数分再生すると Out of Memory (OOM) | `useAnimationLoop.ts`, `useAnimationPositions.ts`, `animationUtils.ts` |
| 2 | キャラクターアイコンのアニメーションがカクつく | 同上 |
| 3 | 近接グルーピング処理に「並びかけ」中間状態が出る | `animationUtils.ts`, `useAnimationPositions.ts` |

問題1・2は同根。問題3は独立。

---

## 問題1 & 2 — OOM + カクつき

### 根本原因 (3層構造)

#### 層1: 二重 RAF ループの非同期アーキテクチャ（カクつきの直因）

```
useAnimationLoop RAF  →  setState({ currentTime })  ─┐ 別フレームで読む
useAnimationPositions RAF  →  getState().currentTime ─┘ → 1フレーム遅延 + ジッター
```

`useAnimationLoop` が時刻を Zustand に書き、`useAnimationPositions` が次の RAF で読む。
2本の `requestAnimationFrame` は同じ画面更新サイクルに乗ることが **保証されない**。
実際のタイミングずれが毎フレームの LERP に積み重なりジッターとなる。

#### 層2: 毎フレーム Zustand 書き込みによる全購読者通知（OOM・カクつきの共通原因）

`useAnimationLoop` は再生中に毎秒 60 回 `useAppStore.setState({ currentTime })` を呼ぶ。
Zustand は全 subscriber の selector を都度呼び出す。
`AnimateView` が持つ 3 つの `useAppStore(selector)` + `ReadOnlyMapView` 3 インスタンス分の
`nodes`・`edges` selector = **最低 9 関数/フレーム** が不要に評価される。
これに加え React の scheduler が差分検知キューに仕事を積み続け、数分でメモリを圧迫する。

#### 層3: 毎フレームのオブジェクト生成（OOM の直因）

`useAnimationPositions.animate()` が毎フレーム生成するオブジェクト群:

```typescript
// 毎フレーム生成 (60fps × 数十個 = 毎秒 3,000〜4,000 オブジェクト)
const activePositions: ActivePosition[] = [];          // 新規配列
const targets: Record<string, {...}> = {};             // 新規オブジェクト

// getCollisionOffsets 内
const parent = Array.from({ length: n }, (_, i) => i); // 新規配列
const groups: Record<number, number[]> = {};            // 新規オブジェクト
const offsets: Record<string, {x,y}> = {};             // 新規オブジェクト + {x,y} × n
positions.forEach(p => offsets[p.id] = { x: 0, y: 0 }); // n 個の {x,y}
```

V8 の incremental GC でも数分の高頻度アロケーションを追い切れず、ヒープが枯渇する。

---

### 修正方針

**アーキテクチャを根本から変更し「単一 RAF ループ」に統合する。**

```
【修正前】
useAnimationLoop RAF ─ setState(currentTime) ─→ Zustand ─→ 全subscriber通知
useAnimationPositions RAF ─ getState() ─ 位置計算 ─ Konva直接操作

【修正後】
useAnimationPositions RAF (1本)
  ├─ timeRef で時刻を進行（Zustand 不要）
  ├─ pathCache から位置計算
  ├─ Konva 直接操作
  └─ Zustand.currentTime を 4フレームに1回だけ書き込み（UI更新用）

useAnimationLoop → 時刻進行ロジックを削除し廃止
```

**ポイント:**
- `currentTime` を `timeRef<number>` に保持し、Zustand への書き込みを **4フレームに1回**に絞る
- スクラバー(シーク)操作は `|timeRef - storeCurrentTime| > SEEK_THRESHOLD` で検出し `timeRef` を同期
- オブジェクトプールとして `activePositions`・`parent`・`offsets` 用バッファを `useRef` で一度だけ確保

---

### 修正ステップ

#### Step 1: `src/utils/animationUtils.ts`

`getCollisionOffsets` の引数にプール用バッファを追加し、内部での配列生成を廃止する。

```typescript
// 追加: プールバッファ型
export interface CollisionPool {
    parent: number[];   // length >= positions.length で使い回す
    groupMap: Map<number, number[]>;  // clear() して再利用
}

export const createCollisionPool = (): CollisionPool => ({
    parent: [],
    groupMap: new Map(),
});

// シグネチャ変更: pool を受け取る
export const getCollisionOffsets = (
    positions: PositionWithVelocity[],
    iconSize: number,
    pool: CollisionPool,   // ← 追加
    offsets: Record<string, { x: number; y: number }>  // ← 外から渡す（再利用）
): void => {   // 戻り値なし（offsets を in-place 更新）
    const n = positions.length;
    const BASE_THRESHOLD = iconSize * 0.45;

    // pool.parent を再利用（拡張のみ、縮小しない）
    while (pool.parent.length < n) pool.parent.push(0);
    for (let i = 0; i < n; i++) pool.parent[i] = i;

    // ... Union-Find ロジック（変更なし）...

    // pool.groupMap を再利用
    pool.groupMap.clear();
    // ... グループ構築・オフセット計算（変更なし、ただし offsets を in-place 書き換え）...
};
```

グループ所属キー（問題3用）を返す関数を追加:

```typescript
// 各 icon がどのグループルートに属するかを返す（問題3用）
export const computeGroupKeys = (
    positions: PositionWithVelocity[],
    iconSize: number,
    pool: CollisionPool
): Record<string, string> => {
    // Union-Find だけ実行し、positions[i].id → find(i) の文字列マップを返す
    // offsets 計算は不要
};
```

#### Step 2: `src/hooks/useAnimationPositions.ts` — 全面改修

```typescript
const TARGET_FPS = 60;
const LOOP_DELAY_FRAMES = 60;
const ZUSTAND_WRITE_INTERVAL = 4;   // 4フレームに1回だけ書き込む
const SEEK_THRESHOLD = 10;          // これ以上ずれたらシーク判定

export const useAnimationPositions = (
    nodesMapRef, charNodeRefs, currentVisualPositions
): void => {
    const pathCacheRef    = useRef(new Map());
    const timeRef         = useRef(0);
    const maxDurationRef  = useRef(0);
    const lastTsRef       = useRef<number | null>(null);
    const frameCountRef   = useRef(0);
    const poolRef         = useRef(createCollisionPool());
    const offsetsRef      = useRef<Record<string, { x: number; y: number }>>({});
    const prevGroupKeyRef = useRef<Record<string, string>>({});  // 問題3用

    const activePresetId = useAppStore(state => state.activePresetId);

    // プリセット変更時: キャッシュ再構築 + maxDuration 計算 + 時刻リセット
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);
        pathCacheRef.current.clear();
        prevGroupKeyRef.current = {};
        timeRef.current = 0;
        lastTsRef.current = null;
        maxDurationRef.current = 0;
        if (!activePreset) return;

        let max = 0;
        const nodesMap = nodesMapRef.current;
        const data = activePreset.data as Record<string, unknown>;
        ICON_FILES.forEach(icon => {
            const charData = toCharacterTimelineData(data[icon]);
            if (!charData) return;
            pathCacheRef.current.set(icon, { charData, cached: precomputePath(charData.path, nodesMap) });
            const end = (charData.startTime ?? 0) + (charData.duration ?? 0);
            if (end > max) max = end;
        });
        maxDurationRef.current = max;
    }, [activePresetId]);

    // 単一 RAF ループ（時刻進行 + 位置計算 + Konva 操作を一体化）
    useEffect(() => {
        let animId: number;

        const animate = (timestamp: number) => {
            const { isPlaying, playbackSpeed, currentTime: storeTime } = useAppStore.getState();
            const deadIcons: string[] = useAppStore.getState().presets
                .find(p => p.id === useAppStore.getState().activePresetId)?.deadIcons ?? [];

            // --- シーク検出: storeTime が timeRef と大きくずれていたら同期 ---
            if (Math.abs(timeRef.current - storeTime) > SEEK_THRESHOLD) {
                timeRef.current = storeTime;
                lastTsRef.current = null;
            }

            // --- 時刻進行 ---
            if (isPlaying) {
                if (lastTsRef.current !== null) {
                    const delta = Math.min(timestamp - lastTsRef.current, 100);
                    const deltaFrames = (delta / 1000) * TARGET_FPS * (playbackSpeed || 1.0);
                    timeRef.current += deltaFrames;
                    const max = maxDurationRef.current;
                    if (max > 0 && timeRef.current > max + LOOP_DELAY_FRAMES) {
                        timeRef.current = 0;
                    }
                }
                lastTsRef.current = timestamp;
            } else {
                lastTsRef.current = null;
            }

            const currentTime = timeRef.current;

            // --- 位置計算 ---
            const activePositions: PositionWithVelocity[] = [];  // ← Step 3でプール化
            ICON_FILES.forEach(icon => {
                if (deadIcons.includes(icon)) return;
                const entry = pathCacheRef.current.get(icon);
                if (!entry) return;
                const pos = calculateRawPositionCached(entry.charData, currentTime, entry.cached);
                if (!pos || !pos.visible) return;
                // ... velocity 処理（既存ロジック）...
                activePositions.push({ id: icon, x: pos.x, y: pos.y, floor: pos.floor, vx, vy });
            });

            // --- 衝突オフセット（プール使用） ---
            // offsets を in-place クリア
            activePositions.forEach(p => {
                offsetsRef.current[p.id] = offsetsRef.current[p.id] ?? { x: 0, y: 0 };
                offsetsRef.current[p.id].x = 0;
                offsetsRef.current[p.id].y = 0;
            });
            getCollisionOffsets(activePositions, ICON_SIZE, poolRef.current, offsetsRef.current);

            // --- グループキー計算（問題3） ---
            const newGroupKeys = computeGroupKeys(activePositions, ICON_SIZE, poolRef.current);

            // --- Konva 直接操作 ---
            ICON_FILES.forEach(icon => {
                FLOOR_IDS.forEach(floorId => {
                    const node = charNodeRefs.current.get(`${icon}:${floorId}`);
                    if (!node) return;
                    // ... target の取得（既存ロジック）...
                    const didGroupChange = prevGroupKeyRef.current[icon] !== newGroupKeys[icon];

                    if (didGroupChange || target.isFinished || distSq > TELEPORT_THRESHOLD ** 2) {
                        // グループ変化フレームは即スナップ（LERP スキップ）
                        node.x(target.x); node.y(target.y);
                        currentVisualPositions.current[icon] = { x: target.x, y: target.y };
                    } else {
                        // 通常 LERP（既存ロジック）
                        ...
                    }
                });
            });

            prevGroupKeyRef.current = newGroupKeys;

            // --- Zustand 書き込み（4フレームに1回） ---
            frameCountRef.current++;
            if (frameCountRef.current % ZUSTAND_WRITE_INTERVAL === 0) {
                useAppStore.setState({ currentTime });
            }

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);
};
```

#### Step 3: `src/hooks/useAnimationLoop.ts` — 廃止

時刻進行ロジックを `useAnimationPositions` に移管したため、このファイルは不要になる。

- `src/hooks/useAnimationLoop.ts` を削除
- `src/components/AnimateView.tsx` から `import { useAnimationLoop }` と `useAnimationLoop()` 呼び出しを削除

#### Step 4: `src/components/AnimateView.tsx` — import 整理のみ

`useAnimationLoop` の削除に伴う import 除去のみ。ロジック変更なし。

---

## 問題3 — 近接グルーピングの二値化

### 根本原因

`getCollisionOffsets` がグループオフセット（グリッド配置座標）を返すのは**正しく二値**だが、
その後の LERP 処理 (`prev + diff * LERP_FACTOR`) がオフセット込み目標座標に向かって
滑らかに補間するため、**閾値を越えた直後の数フレームに「並びかけ」の中間状態**が現れる。

### 修正方針

Step 2 に含む: グループキーが変化したフレームは LERP を完全にスキップし、
目標座標に即スナップする（`currentVisualPositions` を目標値で上書き）。

これにより「近い → 即グリッド」「遠い → 即解除」の二値表示になる。

---

## アダプターパターン / レスポンシブ規約への影響

今回の変更はすべて `src/hooks/` と `src/utils/` 内のロジック層に閉じており、
`src/components/` の描画コードを変更しない。

- Tauri / Web 両環境で動作する（RAF・useRef・Konva 直接操作はどちらでも使用可能）
- `window.__TAURI__` などのプラットフォーム判定は不要
- モバイル向けのタッチ・レスポンシブには影響なし

---

## 修正後の期待動作

| 項目 | 修正前 | 修正後 |
|---|---|---|
| RAFループ数 | 2本（非同期） | 1本（同期） |
| Zustand書き込み/秒 | 60回 | ≦15回 |
| フレームあたりオブジェクト生成 | ~50個 | ~10個（プール再利用） |
| グルーピング | LERP で緩やかに移行 | 閾値超えで即スナップ（二値） |
| OOM | 数分で発生 | 発生しない |
| カクつき | 常時 | 発生しない |

---

## 修正対象ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `src/utils/animationUtils.ts` | `CollisionPool` 型・`createCollisionPool`・`computeGroupKeys` 追加、`getCollisionOffsets` シグネチャ変更 |
| `src/hooks/useAnimationPositions.ts` | 全面改修（単一RAFループ化・プール使用・二値グルーピング） |
| `src/hooks/useAnimationLoop.ts` | **削除** |
| `src/components/AnimateView.tsx` | `useAnimationLoop` の import・呼び出しを削除 |
