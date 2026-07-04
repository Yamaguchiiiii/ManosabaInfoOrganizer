# 自発的リファクタリング・機能改善提案（実装指示書）

最終更新: 2026-07-03（詳細化 v2）
状態: 提案のみ・未実装。ユーザー指示ではなく Claude 側からの提案。
関連: 性能の根本対策の背景説明は `docs/resolve_error/19.md` 共通原因A、UI刷新は `ui.md`、スマホは `smartphone.md`。本書の各項目は **この文書単体で実装に着手できる** ことを目標に記述する。

共通の検証コマンド（全項目の受入条件に含む）:
```
npx tsc -p tsconfig.json --noEmit   # ※引数なしの `npx tsc` は不可（グローバル設定を拾う罠）
npm run build
npm run dev          # Web 起動確認
npm run tauri dev    # デスクトップ起動確認
```

先に現状の良い点（維持すべき設計）: 再生状態の `usePlaybackStore` 分離、テキスト編集のローカルstate化と `finishTextEditing` の冪等コミット、IME ガードの徹底、`navigationGuard`/`DialogHost` によるブラウザダイアログ排除、`getCollisionOffsets` のオブジェクトプール化、症状番号をコードコメントに残す運用。これらの方針は崩さないこと。

---

# A. リファクタリング

## A-1.【最優先】persist の全量直列化をやめる（カスタム PersistStorage 化）

### 現状と問題
`src/store.ts` は `persist` + `createJSONStorage(() => idbStorage)`。この構成では **set() のたびに** `JSON.stringify(partialize(state))` が同期実行され、さらに `idbStorage.setItem` 冒頭で巨大文字列同士の `value === lastValue` 比較（O(n)）が走る。state には base64 画像が含まれるため数十MB級で、setter 1回 250〜650ms（詳細な証拠は 19.md 共通原因A）。

### 変更内容
`createJSONStorage` を廃止し、**オブジェクト参照を受け取る `PersistStorage<T>`** を自前実装する。stringify は debounce 後（最大1回/500ms）のアイドル時にのみ実行する。

新規ファイル `src/store/persistStorage.ts`（A-2 実施前なら `src/persistStorage.ts` でも可）:

```ts
import { PersistStorage, StorageValue } from 'zustand/middleware';

// persist 対象の型。AppState から partialize 除外キーを抜いたもの。
// A-2 実施後は store/types.ts の PersistedState を import する。
export type PersistedState = Record<string, unknown>;

const DB_NAME = 'mystery-map-db';
const STORE_NAME = 'app-state';
const PERSIST_DEBOUNCE_MS = 500;

// openDB は既存実装（store.ts:179）をこのファイルへ移動して再利用する。

// B-3（保存状態インジケータ）用の通知。実装しない間は no-op にしておく。
export type PersistPhase = 'pending' | 'saving' | 'saved' | 'error';
let notifyPhase: (p: PersistPhase) => void = () => {};
export const setPersistPhaseListener = (fn: (p: PersistPhase) => void) => { notifyPhase = fn; };

export const createIdbPersistStorage = <S extends PersistedState>(): PersistStorage<S> & {
    /** 未書き込み分を同期的に確定させる（バックアップのエクスポート前などに使う） */
    flushNow: () => Promise<void>;
} => {
    let pending: { name: string; value: StorageValue<S> } | null = null;
    let lastWritten: StorageValue<S> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // トップレベルキーの参照比較。partialize は毎回新オブジェクトを返すが、
    // 変更のなかったスライス（notes/presets/nodes…）は同一参照のままなので、
    // 「全キー同一参照」なら persist 対象に変化なし＝何もしない。O(キー数)。
    const changed = (prev: StorageValue<S> | null, next: StorageValue<S>): boolean => {
        if (!prev) return true;
        if (prev.version !== next.version) return true;
        const a = prev.state as Record<string, unknown>;
        const b = next.state as Record<string, unknown>;
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) if (!Object.is(a[k], b[k])) return true;
        return false;
    };

    const writeNow = async (): Promise<void> => {
        timer = null;
        if (!pending) return;
        const { name, value } = pending;
        pending = null;
        notifyPhase('saving');
        try {
            const str = JSON.stringify(value); // ← ここが唯一の stringify 地点
            const db = await openDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(str, name);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            lastWritten = value;
            notifyPhase('saved');
        } catch (e) {
            pending = pending ?? { name, value }; // 失敗時は次回リトライ対象に戻す
            notifyPhase('error');
        }
    };

    const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            // アイドル時に直列化（WebView2 に requestIdleCallback が無い場合に備えフォールバック）
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => { void writeNow(); }, { timeout: 1000 });
            } else {
                void writeNow();
            }
        }, PERSIST_DEBOUNCE_MS);
    };

    const flushNow = async () => {
        if (timer) { clearTimeout(timer); timer = null; }
        await writeNow();
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') void flushNow();
        });
        window.addEventListener('pagehide', () => { void flushNow(); });
    }

    return {
        getItem: async (name) => {
            // 既存 idbStorage.getItem と同じ: IDB → 無ければ localStorage 移行（A-8-3 参照）
            const str = await idbGetString(name); // 既存実装を移設
            if (!str) return null;
            try { return JSON.parse(str) as StorageValue<S>; } catch { return null; }
        },
        setItem: (name, value) => {
            if (!changed(pending?.value ?? lastWritten, value)) return; // 参照比較のみ・stringifyしない
            notifyPhase('pending');
            pending = { name, value };
            schedule();
        },
        removeItem: async (name) => { /* 既存 removeItem を移設 */ },
        flushNow,
    };
};
```

