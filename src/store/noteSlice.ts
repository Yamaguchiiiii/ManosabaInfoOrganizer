import { AppState, CanvasState, NoteData, NoteObject, NoteTargetType, SliceCreator } from './types';

const updateCanvasState = (
    state: AppState,
    targetType: NoteTargetType,
    targetId: string,
    updater: (canvas: CanvasState) => CanvasState
): Partial<AppState> => {
    const emptyCanvas: CanvasState = { objects: [], assets: [] };

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

    // 内容変化なし → state 参照を更新しない（無限ループ防止）
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

// 対象キャンバスを読むだけのセレクタ（存在チェック用・updateCanvasState と同じ解決規則）revise3 A-4
const readCanvas = (state: AppState, targetType: NoteTargetType, targetId: string): CanvasState | undefined =>
    targetType === 'overview' ? state.notes.overviewCanvas
    : targetType === 'preset' ? (state.notes.presets || {})[targetId]
    : targetType === 'character' ? (state.notes.characters || {})[targetId]
    : state.notes.miscPages?.find(p => p.id === targetId)?.canvas;

export interface NoteSlice {
    notes: NoteData;
    noteHistory: NoteData[];
    noteRedoStack: NoteData[]; // やり直し(Redo)用。undo で退避、新規編集でクリア。#refactoring B-2
    saveNoteHistory: () => void;
    undoNote: () => void;
    redoNote: () => void;
    // notes 全体を差し替える（履歴を積まない）。アセット移行など内部処理用。#P2
    replaceNotes: (notes: NoteData) => void;
    updateOverview: (content: string) => void;

    addNoteObject: (targetType: NoteTargetType, targetId: string, obj: NoteObject) => void;
    addNoteObjects: (targetType: NoteTargetType, targetId: string, objs: NoteObject[]) => void;
    updateNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, attrs: Partial<NoteObject>, skipHistory?: boolean) => void;
    updateNoteObjects: (targetType: NoteTargetType, targetId: string, updates: { id: string, attrs: Partial<NoteObject> }[], skipHistory?: boolean) => void;
    removeNoteObject: (targetType: NoteTargetType, targetId: string, objId: string) => void;
    removeNoteObjects: (targetType: NoteTargetType, targetId: string, objIds: string[]) => void;
    addNoteAsset: (targetType: NoteTargetType, targetId: string, asset: string) => void;
    removeNoteAsset: (targetType: NoteTargetType, targetId: string, index: number) => void;
    reorderNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, direction: 'front' | 'back' | 'up' | 'down') => void;

    addMiscPage: (title: string) => void;
    updateMiscPage: (id: string, content: string) => void;
    renameMiscPage: (id: string, title: string) => void;
    deleteMiscPage: (id: string) => void;
}

