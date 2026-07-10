# 自発的リファクタリング・機能改善・UI配置最適化 提案（第2版・実装指示書）

最終更新: 2026-07-07（詳細化 v2 / コード未変更）
第1版 `refactoring.md` の追加機能 B-1〜B-7 は全実装済み。本書は現行コードベース（`work/perf-image-ui-foundations`）への **R1-R9（リファクタ）/ F1-F7（機能）/ U1-U5（UI配置）** の実装指示書。
**正準（canonical）コードの所在**: ダイアログキュー=revise №7 / バンドル分割=revise №18 / presetTiming・usePresetEvents・EventList=20.md #9 / appBanner=revise №5。本書ではそれらを参照し二重定義しない。

検証コマンド: `npx tsc -p tsconfig.json --noEmit` →（R7後 `npm run lint`）→ `npm run build` → `npx vitest run` → preview 実機（1280px/375px）。

---

# A. リファクタリング

## R1. store の slice 分割 + UI状態の store 移管（最優先）

### 現状
`store.ts` 599行・約65メンバー。UI状態が散在: `selectedIcons`(App)、`actualCharIndex`(NoteView→20.md #7 で store 化)、`clipboard`(CanvasWorkspace→revise №10)、`sheetOpen`(MobileShell)。

### 目標構造
`src/store.ts` を削除し `src/store/` へ（**`from '../store'`/`from './store'` の既存 import は `src/store/index.ts` が受けるため呼び出し側は無変更**）:
```
src/store/
  index.ts           … create+persist+slice合成、既存 export の再export
  types.ts           … 全型 + 定数（ICON_FILES/PRISON_POSITIONS もここか index に）
  persistStorage.ts  … 既存 src/persistStorage.ts を移動（import パス修正: './services/…'→'../services/…'）
  uiSlice.ts / mapSlice.ts / presetSlice.ts / noteSlice.ts
```

### 型付け（zustand v5 slices パターン）
```ts
// types.ts（既存の全 interface/type を移動し export。加えて:）
export type AppState = UiSlice & MapSlice & PresetSlice & NoteSlice;
export type SliceCreator<T> = StateCreator<AppState, [['zustand/persist', unknown]], [], T>;
```
各 slice ファイル:
```ts
// uiSlice.ts の骨格
export interface UiSlice { /* 下表のメンバー宣言 */ }
export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({ /* 実装を store.ts から移動 */ });
```
```ts
// index.ts の合成
export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createUiSlice(...a), ...createMapSlice(...a),
      ...createPresetSlice(...a), ...createNoteSlice(...a),
    }),
    { name: 'mystery-map-storage', storage: idbPersist, partialize, onRehydrateStorage }  // 既存を移動
  )
);
export { flushPersistNow } from …;  // idbPersist.flushNow
export * from './types';
export { usePlaybackStore } from './playback';   // 既存 PlaybackState を store/playback.ts へ
```

### メンバー割り当て表
| slice | state | actions |
|---|---|---|
| ui | dialog / mode / activeNoteTab / isGraphEditMode / isSkullMode / tutorialSeen / sidebarWidth / contextPanelCollapsed / activeFloor / _hasHydrated / **selectedIcons** / **noteCharIndex** / **noteClipboard** / **eventFilterChar** / **mobileSheetOpen** | showDialog系4 / setActiveFloor / setMode / enterMode / setActiveNoteTab / setGraphEditMode / setSkullMode / setTutorialSeen / setSidebarWidth / setContextPanelCollapsed / setHasHydrated / **selectIcon・clearIconSelection** / setNoteCharIndex / setNoteClipboard / setEventFilterChar / setMobileSheetOpen |
| map | nodes / edges / history | undo / saveHistory / addNode / updateNode / removeNode / removeEdge / addEdge |
| preset | presets / activePresetId | addPreset / setActivePresetId / updatePresetName / updatePresetNote / deletePreset / saveCharacterAnimation / deleteCharacterAnimation / saveBatchCharacterAnimations / updateTimelineItem / toggleDeadIcon / addPresetEvent / removePresetEvent(20.md #8) |
| note | notes / noteHistory / noteRedoStack | saveNoteHistory / undoNote / redoNote / replaceNotes / updateOverview / note object 系9 / addMiscPage / updateMiscPage / renameMiscPage / deleteMiscPage |

補足:
- `updateCanvasState`/`computeDuration` は noteSlice / presetSlice のファイル内ローカルへ（computeDuration は export 維持: index で再export。presetSlice のアクションは `get().nodes` でクロススライス参照＝単一ストアなので可）。
- `dialogResolver`+キュー（revise №7）は uiSlice のモジュールスコープへ。
- `constants.ts` が `import type { MapNode } from './store'` している → types.ts へ移せば `./store` 解決のままで循環なし。

### 新規移管メンバーの実装
```ts
// uiSlice: selectedIcons（persist 除外）
selectedIcons: [],
clearIconSelection: () => set({ selectedIcons: [] }),
selectIcon: async (icon, multi) => {
    const { selectedIcons } = get();
    if (multi) {
        set({ selectedIcons: selectedIcons.includes(icon)
            ? selectedIcons.filter(i => i !== icon) : [...selectedIcons, icon] });
        return;
    }
    if (selectedIcons.length === 1 && selectedIcons[0] === icon) return;
    if (!(await runNavigationGuard())) return;      // services/navigationGuard は store 非依存＝循環なし
    set({ selectedIcons: [icon] });
},
```
partialize 除外リスト（index.ts に集約）:
```ts
const EXCLUDE = new Set(['noteHistory','noteRedoStack','_hasHydrated','dialog',
    'selectedIcons','noteClipboard','eventFilterChar','mobileSheetOpen']);
partialize: (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !EXCLUDE.has(k))) as AppState,
```
（`noteCharIndex` は persist する＝20.md #7 と同じ）

### コンポーネント再配線（selectedIcons 移管分）
- `App.tsx`: `selectedIcons` state / `handleIconSelect` / `clearSelection` を削除。props 渡し（ContextPanel/ContextBar/CreateView/MobileShell）を撤去。
- `ContextPanel` / `ContextBar` / `MobileContextSheet`: `useAppStore(s => s.selectedIcons)` と `selectIcon` を直接購読（`onIconSelect(icon, e.shiftKey)` → `void selectIcon(icon, e.shiftKey)`）。
- `CreateView`: props `selectedIcons`/`onIconSelect`/`onClearSelection` を削除し store 購読へ（`onClearSelection()` → `clearIconSelection()`。`handleCharSelect` 内の `onIconSelect(icon,false)` → `void selectIcon(icon,false)`）。`onFloorChange` は残す。
- `MobileShell`: `sheetOpen` を `mobileSheetOpen`/`setMobileSheetOpen` に置換（20.md #7 の uiBus 暫定は不要になる→『変更』ボタンは `setMobileSheetOpen(true)` 直呼び）。

### 手順（1コミット=1段・各段で tsc+テスト）
1. `src/store/types.ts` 新設（型・定数移動）→ store.ts は re-export で維持
2. persistStorage 移動 + `src/store/index.ts` 骨格（既存 store.ts の中身をそのまま index に）→ `src/store.ts` 削除
3. uiSlice 切り出し → 4) mapSlice → 5) presetSlice → 6) noteSlice
7. selectedIcons/mobileSheetOpen 移管 + コンポーネント再配線
### 受入
- 全呼び出し側 import 無変更で tsc/build/テスト green。リロードで既存データ復元（persist キー・形式不変）。
- shift複数選択・死亡キャラ不可・未保存ガード・どくろ切替の挙動が完全一致。
- 各 slice ファイル ≤ 250行。