`store.ts` 側の変更:
```ts
const idbPersist = createIdbPersistStorage<PersistedState>();
export const flushPersistNow = idbPersist.flushNow; // B-1 が使う

// persist オプション:
{
    name: 'mystery-map-storage',
    storage: idbPersist,          // createJSONStorage を通さない
    partialize: ...,              // 既存のまま
    onRehydrateStorage: ...,      // 既存のまま
}
```

### 手順
1. `persistStorage.ts` を新設し、`openDB` / getItem の localStorage 移行 / removeItem を store.ts から移設。
2. store.ts の `idbStorage`（194〜279行）を削除し、上記 `storage` 指定に差し替え。
3. 旧実装が保存した値も `JSON.stringify({state, version})` 形式なので **データ互換・移行不要**（getItem の parse がそのまま読める）ことをリロードで確認。
4. `App.tsx` の `changeModeWithTransition` 内の `setMode`+`setGraphEditMode`+`setSkullMode` 3連発を、store の新アクション `enterMode(mode)`（1回の set で `{ mode, isGraphEditMode: false, isSkullMode: false }` を設定。create へ入る時は isGraphEditMode/isSkullMode を触らない現行挙動を維持）に置換。

### 受入条件
- Performance プロファイルで「カラーピッカー3秒ドラッグ」「ページ遷移×3」中に 50ms 超の long task が出ない。
- 編集停止 500ms 後に `IDBObjectStore.put` が1回だけ走る（DevTools → Performance で確認）。
- リロード・Tauri/Web 両方でデータが復元される。タブを閉じる直前の編集も残る（pagehide flush）。

### リスク
- `requestIdleCallback` のコールバックが visibility hidden 中に遅延する環境がある → hidden 時は flush 側が走るので実害なし。
- 参照比較は「スライス内の deep 変更で参照が変わらない」ケースを見逃すが、zustand ではイミュータブル更新が前提（現コードも全て spread 更新）なので該当しない。**今後も直接ミューテーション禁止**をコメントで明記すること。

## A-2. ストア分割（slices パターン）と複合アクション

### 現状と問題
`useAppStore`（store.ts、約650行）にダイアログ/UI/マップグラフ/プリセット/ノートが同居。可読性が低く、A-1 の参照比較キーも増えがち。

### 変更内容
`src/store.ts` を **`src/store/` ディレクトリに置換**する。既存の import は全て `from '../store'` / `from './store'` 形式なので、`src/store/index.ts` を作れば **呼び出し側の変更はゼロ**。

```
src/store/
  index.ts          // create + persist + 全sliceの合成。既存の export 名を全て再export
  types.ts          // AppState, MapNode, NoteObject, ... 全型と PersistedState
  persistStorage.ts // A-1
  uiSlice.ts        // dialog系, mode, activeNoteTab, isGraphEditMode, isSkullMode,
                    // tutorialSeen, sidebarWidth, activeFloor, selectedIcons(A-3),
                    // _hasHydrated, enterMode()
  mapSlice.ts       // nodes, edges, history, undo/saveHistory, add/update/removeNode, add/removeEdge
  presetSlice.ts    // presets, activePresetId, プリセットCRUD, saveCharacterAnimation系, toggleDeadIcon
  noteSlice.ts      // notes, noteHistory(+B-2のredo), note系アクション全部, miscPages
```

合成は zustand 標準の slices パターン:
```ts
// types.ts
export type AppState = UiSlice & MapSlice & PresetSlice & NoteSlice;
export type SliceCreator<T> = StateCreator<AppState, [['zustand/persist', unknown]], [], T>;

// index.ts
export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createUiSlice(...a),
      ...createMapSlice(...a),
      ...createPresetSlice(...a),
      ...createNoteSlice(...a),
    }),
    { name: 'mystery-map-storage', storage: idbPersist, partialize, onRehydrateStorage }
  )
);
// 既存互換の再export（ICON_FILES, PRISON_POSITIONS, computeDuration, usePlaybackStore, 型一式）
```

### 手順
1. `types.ts` へ型を移動（`export type`/`export interface` のみ。値は index/各slice）。
2. slice を1つずつ切り出す（uiSlice → mapSlice → presetSlice → noteSlice の順。各ステップで tsc を通す）。
3. `ICON_FILES` / `PRISON_POSITIONS` / `computeDuration` / `usePlaybackStore` は `index.ts` から re-export（`constants.ts` が `import type { MapNode } from './store'` している点に注意 — types.ts へ移して `store/index.ts` で再export すれば循環しない）。
4. 最後に `src/store.ts` を削除。

### 受入条件
- 全 import 無変更で tsc/build 緑。persist キー名・保存形式が変わらない（リロードで既存データ復元）。
- 各 slice ファイルが 200 行以下。

## A-3. `selectedIcons` の store 移管と props drilling 解消

### 現状と問題
キャラ選択が `App.tsx` のローカル state（`useState<string[]>`）で、`Sidebar` / `TopBar` / `CreateView` へ props drilling。選択ロジック（shift複選・ガード・死亡キャラ制御）が App と Sidebar に分散。スマホUI（smartphone.md M0）とチュートリアル hands-on 判定（19.md #2）の前提でもある。

