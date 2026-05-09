# バグ修正 実装ステップ

`docs/architecture.md` で特定した2バグの修正計画。  
CLAUDE.md の規約（アダプターパターン・カスタム Hook によるロジック分離・`any` 型禁止・レスポンシブ対応）に従って実装する。

---

## バグ1: アニメーション再生時のカクつき

### 根本原因（再掲）

`useAnimationLoop` が毎フレーム `useAppStore.setState({ currentTime })` を呼ぶ  
→ `AnimateView` が全ストア購読（`useAppStore()` セレクタなし）のため 60fps でフルレンダリング  
→ `useMemo(activeCharData)` の重い計算が毎フレーム走る  
→ React コミット後に `useEffect` で `targetPositionsRef` が更新されるため LERP ループが 1 フレーム古い値を読む  
→ カクつき

### 修正方針

**React の再レンダリングパスをアニメーション計算から完全に切り離す。**

`currentTime` の変化は Konva ノードへの直接操作（`node.x()` / `node.y()` / `node.visible()`）のみで処理し、React の reconciliation を経由しない。  
位置計算と LERP を 1 本の RAF ループに統合し、全データを `useAppStore.getState()` で毎フレーム直接読む。

---

### Step 1 — 新規カスタム Hook `useAnimationPositions` を作成する

**ファイル: `src/hooks/useAnimationPositions.ts`（新規作成）**

CLAUDE.md 規約「カスタム Hook でビジネスロジックと UI を分離する」に従い、  
アニメーション位置計算・LERP・Konva ノード操作をすべてこの Hook に集約する。

```
src/hooks/useAnimationPositions.ts の責務:
  - 引数: nodesMapRef, charNodeRefs, currentVisualPositions（すべて useRef）
  - useEffect 内で requestAnimationFrame ループを 1 本だけ回す
  - ループ内で useAppStore.getState() から currentTime / presets / activePresetId を取得
      （React の state 購読ではないため再レンダリングが発生しない）
  - calculateRawPosition() と getCollisionOffsets() を呼んで全キャラの目標座標を算出
  - charNodeRefs の各 Konva.Group に対して LERP + node.x() / node.y() / node.visible() を適用
  - 依存配列は [] （全データを毎フレーム getState() から読むため）
  - any 型禁止: charNodeRefs の型は Map<string, Konva.Group> を明示する
```

型定義のポイント:

```typescript
// charNodeRefs のキーは "${icon}:${floorId}" の形式
// 例: "1_sakuraba_ema.png:1F", "2_nikaido_hiro.png:B1"
export const FLOOR_IDS = ['1F', '2F', 'B1'] as const;
export type AnimFloorId = typeof FLOOR_IDS[number];

export const useAnimationPositions = (
    nodesMapRef: React.MutableRefObject<Record<string, MapNode>>,
    charNodeRefs: React.MutableRefObject<Map<string, Konva.Group>>,
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number }>>
): void => { /* RAF ループ */ };
```

ループ内の処理フロー（疑似コード）:

```typescript
const animate = () => {
    const { currentTime, presets, activePresetId } = useAppStore.getState();
    const activePreset = presets.find(p => p.id === activePresetId);

    // 1. 全キャラの目標座標を計算（既存の calculateRawPosition / getCollisionOffsets を使う）
    const activePositions = ICON_FILES
        .filter(icon => !deadIcons.includes(icon) && timelineData[icon])
        .map(icon => /* calculateRawPosition(...) */)
        .filter(Boolean);
    const offsets = getCollisionOffsets(activePositions, ICON_SIZE);

    // 2. 全 icon × 全 floorId の Konva ノードを直接操作
    ICON_FILES.forEach(icon => {
        FLOOR_IDS.forEach(floorId => {
            const node = charNodeRefs.current.get(`${icon}:${floorId}`);
            if (!node) return;

            const pos = activePositions.find(p => p.id === icon);
            if (!pos || pos.floor !== floorId) { node.visible(false); return; }

            // LERP 補間
            const target = { x: pos.x + offset.x, y: pos.y + offset.y };
            /* ... LERP ロジック（AnimateView.tsx の既存コードを移植） ... */
            node.x(current.x); node.y(current.y); node.visible(true);
        });
    });

    requestAnimationFrame(animate);
};
```

---

### Step 2 — `AnimateView.tsx` のストア購読を個別セレクタに変更する

**ファイル: `src/components/AnimateView.tsx:32`**