## R2. 巨大コンポーネント分割（NoteView 2,571行 / CreateView 1,139行）

### 移動マップ（シンボル単位・ロジック変更禁止）
| 移動元シンボル（grep） | 移動先 |
|---|---|
| `applyChaikin` / `CHARACTER_PORTRAITS` / `HANDWRITING_FONT` | `src/components/note/noteConstants.ts` |
| `AssetImg` / `URLImage` / `EditableText` / `ShapeObject` | `src/components/note/NoteObjectComponents.tsx`（R8 の型付けと同時） |
| `getImageSizeFromUrl` / `canvasToBlob` / `autocropTransparent` / `processFile` | `src/utils/imageUtils.ts` |
| `CanvasWorkspaceProps` / `CanvasWorkspace` | `src/components/note/CanvasWorkspace.tsx` |
| CanvasWorkspace 内の描画ブロック: compact ツールバー(`renderPortalUI`) / 画像ギャラリー(`showImageGallery && createPortal`) / 右クリックメニュー(`shapeContextMenu &&`) / Tools サイドバー(`className="char-sidebar"` の中身) | 同ディレクトリの `CompactToolbar.tsx` / `ImageGalleryWindow.tsx` / `ShapeContextMenu.tsx` / `NoteToolsSidebar.tsx`（props は使用ハンドラをそのまま受け渡し） |
| ロジック塊 → hooks: クリップボード3関数 / handleKeyDown / editingText 一式(finishTextEditing 含む) / saveHistoryOnceThenSkip+commitThrottled | `src/hooks/useNoteClipboard.ts` / `useNoteKeyboard.ts` / `useTextEditing.ts` / `useNoteHistoryBatch.ts` |
| CreateView: `FollowConfirmModal`（revise №2 修正と同時） | `src/components/create/FollowConfirmModal.tsx` |
| CreateView: waypoints/startRef/sync/save/edit/delete のハンドラ群 | `src/hooks/useRouteEditor.ts`（smartphone.md M3 でも要求済み） |
### 手順
上表の上から順に1コミット=1移動。`NotesPanel` の `import { CanvasWorkspace } from './NoteView'` は移行中 `NoteView.tsx` に `export { CanvasWorkspace } from './note/CanvasWorkspace';` を置いて維持し、最後に直 import へ更新。
### 受入
各ファイル400行以下（NoteView.tsx は ~200行）。手動チェックリスト: 配置/選択/ドラッグ/変形/グループ/コピペ/undo-redo/テキスト編集(Enter/Shift+Enter/Escape/IME)/4ペイン跨ぎ移動/PNG書出/画像アップロード。