### 変更内容
uiSlice に追加:
```ts
selectedIcons: string[];                      // persist除外（partializeに'selectedIcons'を追加）
clearIconSelection: () => void;
selectIcon: (icon: string, multi: boolean) => Promise<void>;
// selectIcon の実装 = 現 App.handleIconSelect と同一:
//   multi(shift): トグル / 単一: 同一再選択は無視、runNavigationGuard() が false なら中止
// navigationGuard(services) は store を import していないため循環参照なし（確認済み）
```

各コンポーネントの変更:
- `App.tsx`: `selectedIcons`/`handleIconSelect`/`clearSelection` を削除し store 参照に。`Sidebar`/`TopBar`/`CreateView` への該当 props を撤去。
- `Sidebar.tsx`: `selectedIcons`/`onIconSelect` props を削除し store から取得。skullモード時の `toggleDeadIcon` 分岐（handleIconClick）は Sidebar に残してよい。
- `TopBar.tsx` / `CreateView.tsx`: 同様に store 直読み（`useAppStore(s => s.selectedIcons)`）。CreateView の `onClearSelection` は `clearIconSelection` に置換。

### 受入条件
- shift複数選択・死亡キャラのクリック不可・未保存経路ガード（キャラ切替時に確認が出る）の3挙動が現状と同一。
- `grep -rn "selectedIcons" src/` で props 経由の受け渡しが CreateView 内部の子（WaypointPanel）以外に残っていない。

## A-4. NoteView.tsx（2,368行）/ CreateView.tsx（1,106行）の分割

### 現状と問題
NoteView.tsx に Konvaオブジェクト3種+ヘルパー+`CanvasWorkspace`(約1,850行)+`NoteView` 本体が同居。06/30 #1 の「古い版で上書き」事故はファイルが巨大で差分が追えないことが誘因。

### 変更内容（移動のみ・ロジック変更禁止）
```
src/components/note/
  objects/NoteObjectComponents.tsx  // URLImage, EditableText, ShapeObject（A-5の型付けもここで）
  CanvasWorkspace.tsx               // 本体（さらに下記を分離）
  NoteToolsSidebar.tsx              // char-sidebar の中身（Tools/Images/Character Images, sidebarHeader受け）
  ImageGalleryWindow.tsx            // compact用フローティング画像一覧（ドラッグ移動含む）
  ShapeContextMenu.tsx              // 右クリックメニュー（色/線幅/Layer/Group）
  NoteView.tsx or ../NoteView.tsx   // タブ出し分けの薄い親（既存位置のままでも可）
src/hooks/
  useNoteClipboard.ts   // clipboard state + handleCopy/Cut/PasteSelected
  useNoteKeyboard.ts    // handleKeyDown 一式（Ctrl+Z/G/C/X/V, Escape, B-2でCtrl+Y追加）
  useTextEditing.ts     // editingText系 state/ref + finishTextEditing
  useNoteHistoryBatch.ts// saveHistoryOnceThenSkip + commitThrottled（A-8-1の修正込み）
src/utils/imageUtils.ts // getImageSizeFromUrl（NoteView.tsx:214）
```
- `NotesPanel.tsx` が `import { CanvasWorkspace } from './NoteView'` しているため、移行中は NoteView.tsx に `export { CanvasWorkspace } from './note/CanvasWorkspace';` の再exportを残す（最終的に import 先を更新して撤去）。
- CreateView 側: `FollowConfirmModal`（CreateView.tsx:1038〜）と `formatCharName`（→A-8-5）を先に切り出し、その後 `useRouteEditor`（waypoints/startRef/sync/save/edit/delete のハンドラ群）を抽出。smartphone.md M3 が同フックを使う。

### 手順
1コミット=1移動を厳守（`objects` → `imageUtils` → hooks → sidebar/gallery/menu → 最後に CanvasWorkspace 本体）。各コミットで tsc + Note ページの手動確認（配置/選択/ドラッグ/グループ/コピペ/undo/テキスト編集/4ペイン跨ぎ移動）。

### 受入条件
- 挙動完全一致（上記手動チェックリスト）。各ファイル400行以下。`NoteView.tsx` は200行以下になる想定。

## A-5. `any` の撲滅（CLAUDE.md 規約違反の解消）

### 現状（grep で確定した全出現箇所）
| 箇所 | 内容 |
|---|---|
| NoteView.tsx 46, 86, 112 | URLImage/EditableText/ShapeObject の props が `any` |
| NoteView.tsx 66, 106, 126, 127, 162, 565, 1683, 1706, 1707, 1743 | Konva イベント/props の `any` |
| NoteView.tsx 386, 736 | `PlacementMode.data?: any`（実体は画像src文字列） |
| CreateView.tsx 281, 488 | プリセット data の legacy 分岐で `any` |
| MergeModal.tsx 9 | `data: any` |
| MapObjectLayer.tsx 180-182 | ノードイベント `(e: any)` |
| MapElements.tsx 40, 78, 108 | RoomNode/PassNode/StairNode props `any` |
| store.ts | `AnimationPreset.data: Record<string, any>`、deleteCharacterAnimation 内 `Record<string, any>` |

