// 旧データ(base64 data URL)を Blob(asset://)へ移行し、未参照アセットをGCする（P2）。
// 起動時に1回だけ実行する。完了フラグは持たず、data: が無くなれば自然に何もしない自己修復設計。
import { useAppStore } from '../store';
import type { NoteData, CanvasState } from '../store';
import { putAsset, deleteAsset, listAssetKeys, isAssetKey } from './assetStore';

const isDataUrl = (s?: string): s is string => !!s && s.startsWith('data:');

const dataUrlToKey = async (dataUrl: string): Promise<string> => {
    const blob = await (await fetch(dataUrl)).blob();
    return putAsset(blob);
};

// data: を含む CanvasState を asset:// へ置換した新 CanvasState を返す（変化なければ同一参照）。
const migrateCanvas = async (canvas: CanvasState | undefined): Promise<{ canvas: CanvasState | undefined; changed: boolean }> => {
    if (!canvas) return { canvas, changed: false };
    let changed = false;

    const assets = await Promise.all(canvas.assets.map(async (a) => {
        if (isDataUrl(a)) { changed = true; return dataUrlToKey(a); }
        return a;
    }));

    const objects = await Promise.all(canvas.objects.map(async (o) => {
        if (isDataUrl(o.content)) { changed = true; return { ...o, content: await dataUrlToKey(o.content) }; }
        return o;
    }));

    return changed ? { canvas: { assets, objects }, changed } : { canvas, changed: false };
};

/** notes 内の全 data URL を Blob(asset://) へ移行する。変換があれば1回だけ store を差し替える。 */
export const migrateDataUrlAssets = async (): Promise<void> => {
    const notes = useAppStore.getState().notes;
    let anyChanged = false;
    const next: NoteData = { ...notes };

    const ov = await migrateCanvas(notes.overviewCanvas);
    if (ov.changed) { next.overviewCanvas = ov.canvas; anyChanged = true; }

    if (notes.presets) {
        const presets: Record<string, CanvasState> = { ...notes.presets };
        for (const [id, c] of Object.entries(notes.presets)) {
            const r = await migrateCanvas(c);
            if (r.changed && r.canvas) { presets[id] = r.canvas; anyChanged = true; }
        }
        if (anyChanged) next.presets = presets;
    }

    if (notes.characters) {
        const characters: Record<string, CanvasState> = { ...notes.characters };
        let charChanged = false;
        for (const [id, c] of Object.entries(notes.characters)) {
            const r = await migrateCanvas(c);
            if (r.changed && r.canvas) { characters[id] = r.canvas; charChanged = true; }
        }
        if (charChanged) { next.characters = characters; anyChanged = true; }
    }

    if (notes.miscPages?.length) {
        let miscChanged = false;
        const miscPages = await Promise.all(notes.miscPages.map(async (p) => {
            const r = await migrateCanvas(p.canvas);
            if (r.changed) { miscChanged = true; return { ...p, canvas: r.canvas }; }
            return p;
        }));
        if (miscChanged) { next.miscPages = miscPages; anyChanged = true; }
    }

    if (anyChanged) useAppStore.getState().replaceNotes(next);
};

// notes から参照中の asset:// キーを集める。
const collectReferencedKeys = (notes: NoteData): Set<string> => {
    const set = new Set<string>();
    const scan = (canvas?: CanvasState) => {
        if (!canvas) return;
        canvas.assets.forEach(a => { if (isAssetKey(a)) set.add(a); });
        canvas.objects.forEach(o => { if (isAssetKey(o.content)) set.add(o.content!); });
    };
    scan(notes.overviewCanvas);
    Object.values(notes.presets || {}).forEach(scan);
    Object.values(notes.characters || {}).forEach(scan);
    (notes.miscPages || []).forEach(p => scan(p.canvas));
    return set;
};

/** どこからも参照されていないアセットを削除する。undo との競合を避けるため「起動時のみ」呼ぶこと
 *  （noteHistory/noteRedoStack は非永続なので起動直後は空＝過去undoで復活する画像を消す心配がない）。 */
export const sweepOrphanAssets = async (): Promise<void> => {
    const referenced = collectReferencedKeys(useAppStore.getState().notes);
    const stored = await listAssetKeys();
    for (const key of stored) {
        if (!referenced.has(key)) {
            try { await deleteAsset(key); } catch { /* 失敗は次回起動で再試行 */ }
        }
    }
};