## R3. インライン style → SCSS（CLAUDE.md 規約準拠）

### 現状
規約は「SCSS(CSS Modules または BEM)」だが実装の9割超がインライン style。疑似クラスが書けず `onMouseEnter` で hover を代替している箇所もある（EventList/MergeModal 等）。
### 方針（全面書き換えはしない・運用ルール）
1. `src/styles/components/` を新設。1コンポーネント=1ファイル、BEM。`App.scss` 末尾に `@use 'components/waypoint-panel';` 形式で集約。
2. **ルール**: 色/余白/z-index/フォントは必ず `var(--…)` トークン。動的値（計算 width、ドラッグ座標）のみ style 属性に残す。新規コンポーネントはインライン禁止。
3. 優先順: ① WaypointPanel（20.md #5 改修と同時）② DialogHost+モーダル群 ③ NoteToolsSidebar（R2 と同時）④ mobile/*。
### BEM 例（`_waypoint-panel.scss` の骨格）
```scss
.waypoint-panel {
  position: absolute; bottom: 30px; right: 30px; /* … */
  &--bottom { left: 8px; right: 8px; bottom: 8px; max-width: none; }
  &__header { display: flex; align-items: center; gap: 8px; }
  &__row { display: flex; align-items: center; gap: 5px; }
  &__row-input { flex: 1; background: var(--surface-3); /* … */
    &.is-target { border-color: var(--focus); box-shadow: 0 0 0 2px rgba(102,179,255,.25); } }
  &__save { background: var(--accent); &:disabled { background: var(--surface-4); } }
}
```
### 受入
対象コンポーネントの静的スタイルが SCSS 化され、目視回帰なし（改修前後スクショ比較）。`grep -c "style={{" 対象.tsx` が概ね動的値のみに減る。

## R4. タイミング/イベント算出の一元化
**正準は 20.md #9-1/#9-3/#9-5。** 本項は独立作業しない（revise №14 と同一）。R4 として追加するのは `presetTiming.test.ts`（20.md #9-1 記載の3ケース）のみ。

## R5. ダイアログ基盤の拡張（キュー + テキスト入力）

