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
        if (!skipHistory) get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: canvas.objects.map(o => o.id === objId ? { ...o, ...attrs } : o) })));
    },
    updateNoteObjects: (targetType, targetId, updates, skipHistory = false) => {
        if (!get()._hasHydrated) return;
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
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: canvas.objects.filter(o => o.id !== objId) })));
    },
    removeNoteObjects: (targetType, targetId, objIds) => {
        if (!get()._hasHydrated) return;
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: canvas.objects.filter(o => !objIds.includes(o.id)) })));
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
        get().saveNoteHistory();
        set((state) => updateCanvasState(state, targetType, targetId, (canvas) => {
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