```typescript
// Before（全ストアを購読し currentTime の変化でフルレンダリング）
const { setSidebarWidth, presets, activePresetId, nodes, currentTime } = useAppStore();

// After（currentTime を除外し個別セレクタに変更）
const setSidebarWidth = useAppStore(state => state.setSidebarWidth);
const presets         = useAppStore(state => state.presets);
const activePresetId  = useAppStore(state => state.activePresetId);
const nodes           = useAppStore(state => state.nodes);
```

これにより `AnimateView` は `presets` / `activePresetId` / `nodes` が変化したとき（ユーザー操作時）のみ再レンダリングされ、毎フレームの `currentTime` 更新では再レンダリングされなくなる。

---

### Step 3 — `nodesMap` を `useMemo` から `useRef` に変更する

**ファイル: `src/components/AnimateView.tsx:40-44`**

```typescript
// Before（useMemo → currentTime 変化の再レンダリング連鎖に巻き込まれる可能性）
const nodesMap = useMemo(() => {
    const map: Record<string, MapNode> = {};
    nodes.forEach(n => { map[n.id] = n; });
    return map;
}, [nodes]);

// After（nodes 変化時のみ更新し、RAF ループに ref として渡す）
const nodesMapRef = useRef<Record<string, MapNode>>({});
useEffect(() => {
    const map: Record<string, MapNode> = {};
    nodes.forEach(n => { map[n.id] = n; });
    nodesMapRef.current = map;
}, [nodes]);
```

---

### Step 4 — 不要なコードを削除し、Hook を組み込む

**ファイル: `src/components/AnimateView.tsx`**

**削除するコード（Step 1 の Hook に移動するため不要になる）:**

| 行番号 | 削除対象 |
|---|---|
| 50行目 | `lastVelocitiesRef` の宣言 |
| 57行目 | `targetPositionsRef` の宣言 |
| 59〜108行目 | `useMemo(activeCharData, [...])` ブロック全体 |
| 110〜112行目 | `useEffect` による `targetPositionsRef` 更新 |
| 114〜152行目 | LERP を行う `useEffect` ブロック全体 |

**追加するコード（削除箇所の代わりに）:**

```typescript
// Step 1 で作成した Hook を呼ぶ（これだけでアニメーションが動く）
useAnimationPositions(nodesMapRef, charNodeRefs, currentVisualPositions);
```

---

### Step 5 — 全キャラクターを全フロアに事前レンダリングする方式に変更する

**ファイル: `src/components/AnimateView.tsx:154-178`（`renderFloorChars` 関数）**

現在の `renderFloorChars` は `activeCharData.list`（React state）でフィルタリングしている。  
Step 1 の Hook が `node.visible()` を直接制御するため、全 ICON_FILES を全フロアに事前生成する方式に変更する。

```typescript
// Before（activeCharData という React state に依存）
const renderFloorChars = (floorId: string) => {
    return activeCharData.list
        .filter(p => p.floor === floorId)
        .map(p => { /* MovingCharIcon */ });
};

// After（全キャラを事前生成。表示/非表示は Hook が node.visible() で制御）
const renderAllCharsForFloor = (floorId: AnimFloorId) => {
    return ICON_FILES.map(icon => {
        const nodeKey = `${icon}:${floorId}`;
        const setRef = (node: Konva.Group | null) => {
            if (node) charNodeRefs.current.set(nodeKey, node);
            else charNodeRefs.current.delete(nodeKey);
        };
        return <MovingCharIcon key={nodeKey} ref={setRef} icon={icon} x={0} y={0} />;
    });
};
```

JSX 側: `renderFloorChars('2F')` → `renderAllCharsForFloor('2F')` に 3 フロア分置き換える。

---

### Step 6 — `useAnimationLoop.ts` は変更しない

`currentTime` は引き続き store に保存する。`AnimationTimeline` 等の表示コンポーネントが `currentTime` を参照しているため。`useAnimationLoop` 自体の変更は不要。

---

## バグ2: キャラクターノート切り替え時の OOM エラー

### 根本原因（再掲）

`initDefaultImage` エフェクトが `notes.characters` を依存に持つ  
→ `addNoteAsset` が内容変化なしでも毎回新しい `notes.characters` 参照を生成する（`updateCanvasState` の spread）  
→ 依存変化でエフェクトが再実行 → `addNoteAsset` → 参照変化 → 無限ループ  
→ `getImageSizeFromUrl` が N 回呼ばれ、N 個の重複 NoteObject が蓄積  
→ Konva ノードが N 個生成されて OOM