### 前提
キュー化は revise №7（正準）。本項は **showPrompt** の追加。
### 実装
1. `store.ts`（R1 後は uiSlice）:
```ts
// DialogRequest に追加
export interface DialogRequest { title?: string; message: string; buttons: DialogButton[];
    input?: { initial: string; placeholder?: string }; }
// AppState に追加
showPrompt: (message: string, initial?: string, title?: string) => Promise<string | null>;
// 実装（dialogInputValue はモジュールスコープ let で保持し、closeDialog 側で参照）
let dialogInputValue = '';
export const setDialogInputValue = (v: string) => { dialogInputValue = v; };
showPrompt: (message, initial = '', title) => {
    dialogInputValue = initial;
    return get().showDialog({
        message, title, input: { initial },
        buttons: [{ label: 'キャンセル', value: '__cancel' }, { label: 'OK', value: '__ok', variant: 'primary' }],
    }).then(v => (v === '__ok' ? dialogInputValue : null));
},
```
2. `DialogHost.tsx`: `dialog.input` があれば message の下に描画:
```tsx
{dialog.input && (
    <input autoFocus defaultValue={dialog.input.initial} placeholder={dialog.input.placeholder}
        onChange={e => setDialogInputValue(e.target.value)}
        onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) e.stopPropagation(); }}  // IME中のEnterを全体ハンドラに渡さない
        style={{ width: '100%', boxSizing: 'border-box', margin: '0 0 16px', padding: '8px 10px',
                 background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
                 color: 'var(--text-primary)', borderRadius: 4 }} />
)}
```
（既存の Enter=primary はそのまま「OK」を発火。revise №17 適用後も primary なので動く。）
3. 置換候補（任意・段階的）: misc 改名（NoteView）と PresetSelector の改名を `showPrompt('新しい名前', current)` に置換 → `renamingPageId`/`renameInputValue`/`isEditing`/`editName` の state を削減。
### 受入
`showPrompt` で改名でき、IME 変換確定の Enter で誤確定しない。キャンセル/ESC は null。

## R6. バンドル分割 + ビュー遅延ロード
**正準は revise №18。** R6 追加分: PWA precache が分割後も全チャンクを含む（合計サイズ不変）ことを `npm run build` の `precache N entries` 出力で確認するのみ。

## R7. Lint 運用の確立

### 実装
1. パッケージ: `npm i -D typescript-eslint eslint-plugin-react-hooks`（eslint 9 は導入済み。**最新の flat-config 対応状況を公式で確認**して導入すること）。
2. `eslint.config.js`（新規・flat config）:
```js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    { ignores: ['dist', 'src-tauri', 'docs'] },
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',        // revise №2 型を機械検出
            'react-hooks/exhaustive-deps': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn', // R8 完了後に 'error' へ昇格
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
);
```
3. `package.json` scripts: `"lint": "eslint src"`。検証手順列に組み込む（tsc→lint→build→test）。
4. 初回実行で出る既存 warn は Issue 化して段階解消（一括修正しない）。
### 受入
`npm run lint` が完走。`rules-of-hooks` エラー0件（revise №2 修正後）。

## R8. 残存 `any` の型付け（R2 と同時）

`NoteObjectComponents.tsx` 切り出し時に適用:
```ts
import Konva from 'konva';
import { NoteObject } from '../../store';

export interface NoteObjectComponentProps {
    obj: NoteObject;                    // imageObj/textObj/shapeObj を obj に統一（呼び出し側は {...props, obj} を渡す）
    isDrawingMode: boolean;
    onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
    onChange: (attrs: Partial<NoteObject>) => void;
    onToggleEdit?: () => void;
    onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
    onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
}
```
- 呼び出し側（CanvasWorkspace の `const props = { imageObj: obj, textObj: obj, shapeObj: obj, … }`）は `obj` 1本に統一。
- `PlacementMode` の `data?: any` → `data?: string`（画像srcのみ）。`startPlacement(type, data?: string)`。
- `handleObjectDragEnd(e: any…)` / `onDragMove:(e: any)` 等 → `Konva.KonvaEventObject<DragEvent>`。
- 完了後 `grep -rn ": any" src/ | grep -v __tests__` 0件 → R7 の `no-explicit-any` を error へ。

## R9. テスト拡充（store・時刻系）

### 前提知識（store を vitest(node) で使う）
- `persistStorage` は node に indexedDB が無くても安全（getItem は catch→null、setItem の書込は失敗を握る）。
- note系アクションは `_hasHydrated` ガードがあるため、各テストの beforeEach で:
```ts
beforeEach(() => {
    useAppStore.setState({ /* notes/noteHistory/noteRedoStack を初期値に */ });
    useAppStore.getState().setHasHydrated(true);
});
```
### 追加テスト
1. `src/store/__tests__/noteHistory.test.ts`: addNoteObject→undo→redo 復元 / undo→新規編集→redo 空 / 履歴20件上限。
2. `src/store/__tests__/presetSlice.test.ts`: deleteCharacterAnimation が syncConstraints・events（20.md #8 実装後）から参照キャラを清掃 / addPresetEvent・removePresetEvent。
3. `src/utils/__tests__/presetTiming.test.ts`（R4）。
目標 40件前後。
### 受入
`npm test` green。既存25件と合わせ ~40件。