export const createNoteSlice: SliceCreator<NoteSlice> = (set, get) => ({
    notes: {
        overview: '',
        overviewCanvas: { objects: [], assets: [] },
        presets: {},
        characters: {},
        misc: {},
        miscPages: []
    },
    noteHistory: [],
    noteRedoStack: [],

    saveNoteHistory: () => {
        const { notes, noteHistory } = get();
        const newHistory = [...noteHistory, notes].slice(-20);
        // 新規編集が入ったら redo 履歴は無効化する
        set({ noteHistory: newHistory, noteRedoStack: [] });
    },
    undoNote: () => {
        const { noteHistory, notes, noteRedoStack } = get();
        if (noteHistory.length === 0) return;
        const previousNotes = noteHistory[noteHistory.length - 1];
        const newHistory = noteHistory.slice(0, -1);
        // 取り消した現在の状態を redo スタックへ退避
        set({ notes: previousNotes, noteHistory: newHistory, noteRedoStack: [...noteRedoStack, notes].slice(-20) });
    },
    redoNote: () => {
        const { noteHistory, notes, noteRedoStack } = get();
        if (noteRedoStack.length === 0) return;
        const nextNotes = noteRedoStack[noteRedoStack.length - 1];
        const newRedo = noteRedoStack.slice(0, -1);
        // やり直す前の状態を undo 履歴へ積む
        set({ notes: nextNotes, noteRedoStack: newRedo, noteHistory: [...noteHistory, notes].slice(-20) });
    },

    replaceNotes: (notes) => set({ notes }),

    updateOverview: (content) => set((state) => ({ notes: { ...state.notes, overview: content } })),

    addNoteObject: (targetType, targetId, obj) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: [...canvas.objects, obj] })));
    },
    addNoteObjects: (targetType, targetId, objs) => {
        if (!get()._hasHydrated) return;
        if (objs.length === 0) return;
        // 複数オブジェクトを1回の履歴で一括追加（ペースト時に1回のundoでまとめて取り消せるように）
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: [...canvas.objects, ...objs] })));
    },
    updateNoteObject: (targetType, targetId, objId, attrs, skipHistory = false) => {
        if (!get()._hasHydrated) return;
        // revise3 A-4: 対象が存在しないなら履歴も state 更新も行わない（空 undo ステップ防止）
        if (!readCanvas(get(), targetType, targetId)?.objects.some(o => o.id === objId)) return;
        if (!skipHistory) get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: canvas.objects.map(o => o.id === objId ? { ...o, ...attrs } : o) })));
    },
    updateNoteObjects: (targetType, targetId, updates, skipHistory = false) => {
        if (!get()._hasHydrated) return;
        const ids = updates.map(u => u.id);
        if (!readCanvas(get(), targetType, targetId)?.objects.some(o => ids.includes(o.id))) return;
        if (!skipHistory) get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => {
            const newObjects = canvas.objects.map(o => {
                const update = updates.find(u => u.id === o.id);
                return update ? { ...o, ...update.attrs } : o;
            });
            return { ...canvas, objects: newObjects };
        }));
    },
    removeNoteObject: (targetType, targetId, objId) => {
        if (!get()._hasHydrated) return;
        if (!readCanvas(get(), targetType, targetId)?.objects.some(o => o.id === objId)) return;
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: canvas.objects.filter(o => o.id !== objId) })));
    },
    removeNoteObjects: (targetType, targetId, objIds) => {
        if (!get()._hasHydrated) return;
        const canvas = readCanvas(get(), targetType, targetId);
        if (!canvas || !canvas.objects.some(o => objIds.includes(o.id))) return;  // 変更なし→履歴も積まない
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (c) => ({ ...c, objects: c.objects.filter(o => !objIds.includes(o.id)) })));
    },
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
    removeNoteAsset: (targetType, targetId, index) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, assets: canvas.assets.filter((_, i) => i !== index) })));
    },
    reorderNoteObject: (targetType, targetId, objId, direction) => {
        if (!get()._hasHydrated) return;
        const canvas0 = readCanvas(get(), targetType, targetId);
        const idx0 = canvas0?.objects.findIndex(o => o.id === objId) ?? -1;
        if (!canvas0 || idx0 === -1) return;
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (c) => {
            const objs = [...c.objects];
            const i = objs.findIndex(o => o.id === objId);
            if (i === -1) return c;
            // revise3 A-6: objects は4ペイン分が混載しているため、隣接要素が別ペインだと
            // 描画順が変わらず「効かない」ように見える。同一ペイン内の前後要素を基準に移動する。
            const pane = objs[i].canvasIndex || 0;
            const [item] = objs.splice(i, 1);
            if (direction === 'front') { objs.push(item); return { ...c, objects: objs }; }
            if (direction === 'back') { objs.unshift(item); return { ...c, objects: objs }; }
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

    addMiscPage: (title) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => {
            const id = `misc_${Date.now()}`;
            return { notes: { ...state.notes, miscPages: [...state.notes.miscPages, { id, title, canvas: { objects: [], assets: [] } }], misc: { ...state.notes.misc, [id]: '' } } };
        });
    },
    updateMiscPage: (id, content) => set((state) => ({ notes: { ...state.notes, misc: { ...state.notes.misc, [id]: content } } })),
    renameMiscPage: (id, title) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => ({ notes: { ...state.notes, miscPages: state.notes.miscPages.map(p => p.id === id ? { ...p, title } : p) } }));
    },
    deleteMiscPage: (id) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => {
            const newMisc = { ...state.notes.misc }; delete newMisc[id];
            return { notes: { ...state.notes, miscPages: state.notes.miscPages.filter(p => p.id !== id), misc: newMisc } };
        });
    },
});