### 修正方針

**2段構えで防ぐ。**

1. `useRef<Set<string>>` で「初期化済みキャラクター」を追跡し、エフェクトを 1 キャラ 1 回のみ実行させる（ループの根本的な遮断）
2. `updateCanvasState` と `addNoteAsset` を修正し、内容変化なしの場合は state 参照を更新しない（将来的な同種バグの再発防止）

---

### Step 7 — `NoteView.tsx` の `initDefaultImage` エフェクトを修正する

**ファイル: `src/components/NoteView.tsx:1260-1282`**

**NoteView コンポーネント内に ref を追加（既存の useState 群の近くに追記）:**

```typescript
const initializedCharsRef = useRef<Set<string>>(new Set());
```

**既存エフェクトを以下に置き換え:**

```typescript
useEffect(() => {
    if (activeNoteTab !== 'character') return;
    if (initializedCharsRef.current.has(selectedChar)) return; // 初期化済みならスキップ

    // store を直接読む（依存配列に入れることで発生していたループを回避）
    const charData = useAppStore.getState().notes.characters?.[selectedChar];
    if (charData && charData.objects.length > 0) {
        // 既存データがあれば済みとしてマークするだけ
        initializedCharsRef.current.add(selectedChar);
        return;
    }

    // 非同期処理を開始する前に済みとしてマーク（ループ防止の核心）
    initializedCharsRef.current.add(selectedChar);

    const defaultImgSrc = `./icon/${selectedChar}`;
    addNoteAsset('character', selectedChar, defaultImgSrc);
    getImageSizeFromUrl(defaultImgSrc, 500).then(size => {
        addNoteObject('character', selectedChar, {
            id: `default_char_${Date.now()}`,
            type: 'image',
            x: 50, y: 100,
            width: size.width, height: size.height,
            content: defaultImgSrc,
            rotation: 0, scaleX: 1, scaleY: 1,
            canvasIndex: 0
        });
    });
}, [selectedChar, activeNoteTab, addNoteAsset, addNoteObject]);
// 変更点: notes.characters を依存配列から除外
```

**なぜこれで安全か:**
- `initializedCharsRef.current.add(selectedChar)` を非同期処理の**前**に実行するため、エフェクトが再実行されても即 `return` する
- `notes.characters` を依存から外すことで、store の参照変化によるエフェクト再実行が起きない
- 現在の store 状態は `useAppStore.getState()` で同期的に読む（依存配列に入れる必要がない）

---

### Step 8 — `store.ts` の `updateCanvasState` を修正する

**ファイル: `src/store.ts:190-219`（`updateCanvasState` 関数全体を置き換え）**

`updater` が同一参照を返した場合（＝内容変化なし）は `set()` に空オブジェクトを渡して state 参照の更新を防ぐ。

```typescript
const updateCanvasState = (
    state: AppState,
    targetType: NoteTargetType,
    targetId: string,
    updater: (canvas: CanvasState) => CanvasState
): Partial<AppState> => {
    const emptyCanvas: CanvasState = { objects: [], assets: [] };

    // 現在の canvas を特定
    let currentCanvas: CanvasState | undefined;
    if (targetType === 'overview') {
        currentCanvas = state.notes.overviewCanvas;
    } else if (targetType === 'preset') {
        currentCanvas = (state.notes.presets || {})[targetId];
    } else if (targetType === 'character') {
        currentCanvas = (state.notes.characters || {})[targetId];
    } else if (targetType === 'misc') {
        currentCanvas = state.notes.miscPages?.find(p => p.id === targetId)?.canvas;
    }

    const resolvedCanvas = currentCanvas || emptyCanvas;
    const newCanvas = updater(resolvedCanvas);

    // updater が同一参照を返した = 内容変化なし → state を書き換えない
    if (newCanvas === resolvedCanvas) return {};

    const newNotes: NoteData = {
        overview: state.notes.overview || '',
        overviewCanvas: state.notes.overviewCanvas || emptyCanvas,
        presets: state.notes.presets || {},
        characters: state.notes.characters || {},
        misc: state.notes.misc || {},
        miscPages: state.notes.miscPages || []
    };

    if (targetType === 'overview') {
        newNotes.overviewCanvas = newCanvas;
    } else if (targetType === 'preset') {
        newNotes.presets = { ...newNotes.presets, [targetId]: newCanvas };
    } else if (targetType === 'character') {
        newNotes.characters = { ...newNotes.characters, [targetId]: newCanvas };
    } else if (targetType === 'misc') {
        newNotes.miscPages = newNotes.miscPages.map(p =>
            p.id === targetId ? { ...p, canvas: newCanvas } : p
        );
    }
    return { notes: newNotes };
};
```