---

# B. 追加機能

## F1. プリセット（Episode）の複製

### 実装（store.ts / R1 後は index.ts の複合アクション: presets と notes を同時更新）
```ts
duplicatePreset: (id: string) => set((state) => {
    const src = state.presets.find(p => p.id === id);
    if (!src) return state;
    const newId = `preset_${Date.now()}`;
    const copy: AnimationPreset = {
        ...structuredClone(src),      // data/deadIcons/events を深複製
        id: newId,
        name: `${src.name} (コピー)`,
    };
    const srcCanvas = state.notes.presets?.[id];
    return {
        presets: [...state.presets, copy],
        activePresetId: newId,
        // 事件ノートの canvas はプリセットIDキーで別置きなので同時に複製する（重要）
        notes: srcCanvas
            ? { ...state.notes, presets: { ...state.notes.presets, [newId]: structuredClone(srcCanvas) } }
            : state.notes,
    };
}),
```
※ canvas の `objects[].content` が `asset://` キーでも **Blob は共有参照で問題ない**（削除GCは「どこからも参照されない」時のみ＝複製が参照を増やす方向なので安全）。
### UI（PresetSelector.tsx）
✎ ボタンの隣に:
```tsx
<button onClick={() => duplicatePreset(activePresetId)} title="複製"
    style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', padding: '4px', fontSize: '1rem' }}>⧉</button>
```
### 受入
複製後に元の経路/死亡/イベント/事件ノートを編集しても複製側が不変（逆も）。リロード後も両方残る。

## F2. キャラ行動ガントバー（タイムライン可視化）

### 設計
- 新規 `src/components/animate/TimelineGantt.tsx`。`AnimationTimeline` にトグルボタン「📊」を追加し、シークバー行の下に表示。
- データ導出（usePresetEvents と同様の useMemo。1キャラ=1行）:
```ts
const { offset, maxDuration } = usePresetEvents();   // 20.md #9
// 行データ: charId ごとに
//   span: anchors[0].time-offset … anchors[last].time-offset   （computeAnchors 使用）
//   stays: path の連続重複ブロック → getNodeVisitTimes を各ユニーク地点に → arrival!==departure の区間
```
- 描画は div 絶対配置（Konva 不要）: 行高22px、`left = t/maxDuration*100%`、帯=移動（半透明 `--focus`）、濃帯=滞在（`--gold` 40%）、イベントは 💬/⚇ の 8px ドット。現在時刻の縦線は `displayTime`（1秒間引き値で十分）。
- 行左端: アイコン18px+`formatCharName`。行クリック→`setEventFilterChar(charId)`（20.md #10 と連動）。帯クリック→`setCurrentTime(帯の開始)`。
- deadIcons のキャラは行ごと `opacity: .4` + 名前に線（`text-decoration: line-through`）。
### 受入
再生に同期して縦線が動く。帯/行クリックのジャンプ・フィルタ連動。15キャラ×再生中でも 60fps を維持（div 更新は縦線の transform のみ＝1要素）。

## F3. ノート全文検索