### 変更内容
1. **旧形式データの一括正規化（本丸）**: `animationUtils.ts:564` に既存の `normalizeTimelineData` を使い、`onRehydrateStorage` で全プリセットを正規化する:
   ```ts
   state.presets = state.presets.map(p => ({
       ...p,
       data: Object.fromEntries(
           Object.entries(p.data)
               .map(([id, raw]) => [id, normalizeTimelineData(raw)])
               .filter(([, v]) => v !== null)
       ) as Record<string, CharacterTimelineData>,
   }));
   ```
   これで `AnimationPreset.data: Record<string, CharacterTimelineData>` に**型を確定**でき、散在する legacy 分岐を削除できる:
   - store.ts:484（updateTimelineItem の Array.isArray）
   - CreateView.tsx:281-282, 319, 488, 555-556, 635
   - useAnimationPositions.ts:20-23（normalizeTimelineData 呼び出し1本に）
   - animationUtils.ts の `resolveStartTimes` 冒頭 normalize は防御として残してよい（入力を unknown で受けているため）
2. Konvaオブジェクトの props 型:
   ```ts
   // note/objects/NoteObjectComponents.tsx
   export interface NoteObjectComponentProps {
       obj: NoteObject;                 // imageObj/textObj/shapeObj を obj に統一（呼び出し側1箇所修正）
       isDrawingMode: boolean;
       onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
       onChange: (attrs: Partial<NoteObject>) => void;
       onToggleEdit?: () => void;       // text のみ
       onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
       onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
       onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
   }
   ```
3. `PlacementMode` → `{ type: ExtendedNoteObjectType; data?: string } | null`（data は画像src）。`startPlacement(type, data?: string)`。
4. MapElements: `type NodeVisualProps = { x: number; y: number; isSelected?: boolean; isPath?: boolean; opacity?: number } & Omit<React.ComponentProps<typeof Group>, 'x' | 'y'>`。
5. MergeModal: `data: CharacterTimelineData`（1 実施後は legacy 不要）。
6. Konva イベントは全て `Konva.KonvaEventObject<MouseEvent>` / `<DragEvent>` / `<PointerEvent>` を明示。

### 受入条件
- `grep -rn ": any" src/` が 0 件（`as any` も 0 件。やむを得ない箇所は `unknown`+絞り込みで書き直す）。
- 旧データ（配列形式の path を含む古い保存）を持つ環境でリロードして正常動作（手元に無ければ DevTools で IDB の値を書き換えて再現テスト）。

## A-6. ビルド成果物・不要ファイルの整理

### 現状（確認済みの事実）
- `src/styles/` に `App.css / Modal.css / NoteView.css / AnimateView.css` と `.css.map` が存在するが、**`.css' を import している箇所は 0 件**（grep 確認済み。import は全て .scss）。sass の古いコンパイル成果物であり、誤編集・誤 import の罠。
- `public/_prototype/` がビルドで dist にそのまま同梱される。`src/assets/react.svg` 未使用。
- `index.html` の title が「Tauri + React + Typescript」、favicon が `/vite.svg` のまま。
- `public/logo.PNG`（大文字拡張子）を `src="public/logo.PNG"` で参照（本番404の件は 19.md #1-4）。

### 手順
1. `git rm src/styles/*.css src/styles/*.css.map` → `.gitignore` に `src/styles/*.css` `src/styles/*.css.map` を追記。
2. `public/_prototype/` を `docs/_prototype/` へ `git mv`（配信物から除外）。`src/assets/react.svg` を削除。
3. `public/logo.PNG` → `public/logo.png` に改名し、参照2箇所（App.tsx ロード画面 / Sidebar.tsx ヘッダ）を `./logo.png` に修正。
4. `index.html`: `<title>` をアプリ名（例:「魔法少女の魔女裁判 推理ノート」※文言はユーザー確認）に変更。favicon はロゴを 32/192/512px に書き出して `public/` へ置き `<link rel="icon">` を差し替え（B-7 の PWA アイコンと共用）。

### 受入条件
- `npm run build` 後の `dist/` に `_prototype` が含まれない。`dist/logo.png` が存在し、本番プレビュー（`npm run preview`）でロゴが表示される。

## A-7. 画像のモジュールキャッシュ（`use-image` の再デコード排除）

### 現状と問題
`use-image` はコンポーネント毎に `new Image()` を作り、アンマウントで破棄する。ページ遷移や 4ペイン再マウントのたびに `floor_*.png`（大判）とアイコン15枚の再デコードが走る。さらに `MapImage` が `common/MapElements.tsx:29` と `ReadOnlyMapView.tsx:14` に**重複定義**されている。

### 変更内容
新規 `src/services/imageCache.ts`:
```ts
const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();

export const getImage = (src: string): Promise<HTMLImageElement> => {
    const hit = cache.get(src);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(src);
    if (pending) return pending;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            try { await img.decode(); } catch { /* decode非対応は onload で十分 */ }
            cache.set(src, img); inflight.delete(src); resolve(img);
        };
        img.onerror = () => { inflight.delete(src); reject(new Error(`image load failed: ${src}`)); };
        img.src = src;
    });
    inflight.set(src, p);
    return p;
};