---

### Step 9 — `store.ts` の `addNoteAsset` に事前重複チェックを追加する

**ファイル: `src/store.ts`（`addNoteAsset` アクション）**

現状は `saveNoteHistory()` 呼び出し後に重複チェックしているため、重複の場合も履歴が増える。  
チェックを先に行い、重複なら履歴保存も state 更新も行わない。

```typescript
addNoteAsset: (targetType, targetId, asset) => {
    if (!get()._hasHydrated) return;

    // 事前重複チェック（重複なら履歴保存も state 更新もスキップ）
    const state = get();
    let currentCanvas: CanvasState | undefined;
    if (targetType === 'overview') {
        currentCanvas = state.notes.overviewCanvas;
    } else if (targetType === 'preset') {
        currentCanvas = state.notes.presets?.[targetId];
    } else if (targetType === 'character') {
        currentCanvas = state.notes.characters?.[targetId];
    } else if (targetType === 'misc') {
        currentCanvas = state.notes.miscPages?.find(p => p.id === targetId)?.canvas;
    }
    if (currentCanvas?.assets.includes(asset)) return;

    get().saveNoteHistory();
    set((s) => updateCanvasState(s, targetType, targetId, (canvas) => ({
        ...canvas,
        assets: [...canvas.assets, asset]
    })));
},
```

---

## 変更対象ファイルまとめ

| ファイル | 変更種別 | バグ | 内容 |
|---|---|---|---|
| `src/hooks/useAnimationPositions.ts` | **新規作成** | 1 | 位置計算 + LERP + Konva 直接操作を集約したカスタム Hook |
| `src/components/AnimateView.tsx` | 修正 | 1 | ストア購読を個別セレクタ化、Hook 呼び出し追加、全キャラ事前レンダリング方式に変更 |
| `src/components/NoteView.tsx` | 修正 | 2 | `initializedCharsRef` 追加、依存配列から `notes.characters` を除去 |
| `src/store.ts` | 修正 | 2 | `updateCanvasState` に早期リターン追加、`addNoteAsset` に事前重複チェック追加 |

---

## CLAUDE.md 規約との対応

| 規約 | 対応内容 |
|---|---|
| **UI とロジックの分離（カスタム Hook）** | `useAnimationPositions` に計算・Konva 操作を集約。`AnimateView` は純粋なレンダリングのみ担当 |
| **`any` 型禁止** | `useAnimationPositions` の引数・戻り値すべてに具体的な型を定義。`Map<string, Konva.Group>` 等を明示 |
| **アダプターパターン** | 新規コードに `@tauri-apps/api` や `localStorage` 等のプラットフォーム固有 API を含まない。`useAppStore.getState()` は標準 Zustand API |
| **レスポンシブ（モバイルファースト）** | 修正はアニメーション座標計算と状態管理のみ。CSS レイアウト・タッチ操作に影響しない |

---

## 実装後の検証手順

```bash
npm run dev          # Web 環境（ブラウザ）で動作確認
npm run tauri dev    # Tauri デスクトップ環境で動作確認
```

### バグ1 確認項目
- Animate モードで再生ボタンを押し、10 秒以上連続再生してもアイコンがスムーズに動くこと
- 複数キャラクターが同一ノードに集合したとき、隊列オフセットがなめらかに変化すること
- ブラウザの DevTools > Performance タブで `AnimateView` の再レンダリングが再生中に発生しないこと

### バグ2 確認項目
- キャラクターノートタブを開き、全 13 キャラクターを順番にクリックしてもクラッシュしないこと
- 各キャラクターの初回表示時にデフォルト画像が 1 枚だけ配置されること（重複なし）
- 一度開いたキャラクターに戻ったとき、画像が増殖しないこと

### 回帰確認項目
- ノートキャンバスへの図形描画・テキスト入力・フリーハンドが正常動作すること
- Ctrl+Z による Undo が機能すること
- Misc ノートのページ追加・削除・リネームが正常動作すること
- Create モードのグラフ編集（ノード追加・削除・Undo）が正常動作すること