### 実装
1. `src/utils/noteSearch.ts`:
```ts
export interface NoteSearchHit { targetType: NoteTargetType; targetId: string; objId?: string; snippet: string; title: string; }
export const searchNotes = (notes: NoteData, miscTitles: {id:string;title:string}[], presets: AnimationPreset[], q: string): NoteSearchHit[] => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const hits: NoteSearchHit[] = [];
    const scanCanvas = (tt: NoteTargetType, tid: string, title: string, c?: CanvasState) =>
        c?.objects.forEach(o => {
            if (o.type === 'text' && o.text?.toLowerCase().includes(query))
                hits.push({ targetType: tt, targetId: tid, objId: o.id, title, snippet: o.text.slice(0, 60) });
        });
    scanCanvas('overview', 'overview', '全体ノート', notes.overviewCanvas);
    presets.forEach(p => scanCanvas('preset', p.id, `事件ノート: ${p.name}`, notes.presets?.[p.id]));
    Object.entries(notes.characters || {}).forEach(([cid, c]) => scanCanvas('character', cid, `キャラ: ${formatCharName(cid)}`, c));
    notes.miscPages.forEach(p => scanCanvas('misc', p.id, `メモ: ${p.title}`, p.canvas));
    return hits.slice(0, 50);
};
```
2. **ジャンプ**: `CanvasWorkspace` に `initialSelectId?: string` prop を追加し、`useEffect(() => { if (initialSelectId) setSelectedIds([initialSelectId]); }, [initialSelectId, displayTargetId])`。NoteView が store の `pendingNoteFocus: { targetType, targetId, objId } | null`（uiSlice・persist除外）を読み、該当タブ/ID をセットして initialSelectId を渡し、消費後 null に。
3. **UI**: `ContextBar` 右（SaveStatusIndicator の左）に 🔍 IconButton → 展開ポップオーバー（input+ヒットリスト）。行クリック: `setPendingNoteFocus(hit)` → `enterMode('note')`+`setActiveNoteTab(hit.targetType)`（character は `setNoteCharIndex(ICON_FILES.indexOf(hit.targetId))`、misc/preset は各 actual id の setter が NoteView ローカルのため pendingNoteFocus 経由で NoteView 側が同期する）。モバイルは AppBar に 🔍 を追加し同ポップオーバー。
### 受入
テキストを検索→クリックで該当ノートが開き対象オブジェクトが選択枠付きで表示・選択済み。0件時「見つかりません」。

## F4. 手動スナップショット（バージョン退避）

### 実装
1. `persistStorage.ts`: `DB_VERSION = 3`、`SNAPSHOT_STORE = 'snapshots'` を onupgradeneeded で作成。**revise №5（onblocked/onversionchange）を先に入れてから**バージョンを上げること。
2. `src/services/snapshots.ts`:
```ts
export interface SnapshotMeta { id: string; name: string; createdAt: string; }
export const saveSnapshot = async (name: string): Promise<void> => {
    await flushPersistNow();
    const payload = await idbGetString('mystery-map-storage');
    if (!payload) throw new Error('保存データがありません');
    const assets: Record<string, string> = {};             // backup.ts のアセット同梱と同じ手順
    for (const key of await listAssetKeys()) { const b = await getAssetBlob(key); if (b) assets[key] = await blobToDataUrl(b); }
    const snap = { id: `snap_${Date.now()}`, name, createdAt: new Date().toISOString(), payload, assets };
    await idbPut(SNAPSHOT_STORE, snap, snap.id);
    const all = await idbGetAll(SNAPSHOT_STORE);           // 5件超過は古い順に削除
    all.sort((a,b)=>a.createdAt<b.createdAt?-1:1).slice(0, Math.max(0, all.length-5))
       .forEach(s => void idbDelete(SNAPSHOT_STORE, s.id));
};
export const listSnapshots = async (): Promise<SnapshotMeta[]> => …;
export const restoreSnapshot = async (id: string): Promise<void> => {
    const s = await idbGet(SNAPSHOT_STORE, id);
    for (const [key, dataUrl] of Object.entries(s.assets || {})) await putAssetAtKey(key, await dataUrlToBlob(dataUrl));
    await idbPutString('mystery-map-storage', s.payload);
    location.reload();                                     // backup import と同じ復元経路
};
```
（`blobToDataUrl`/`dataUrlToBlob` は backup.ts から export して共用。`idbPut/idbGet/idbGetAll/idbDelete` の汎用ヘルパを persistStorage に追加。）
3. UI: HelpDrawer のバックアップ節に「スナップショット」小節 — 「＋現在の状態を保存」（名前は R5 `showPrompt`、未実装なら日時を既定名に）+一覧（名前/日時/復元/削除。復元は `showConfirm` 必須）。
### 受入
保存→ノート破壊→復元で完全復元（画像含む）。6件目保存で最古が消える。多タブ時は revise №20 の rev+1 を restore 側にも適用。

## F5. オブジェクト整列・グリッドスナップ