// React から使うフック（use-image 互換の戻り値）
export const useCachedImage = (src: string | undefined): HTMLImageElement | undefined => {
    const [img, setImg] = useState<HTMLImageElement | undefined>(() => src ? cacheGetSync(src) : undefined);
    useEffect(() => {
        if (!src) { setImg(undefined); return; }
        let alive = true;
        getImage(src).then(i => { if (alive) setImg(i); }).catch(() => { if (alive) setImg(undefined); });
        return () => { alive = false; };
    }, [src]);
    return img;
};
```

### 手順
1. `imageCache.ts` を追加（フックは `src/hooks/useCachedImage.ts` に分けてもよい）。
2. `ReadOnlyMapView.tsx:14` のローカル `MapImage` を削除し、`common/MapElements.tsx` の `MapImage` を import。`MapImage` 内の `useImage` を `useCachedImage` に置換。
3. `AnimateView.tsx` の `MovingCharIcon`（useImage で `./icon/${icon}`）と `NoteView` の `URLImage` も `useCachedImage` に置換。**data URL（数MB）はキャッシュに入れない**ガードを入れる（`src.startsWith('data:')` なら従来どおり都度ロード。19.md P2 で asset:// 化した後は blob URL をキャッシュ対象にする）。
4. `use-image` が未使用になったら `npm uninstall use-image`。

### 受入条件
- ページ遷移を繰り返しても Network/Performance にマップ画像の再デコードが出ない。メモリが増え続けない（キャッシュは固定枚数: マップ3+アイコン15+立ち絵15）。

## A-8. 細かなコード衛生（各30分以内）

1. **commitThrottled のリーク**（NoteView.tsx:624-634）: trailing の `setTimeout` がアンマウント後に発火し得る。`useEffect(() => () => { const r = propCommitRef.current; if (r.timer) clearTimeout(r.timer); if (r.last) r.last(); }, [])` を追加（最後の未コミット値は flush してから破棄）。A-4 の `useNoteHistoryBatch` 抽出時に組み込む。
2. **Tools の fill ピッカーだけ間引きなし**（NoteView.tsx:1090-1093）: コンテキストメニュー側（2016/2032/2063）と同様 `commitThrottled` を通す。
3. **localStorage→IDB 移行コードの撤去期限**（store.ts getItem 内 207-212）: コメントに `// TODO(2026-09): この移行パスを削除（2026-06 以前の localStorage 保存ユーザーの移行猶予）` を明記。
4. **AnimateView.tsx:112** `setSidebarWidth(MIN_SIDEBAR_WIDTH)` を `if (useAppStore.getState().sidebarWidth !== MIN_SIDEBAR_WIDTH)` でガード（無駄な persist 起動と Sidebar 再レンダリング防止）。
5. **formatCharName の重複**: `CreateView.tsx:1029` と `MergeModal.tsx:22` に同一実装 → `src/utils/charName.ts` へ抽出し両者から import（Animate 凡例・遭遇ログ B-6 でも使用）。
6. **マジックナンバーの定数化**: `constants.ts` に `export const NOTE_CANVAS = { W: 1200, H: 800, CHAR_LOGICAL_H: 600 } as const;` を追加し、NoteView.tsx:42-43 の `CANVAS_BASE_W/H`、**:1570 の重複ローカル定義 `CANVAS_BASE_WIDTH`**、:2220 の `canvasLogicalHeight = 600`、`COMPACT_SIDE_MIN`(:40) を置換・集約。
7. **dijkstra.ts の軽微最適化**: ループ内 `allNodes.find`（85-86行）を事前構築の `Record<string, MapNode>` に置換（現状 N≈130 で実害は小さいが、Edit Map Graph でノードが増えると O(V²·E) が効いてくる。優先度ヒープ化までは不要）。

受入条件: 各項目とも tsc/build 緑 + 該当操作の手動確認1点（例: 1 はテキスト/色編集直後にタブ切替してエラー・値落ちがないこと）。

## A-9. テスト基盤の導入（vitest）

### 現状と問題
テストが1本もない。sync 系（複数キャラの開始時刻解決・同一地点複数訪問）は 06/20〜06/26 に退行を繰り返しており、毎回手動再生で確認している。純粋関数が多くテスト費用対効果が高い。

### 手順
1. `npm i -D vitest`。**Vite 7 対応は vitest 3.2.4 以降**。インストール前に公式（vitest.dev / npm）で最新の対応状況を Fetch で確認すること（CLAUDE.md 規約）。
2. `package.json` に `"test": "vitest run", "test:watch": "vitest"` を追加。設定ファイル不要（デフォルトで `*.test.ts` を拾う。DOM 不要のユニットテストのみなので environment 指定なし）。
3. `src/utils/__tests__/` に以下を作成。**テストデータは INITIAL_NODES を使わず**、3〜6ノードの最小グラフをテスト内で定義する（読みやすさと独立性のため）。

| ファイル | ケース |
|---|---|
| `dijkstra.test.ts` | 直線経路 / 階段(connectedFloor)経由のフロア跨ぎ / 到達不能で null / start・end 同一 |
| `animationUtils.test.ts` | `computeDuration`: 重複ノード=待機が距離換算されること。`getNodeVisitTimes`: 連続重複が1訪問に集約され arrival<departure。`getNodeArrivalOccurrences`: 2回訪問で2件・時刻昇順。`normalizeTimelineData`: 配列/オブジェクト/null の3系統 |
| `resolveStartTimes.test.ts` | 連鎖 A→B→C の伝播 / 循環 A→B→A で 0 フォールバック / syncConstraints 持ちは startRef 無視（:597-598 の仕様） / phase: departure + extraDelay / 基準キャラが地点を通らない場合のフォールバック |
| `waypointPathIndices.test.ts` | `resolveWaypointPathIndices`（CreateView.tsx:40 → 先に `src/utils/` へ移動してから）: 同一地点2回で indexOf 先頭固定にならないこと |

### 受入条件
- `npm run test` 緑。CI 導入時は `tsc → vitest run → vite build` の順で実行（GitHub Actions は任意・別タスク）。

---

# B. 追加すべき機能

## B-1.【最優先】データのエクスポート / インポート（バックアップ）