### 整列（複数選択時）
`NoteToolsSidebar`「選択中」節に4ボタン（左揃え/上揃え/横等間隔/縦等間隔）。対象は **x/y/width/height を持つ型のみ**（image/rect/circle/triangle/text。line系は points 基準のため v1 対象外＝選択に含まれていたら無視）:
```ts
const alignLeft = () => {
    const targets = selectedObjects.filter(o => o.width !== undefined || o.type === 'text');
    if (targets.length < 2) return;
    const minX = Math.min(...targets.map(o => o.x));
    updateNoteObjects(targetType, displayTargetId, targets.map(o => ({ id: o.id, attrs: { x: minX } })));  // 1履歴
};
// 横等間隔: x でソート → 両端固定・間を (span / (n-1)) 刻みに再配置
```
### スナップ
`CanvasWorkspace` に `const [snapOn, setSnapOn] = useState(false);` + Tools トグル「⌗」。適用点は2箇所:
- 配置時: `handleStageMouseDown` の `pos` 計算直後に `if (snapOn) { pos.x = Math.round(pos.x/24)*24; pos.y = Math.round(pos.y/24)*24; }`（24=方眼と同ピッチ）
- 移動確定: `handleObjectDragEnd` の `applyMove` 直前で rawX/rawY を同様に丸め
### 受入
3図形→横等間隔が1回のundoで戻る。スナップONで配置/移動が24px格子に吸着、OFFで従来。

## F6. テーマ切替（ダーク/セピア）
1. `_tokens.scss` 末尾:
```scss
:root[data-theme='sepia'] {
  --surface-0: #efe6d8; --surface-1: #f5ecdd; --surface-2: #eadfca; --surface-3: #e0d3b8; --surface-4: #d5c6a8;
  --border-default: #c2b299; --border-strong: #a08e6f;
  --text-primary: #3a3226; --text-secondary: #6b5f4b; --text-disabled: #a09173;
}
```
2. uiSlice: `theme: 'dark' | 'sepia'`（persist）+ setter。`App.tsx` に `useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);`
3. 切替UI: HelpDrawer に行を追加（`<select>` で十分）。**Konva 内の色・紙面(#ECD2B3)は対象外**（ユーザーデータ/紙メタファー維持）。
4. 注意: インライン style のフォールバック色（`var(--x, #hex)` の #hex）はダーク前提のため、セピア導入時に主要画面を目視確認し、コントラスト破綻箇所は R3 の SCSS 移行対象として優先する。
### 受入
切替で DOM UI の配色が変わりリロード後も維持。両テーマで文字コントラストが読める（主要5画面スクショ確認）。

## F7. SW 更新通知
**正準は revise №15。** 機能一覧としてここに記載のみ。

---

# C. UI 配置最適化

## U1. Create: 経路エディタの右ドック化（RouteDock）

### 問題と方針
WaypointPanel（フローティング）と SuggestionSidebar（右スライド）が同じ領域を奪い合うのが根本原因。**両者を1本の右ドックに統合**し、マップ領域と構造的に分離する。20.md #5（折りたたみ+bottom variant）は応急処置として先行し、本項が恒久解。

### 構造
```tsx
// CreateView の最上位を flex 横並びに（現状 grid ペイン領域 + 絶対配置たち → grid 領域 | RouteDock）
<div style={{ display: 'flex', height: '100%' }}>
  <div style={{ flex: 1, position: 'relative' }}>…4ペイン grid（既存）…</div>
  {!isMobile && (
    <RouteDock collapsed={dockCollapsed} onToggle={…}>   // 幅300px / 折りたたみ時24pxの縦タブ
      <RouteStepper …/>          // S→Via→G（WaypointPanel の地点リスト部を移設・ターゲット強調流用）
      <NodeCandidateList …/>     // SuggestionSidebar の一覧部を抽出（suggestionTargetIndex!==null で自動展開）
      <SyncSection …/>           // 開始条件+sync一覧（WaypointPanel から移設）
      <DockFooter …/>            // Save/Edit/Delete 固定（常時可視）
    </RouteDock>
  )}
</div>
```
- モバイルは 20.md #5 の bottom variant を継続（RouteDock はデスクトップ専用）。
- `SuggestionSidebar` は共通リスト部 `NodeCandidateList` を抽出後、スライド版を削除。
- 実装は R2 の `useRouteEditor` 抽出後が圧倒的に楽（ハンドラの受け渡しが1オブジェクトで済む）。
### 受入
経路作成の全操作（地点指定/経由地/滞在/sync/開始条件/保存）がドック内で完結し、マップに被る浮遊UIが0になる。ドック折りたたみでマップ全幅。

## U2. Animate: 下部ドック再生バー + イベントはパネルへ

- 再生操作盤（現: ドラッグ可能フローティング）を workspace 下端の**固定ドック**（高さ~140px: 1行目コントロール+シークバー）へ。`AnimateView` の `createPortal`+ドラッグ処理を削除し、4ペイン grid を `bottom: 140px` に。📌ボタンで従来のフローティングに切替できる互換モードを残す（`pinned: boolean` を uiSlice に persist）。
- `data-tour={TOUR_TARGETS.animatePlayback}` はドックへ移動（STEPS 変更不要）。
- イベント一覧は 20.md #10（ContextPanel）を正とし、ドック側は件数バッジ+📊ガント（F2）トグルのみ。
### 受入
マップに被る浮遊UIが0（ピン留め時を除く）。チュートリアルの animate-playback ハイライトがドックを指す。

## U3. Note: 選択コンテキストバー + 表示モードセグメント

- キャンバス上端に高さ36pxの `SelectionContextBar`（選択があるときだけ表示）: `N個選択 | 色 | 線幅 | レイヤー ◀▶ | グループ化/解除 | 削除`。ハンドラは NoteToolsSidebar と共有（R2 の分割でハンドラ群が hooks 化されている前提）。右クリックメニューは残す（同機能の別入口）。
- キャンバス右上の絵文字トグル2つ（4ペイン/編集）を **セグメント「1面 | 4面 | 編集」** に統合（`isGridMode`/`isGridEditMode` の3状態を1コントロールに）。
- モバイル(compact)では SelectionContextBar を headerBar の直下に折り返し表示。
### 受入
オブジェクト選択→バーで色変更/整列（F5）/削除が右クリックなしで完結。1面/4面/編集の切替が1箇所で見える。

## U4. モバイル配置規範（新規UIの判断表）

| 要素 | 位置 | 根拠 |
|---|---|---|
| ページ切替 | 下部タブバー（56px+safe-area） | 親指到達域（実装済） |
| 高頻度の文脈切替（フロア等） | コンテンツ上部のセグメント | 視認と1タップ（実装済） |
| 一覧からの選択（キャラ/ノート種別） | ☰ ボトムシート | 大きなタップ面（実装済+20.md #7） |
| 主アクション（保存/書出/決定） | パネル最下部の固定フッタ | 視線の終点・誤タップ防止 |
| 補助FAB（?ヘルプ） | 右下、タブバー+12px上 | 実装済規範の明文化 |
| 一時編集パネル | 下からのシート/バー（20.md #5） | 上・左右からの被せを禁止 |
| **禁止** | 左右スライドオーバー、hover依存、40px未満のタップ対象 | 07/04-4 の教訓・CLAUDE.md |

新規モバイルUIはこの表への適合をレビュー条件とする。

## U5. ContextBar のビュー別中央要素

- **Animate**: `<PresetSelector />`（Create と共通流用）+ ミニ再生表示 `▶ 00:12` （`usePlaybackStore` 購読、クリックで `setIsPlaying` トグル）。
- **Note**: 既存パンくず + F3 の 🔍。
- 実装は `ContextBar.tsx` の `{mode === 'create' && …}` に並べて `{mode === 'animate' && …}` を追加するだけ（構造変更なし）。
### 受入
Animate 上部でプリセット切替と再生トグルができ、既存の再生バーと状態が同期。

---

# D. 実施順ロードマップ

| 順 | 内容 | 依存 / 正準 |
|---|---|---|
| 1 | revise №1・№2（実バグ）+ №12・№13・№17（小修正） | なし |
| 2 | 20.md #9 基盤（presetTiming/usePresetEvents/EventList/timeFormat） | №1・№14 を吸収 |
| 3 | 20.md #8 → #9 → #10（イベント機能一式） | 2 |
| 4 | R1（slice 分割+state移管） | 20.md #7・revise №10 の前提 |
| 5 | 20.md #7 → #5 → #3 → #4 → #6 → #2 → #1（07/04 要望の残り） | 4（#7のみ） |
| 6 | revise №3〜№8・№20（非同期/整合性ガード群） | №5→F4 の前提 |
| 7 | R2+R8 → R3 伴走開始 → R7（lint） | 4 |
| 8 | R6/revise №18（分割）+ №15（SW通知）+ №19 | なし |
| 9 | F1 → F4 → F2 → F3 → F5 → F6 | F2=2、F4=№5、F3=一部R1 |
| 10 | U1 → U2 → U3（ライブ目視レビュー必須） | 7（R2） |

各段の完了条件: tsc →（R7後 lint）→ build → vitest → preview 実機（1280px/375px。遷移後の DOM 確認は 600ms 以上待つ）。