### 価値
全データが単一 IndexedDB にあり、サイトデータ削除・iOS の7日退避・IDB 破損で**推理ノートが全損**する。ユーザーに自衛手段がない。smartphone.md E2 とも共通。

### 設計
ファイル形式 v1（`manosaba-backup-YYYYMMDD-HHmm.json`）:
```ts
interface BackupFileV1 {
    app: 'manosaba-info-organizer';
    formatVersion: 1;
    exportedAt: string;              // ISO8601
    storageKey: 'mystery-map-storage';
    payload: string;                 // IDB に入っている JSON 文字列そのまま（StorageValue）
}
```
19.md P2（asset分離）実装後は `formatVersion: 2` で `assets: Record<string, string /* base64 */>` を追加し、import 側は 1/2 両対応にする。

新規 `src/services/backup.ts`（アダプタパターン厳守・UIからは本モジュールのみ参照）:
```ts
export const exportBackup = async (): Promise<void> => {
    await flushPersistNow();                     // A-1 で export した flush
    const payload = await idbGetString('mystery-map-storage');
    if (!payload) throw new Error('保存データがありません');
    const file: BackupFileV1 = { app: 'manosaba-info-organizer', formatVersion: 1,
        exportedAt: new Date().toISOString(), storageKey: 'mystery-map-storage', payload };
    await saveTextFile(JSON.stringify(file), defaultFileName(), 'application/json');
};

export const importBackup = async (text: string): Promise<void> => {
    const parsed = JSON.parse(text) as Partial<BackupFileV1>;
    if (parsed.app !== 'manosaba-info-organizer' || typeof parsed.payload !== 'string')
        throw new Error('バックアップファイルの形式が不正です');
    JSON.parse(parsed.payload);                  // payload 自体の破損検査
    await idbPutString('mystery-map-storage', parsed.payload);
    location.reload();                           // rehydrate 経路（migrate含む）に乗せるのが最も安全
};

// --- プラットフォーム分岐（isTauri() は services/platform.ts の既存関数） ---
const saveTextFile = async (content: string, filename: string, mime: string) => {
    if (isTauri()) { /* plugin-dialog save() → plugin-fs writeTextFile */ }
    else { /* Blob + <a download> クリック */ }
};
export const pickTextFile = async (): Promise<string | null> => {
    if (isTauri()) { /* plugin-dialog open() → plugin-fs readTextFile */ }
    else { /* <input type=file accept=".json"> を動的生成して FileReader */ }
};
```

Tauri 側セットアップ（現状 `src-tauri/Cargo.toml` には `tauri-plugin-opener` のみ。**着手時に公式ドキュメント（v2.tauri.app の dialog / fs プラグインページ）を Fetch で確認**し、権限識別子を最新仕様に合わせること）:
1. `npm i @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`
2. `src-tauri/Cargo.toml` の `[dependencies]` に `tauri-plugin-dialog = "2"` / `tauri-plugin-fs = "2"`
3. `src-tauri/src/lib.rs` の Builder に `.plugin(tauri_plugin_dialog::init())` `.plugin(tauri_plugin_fs::init())`
4. `src-tauri/capabilities/default.json` の `permissions` に `"dialog:default"` と fs の読み書き許可を追加（dialog で取得したパスへの読み書きが通る組み合わせを公式で確認。不足時は `fs:allow-write-text-file` + scope 指定）

UI: `HelpDrawer` に「バックアップ」セクションを追加（エクスポート/インポートの `Button` 2つ。インポートは `showConfirm('現在のデータを上書きします。よろしいですか？')` を必ず挟む）。結果は toast（ui.md P1 未実装の間は `showAlert`）。

### 受入条件
- Web/Tauri 両方でエクスポート→（データを消して）→インポートの往復でノート・経路・プリセット・チュートリアル既読が完全復元。
- 壊れた JSON / 他アプリの JSON を食わせるとエラーメッセージで拒否し、既存データが無傷。

## B-2. Redo（やり直し）対応

### 設計
noteSlice に追加（persist 除外に `noteRedoStack` を追加）:
```ts
noteRedoStack: NoteData[];
undoNote: () => void;   // 変更: pop した先で現 notes を redoStack へ push
redoNote: () => void;   // redoStack から pop → 現 notes を noteHistory へ push → notes を差し替え
saveNoteHistory: () => void; // 変更: 新規編集時に noteRedoStack を [] にクリア
```
実装スケッチ:
```ts
undoNote: () => {
    const { noteHistory, notes, noteRedoStack } = get();
    if (noteHistory.length === 0) return;
    set({
        notes: noteHistory[noteHistory.length - 1],
        noteHistory: noteHistory.slice(0, -1),
        noteRedoStack: [...noteRedoStack, notes].slice(-20),
    });
},
redoNote: () => {
    const { noteHistory, notes, noteRedoStack } = get();
    if (noteRedoStack.length === 0) return;
    set({
        notes: noteRedoStack[noteRedoStack.length - 1],
        noteRedoStack: noteRedoStack.slice(0, -1),
        noteHistory: [...noteHistory, notes].slice(-20),
    });
},
```
キーボード: `useNoteKeyboard`（A-4）に `Ctrl+Y` と `Ctrl+Shift+Z` を追加（IME ガード・`e.target !== document.body` ガードは既存 Ctrl+Z と同一条件）。redo 実行時も `setSelectedIds([])`。
マップグラフ（history/undo）側の redo は同型だが優先度低（フェーズ2）。

### 受入条件
- 配置→undo→redo で完全復元。undo→**新規編集**→redo が「何もしない」（redoStack クリア済み）。deep な構造共有により 20 履歴でもメモリ増が僅少であること（DevTools Memory で確認）。

## B-3. 保存状態インジケータ

### 設計
A-1 の `setPersistPhaseListener` を購読する軽量 store:
```ts
// src/services/persistStatus.ts
interface PersistStatusState { status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; }
export const usePersistStatus = create<PersistStatusState>(() => ({ status: 'idle' }));
setPersistPhaseListener(p => usePersistStatus.setState({ status: p === 'saved' ? 'saved' : p }));
```
表示: ui.md P2 の ContextBar が本命。**それまでの暫定**として `Sidebar` のロゴ下に小さく `✓ 保存済み / … 保存中 / ⚠ 保存失敗` を表示（error 時はクリックで B-1 のエクスポートを促す `showConfirm`）。'saved' 表示は 2 秒後に 'idle'（非表示）へ戻すタイマーを UI 側に持つ。

### 受入条件
- 編集→500ms 後に「保存中→保存済み」と遷移。DevTools で IDB を壊す（application タブから objectStore 削除）と ⚠ になりエクスポート導線が出る。

## B-4. キャンバスの PNG 書き出し

### 設計
事件ノート（preset）は論理サイズ 1200×800 固定なので、**表示中 Stage からのズーム非依存書き出し**が可能:
```ts
// src/utils/canvasExport.ts
export const exportStagePng = (stage: Konva.Stage, effScale: number): string =>
    stage.toDataURL({
        x: 0, y: 0,
        width: NOTE_CANVAS.W * effScale, height: NOTE_CANVAS.H * effScale,
        pixelRatio: 2 / effScale,        // 常に 2400×1600px で出力
        mimeType: 'image/png',
    });
```
- `CanvasWorkspace` は `stageRefs.current[currentCanvasIndex]` と `effScale` を既に持っている（NoteView.tsx:403, 1595）ので、Tools に「📷 PNG 書き出し」ボタンを追加して上記を呼ぶ。
- 全体ノート/キャラ/メモ（fill モード）は論理範囲が可変のため、`stage.toDataURL({ pixelRatio: 2 })`（見えている範囲）で出力し、ボタンの title に「表示範囲を書き出します」と明記。
- 保存は B-1 の `saveTextFile` を汎用化した `saveBinaryFile(dataUrl → Blob, 'manosaba-note-….png')`（Web: `<a download>` / Tauri: dialog+fs）。
- 書き出し直前に `trRefs`（Transformer）と選択インジケータを一時的に `visible(false)` → 出力 → 戻す（選択枠が写り込まないように）。

### 受入条件
- ズーム状態や 4ペイン表示に関わらず、事件ノートの出力が常に 2400×1600 で全域を含む。選択枠・Transformer が写らない。Tauri/Web 両方で保存できる。

## B-5. sync 整合性チェッカー（保存前検証）

### 価値
sync 多用時の「ずれ」「開始まで長時間待つ」（06/20 #5, 06/21 #1 系）は、解決不能な制約が**黙って**フォールバック値に落ちるのが一因（`resolveStartTimes` は循環で 0、地点不通過で旧値に落ち、`computeAnchors` は時刻矛盾を「+1フレーム」に丸める — いずれも無警告）。保存時に人間へ見せる方が堅い。

### 設計
新規 `src/utils/syncValidation.ts`:
```ts
export interface SyncIssue {
    level: 'error' | 'warn';
    charId: string;
    message: string;   // 例: '開始条件が循環しています: A → B → A'
}
export const validatePresetSync = (
    data: Record<string, CharacterTimelineData>,
    nodes: MapNode[]
): SyncIssue[];
```
チェック内容（実装はすべて `animationUtils` の既存関数を再利用）:
1. **startRef 循環**（error）: startRef の参照グラフを DFS し、循環チェーンを文字列で報告（`resolveStartTimes` は 0 フォールバックするため現状無症状で壊れる）。
2. **参照切れ**（error）: `startRef.charId` が data に無い / `startRef.nodeId` の `occurrence` 回目の訪問が `getNodeVisitTimes` で得られない / `syncConstraints[].charIds` に存在しないキャラ / `waypointId`+`occurrence` が自分の path 上に無い。
3. **物理的に不可能な合流**（warn）: `computeAnchors` を組み、各アンカー区間の要求速度 `(cumDist差)/(time差)` が通常速度 `MOVEMENT_SPEED_PX_PER_SEC/TARGET_FPS` の **3倍超**なら「間に合わないため瞬間移動に見える」警告。時刻が単調増加クランプ（computeAnchors:244）に掛かった場合も同扱い。
4. **全体開始オフセット**（warn）: `resolveStartTimes` 後の最小開始時刻が 600 フレーム（20秒）超なら「再生開始からしばらく誰も動きません」警告（06/20 #5 の症状の予防線）。

組み込み: `CreateView.handleSavePath`（A-4 後は `useRouteEditor`）で保存直前に実行。error があれば `showConfirm('警告を無視して保存しますか？\n' + messages)`、warn は保存は通しつつ `WaypointPanel` 下部に黄色リスト表示（`SyncIssue[]` を state に持たせて描画）。

### 受入条件
- A-9 のテストで各チェックの陽性/陰性ケースを固定（循環・参照切れ・過速・大オフセットの4系統×2）。
- 正常な経路保存のフローに追加の操作が増えない（issue ゼロなら無言で保存）。

## B-6. 遭遇（同室・すれ違い）自動検出タイムライン

### 価値
「誰と誰がいつ同じ場所にいたか」は本作の推理の核。現在は再生を目視するしかない。自動抽出は本アプリ独自の強みになる。

### 設計
新規 `src/utils/encounterDetection.ts`:
```ts
export interface Encounter {
    nodeId: string; nodeName: string;
    charIds: string[];               // 2人以上
    start: number; end: number;      // 絶対フレーム（重なり区間）
}
export const detectEncounters = (
    data: Record<string, CharacterTimelineData>,
    nodes: MapNode[],
    resolvedStarts: Record<string, number>
): Encounter[];
```
アルゴリズム（すべて既存関数の組み合わせ）:
1. 各キャラ: `getNodeVisitTimes` を path 上の**全ユニークノード**に対して取り、`{nodeId, arrival, departure}[]` の滞在区間リストを作る（startTime は resolvedStarts で差し替え）。waypoint の stayTime は path の重複ノードとして表現済みなので追加処理不要。
2. ノードごとに区間を集め、区間の重なり（`max(startA,startB) < min(endA,endB)`）をスイープラインで検出。3人以上の同時滞在は1件の Encounter に統合。
3. `type: 'room'` のノードのみ対象（pass/stair の一瞬の交差はノイズになるため v1 では除外。「すれ違い」検出は v2 として同一エッジ逆方向の時間窓判定を追加）。
4. `useMemo`（依存: activePreset.data, nodes）でプリセット変更時のみ再計算。

UI 統合（`AnimationTimeline.tsx`）:
- シークバー（:132-139 の `input[type=range]`）を `position:relative` の wrapper で包み、各 Encounter の `start/maxDuration` 位置に絶対配置の 6px マーカー（`--gold`）を重ねる。クリックで `setCurrentTime(start)`。title に「湖方面: 桜庭エマ・二階堂ヒロ (00:32〜00:41)」（`formatCharName` は A-8-5 で共通化済み）。
- 操作盤に「遭遇ログ」トグルボタンを追加し、リスト（時刻順・クリックでシーク）をフローティング表示。
- 制約の明記: deadIcons は「そのプリセットで死亡」の静的フラグで死亡時刻の概念がないため、死亡キャラも通常どおり検出される（v1 の仕様として UI に注記）。

### 受入条件
- A-9 に単体テスト（同室重なり検出 / 重なりなし / 3人統合 / room 限定）。
- 手動確認: 2キャラを同地点に sync させると、その地点・時間帯の Encounter がマーカーとログに現れ、クリックでその瞬間へシークする。

## B-7. PWA 化（ホーム画面インストール + オフライン起動）

### 設計
1. `npm i -D vite-plugin-pwa`（**Vite 7 対応バージョンを公式で確認**してから導入）。
2. `vite.config.ts`:
   ```ts
   import { VitePWA } from 'vite-plugin-pwa';
   // Tauri ビルド時は SW 不要のため除外（tauri build 中は TAURI_ENV_PLATFORM が立つ）
   plugins: [react(), ...(process.env.TAURI_ENV_PLATFORM ? [] : [VitePWA({
       registerType: 'autoUpdate',
       includeAssets: ['logo.png', 'icon/*.png', 'character/*.png', 'maps/*.png'],
       manifest: {
           name: '魔法少女の魔女裁判 推理ノート', short_name: 'まのさばノート',
           display: 'standalone', background_color: '#1e1e1e', theme_color: '#1e1e1e',
           icons: [/* A-6 で作った 192/512px */],
       },
   })])],
   ```
3. データは IndexedDB なので SW のキャッシュ対象は静的アセットのみ。アップデート時の挙動は autoUpdate（リロードで新版）。
4. **前提**: smartphone.md E1（persistCoordinator: BroadcastChannel による多重インスタンス検知）を先に実装すること。PWA+ブラウザタブの並走で書き込み競合が起きやすくなるため。

### 受入条件
- Lighthouse の PWA 監査で installable。機内モードで再訪してもアプリが起動しノートが読める。`npm run tauri dev`/`tauri build` に SW が混入しない。

---

# C. 推奨実施順序（4ドキュメント横断ロードマップ）

1. **A-1**（persist改修）+ A-8-4 — すべての体感を底上げ（19.md 共通原因A P1 と同一）
2. 19.md #1/#9/#3/#8（チュートリアル復旧・FLOOR再削除・小修正）
3. **A-6**（ファイル整理）→ **A-5**（any撲滅・旧データ正規化）→ **A-9**（テスト基盤: sync回帰テスト）
4. **B-1**（バックアップ）+ **B-3**（保存インジケータ）→ 19.md P2（アセット分離、backup を v2 に更新）
5. **A-2 → A-3 → A-4**（store分割 → selectedIcons移管 → 巨大ファイル分割）← ui/smartphone の前提
6. ui.md P0→P4（デザイン刷新）と 19.md #2（hands-onチュートリアル）
7. smartphone.md M0→M4 + **B-7**（PWA）
8. **B-2 / B-4 / B-5 / B-6** は 4〜7 の合間に独立実施可（B-5/B-6 は A-5 のデータ正規化後が楽）

各ステップは独立コミット。冒頭の検証コマンド4点の通過を完了条件とする。外部ライブラリ（vitest / vite-plugin-pwa / Tauri プラグイン）は**導入直前に公式ドキュメントを Fetch で確認**すること（CLAUDE.md 規約）。
