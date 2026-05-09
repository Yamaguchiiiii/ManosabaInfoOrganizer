import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { INITIAL_NODES, INITIAL_EDGES } from './constants';

const saveHistoryNum = 50;

export const ICON_FILES = [
  "1_sakuraba_ema.png", "2_nikaido_hiro.png", "3_natsume_anan.png",
  "4_jougasaki_noa.png", "5_hasumi_reia.png", "6_saeki_miria.png",
  "7_houshou_mago.png", "8_kurobe_nanoka.png", "9_sito_arisa.png",
  "10_tachibana_sherry.png", "11_tono_hanna.png", "12_sawatari_koko.png",
  "13_hikami_meruru.png", "14_gokucho.png", "15_kanshu.png"
];

export const PRISON_POSITIONS: Record<string, { x: number, y: number, w: number, angle?: number }> = {
    "1_sakuraba_ema.png":   { x: 450, y: 85, w: 50 },
    "2_nikaido_hiro.png":   { x: 450, y: 110, w: 50 },
    "3_natsume_anan.png":   { x: 360, y: 110, w: 50 },
    "4_jougasaki_noa.png":  { x: 360, y: 85, w: 50 },
    "5_hasumi_reia.png":    { x: 260, y: 85, w: 50 },
    "6_saeki_miria.png":    { x: 260, y: 110, w: 50 },
    "7_houshou_mago.png":   { x: 550, y: 85, w: 50 },
    "8_kurobe_nanoka.png":  { x: 550, y: 110, w: 50 },
    "9_sito_arisa.png":     { x: 650, y: 82, w: 50 },
    "10_tachibana_sherry.png": { x: 650, y: 110, w: 50 },
    "11_tono_hanna.png":    { x: 160, y: 110, w: 50 },
    "12_sawatari_koko.png": { x: 160, y: 85, w: 50 },
    "13_hikami_meruru.png": { x: 70, y: 100, w: 50 },
};

export type FloorId = 'B1' | '1F' | '2F';

export interface MapNode {
    id: string; x: number; y: number; floor: FloorId;
    type: 'room' | 'pass' | 'stair'; connectedFloor?: FloorId; name?: string; 
}

export interface MapEdge {
    id: string; nodeA: string; nodeB: string; floor: FloorId;
}

export interface Waypoint {
    id: string; name: string; stayTime: number;
}

export interface CharacterTimelineData {
    path: string[]; startTime: number; duration: number; waypoints?: Waypoint[]; 
}

export interface AnimationPreset {
    id: string; name: string; data: Record<string, any>; deadIcons: string[]; note?: string; 
}

// ▼▼▼ 修正: 'freehand' を正式な型として追加 ▼▼▼
export type NoteObjectType = 'image' | 'text' | 'rect' | 'circle' | 'triangle' | 'line' | 'arrow' | 'curve' | 'curve_arrow' | 'freehand';

export interface NoteObject {
    id: string; type: NoteObjectType; x: number; y: number; width?: number; height?: number;
    rotation?: number; scaleX?: number; scaleY?: number; fill?: string; text?: string; fontSize?: number; fontWeight?: string; 
    content?: string; stroke?: string; strokeWidth?: number; points?: number[]; lineStyle?: 'normal' | 'marker' | 'pen'; 
    canvasIndex?: number; 
}

export interface CanvasState {
    objects: NoteObject[];
    assets: string[];
}

export type NoteTargetType = 'overview' | 'preset' | 'character' | 'misc';

export interface NoteData {
    overview: string; 
    overviewCanvas?: CanvasState; 
    presets?: Record<string, CanvasState>; 
    characters: Record<string, CanvasState>; 
    misc: Record<string, string>; 
    miscPages: { id: string; title: string; canvas?: CanvasState }[]; 
}

interface HistoryState { nodes: MapNode[]; edges: MapEdge[]; }

export interface AppState {
    activeFloor: FloorId; setActiveFloor: (floor: FloorId) => void;
    mode: 'create' | 'animate' | 'note'; setMode: (mode: 'create' | 'animate' | 'note') => void;
    activeNoteTab: 'overview' | 'preset' | 'character' | 'misc'; setActiveNoteTab: (tab: 'overview' | 'preset' | 'character' | 'misc') => void;

    isGraphEditMode: boolean; setGraphEditMode:(isEdit: boolean) => void;
    nodes: MapNode[]; edges: MapEdge[]; history: HistoryState[];
    undo: () => void; saveHistory: () => void;
    addNode: (node: MapNode) => void; updateNode: (id: string, pos: { x:number, y:number }, data?: Partial<MapNode>) => void;
    removeNode: (id: string) => void; removeEdge: (id: string) => void; addEdge: (edge: MapEdge) => void;
    sidebarWidth: number; setSidebarWidth: (width: number) => void;

    presets: AnimationPreset[]; activePresetId: string;
    addPreset: () => void; setActivePresetId: (id: string) => void;
    updatePresetName: (id: string, name: string) => void; updatePresetNote: (id: string, note: string) => void;
    deletePreset: (id: string) => void;

    saveCharacterAnimation: (presetId: string, charId: string, path: string[], waypoints: Waypoint[], startTIme?: number) => void;
    deleteCharacterAnimation: (presetId: string, charId: string) => void;
    saveBatchCharacterAnimations: (presentId: string, charIds: string[], path: string[], waypoints: Waypoint[], startTIme?: number) => void;
    updateTimelineItem: (presetId: string, charId: string, updates: Partial<CharacterTimelineData>) => void;
    toggleDeadIcon: (icon: string) => void;

    isPlaying: boolean; currentTime: number; playbackSpeed: number;
    setPlaybackSpeed: (speed: number) => void; setIsPlaying: (isPlaying: boolean) => void; setCurrentTime: (time: number) => void; 

    notes: NoteData;
    noteHistory: NoteData[];
    saveNoteHistory: () => void;
    undoNote: () => void;
    updateOverview: (content: string) => void;
    
    addNoteObject: (targetType: NoteTargetType, targetId: string, obj: NoteObject) => void;
    updateNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, attrs: Partial<NoteObject>, skipHistory?: boolean) => void;
    updateNoteObjects: (targetType: NoteTargetType, targetId: string, updates: {id: string, attrs: Partial<NoteObject>}[], skipHistory?: boolean) => void;
    removeNoteObject: (targetType: NoteTargetType, targetId: string, objId: string) => void;
    removeNoteObjects: (targetType: NoteTargetType, targetId: string, objIds: string[]) => void;
    addNoteAsset: (targetType: NoteTargetType, targetId: string, asset: string) => void;
    removeNoteAsset: (targetType: NoteTargetType, targetId: string, index: number) => void;

    addMiscPage: (title: string) => void;
    updateMiscPage: (id: string, content: string) => void;
    renameMiscPage: (id: string, title: string) => void;
    deleteMiscPage: (id: string) => void;

    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
}

const DB_NAME = 'mystery-map-db';
const STORE_NAME = 'app-state';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
};

const idbStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        try {
            const db = await openDB();
            const value = await new Promise<string | undefined>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            if (value) return value;

            const localValue = localStorage.getItem(name);
            if (localValue) {
                await idbStorage.setItem(name, localValue);
                localStorage.removeItem(name);
                return localValue;
            }
            return null;
        } catch (e) { return null; }
    },
    setItem: async (name: string, value: string): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    removeItem: async (name: string): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
};

const updateCanvasState = (
    state: AppState, 
    targetType: NoteTargetType, 
    targetId: string, 
    updater: (canvas: CanvasState) => CanvasState
): Partial<AppState> => {
    const newNotes: NoteData = {
        overview: state.notes.overview || '',
        overviewCanvas: state.notes.overviewCanvas || { objects: [], assets: [] },
        presets: state.notes.presets || {},
        characters: state.notes.characters || {},
        misc: state.notes.misc || {},
        miscPages: state.notes.miscPages || []
    };

    const emptyCanvas: CanvasState = { objects: [], assets: [] };
    
    if (targetType === 'overview') {
        newNotes.overviewCanvas = updater(newNotes.overviewCanvas || emptyCanvas);
    } else if (targetType === 'preset') {
        newNotes.presets = { ...newNotes.presets, [targetId]: updater((newNotes.presets || {})[targetId] || emptyCanvas) };
    } else if (targetType === 'character') {
        newNotes.characters = { ...newNotes.characters, [targetId]: updater((newNotes.characters || {})[targetId] || emptyCanvas) };
    } else if (targetType === 'misc') {
        newNotes.miscPages = newNotes.miscPages.map(p => 
            p.id === targetId ? { ...p, canvas: updater(p.canvas || emptyCanvas) } : p
        );
    }
    return { notes: newNotes };
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
        activeFloor: '1F', setActiveFloor: (floor) => set({ activeFloor: floor }),
        mode: 'create', setMode: (mode) => set({ mode }),
        activeNoteTab: 'overview', setActiveNoteTab: (tab) => set({ activeNoteTab: tab }),

        isGraphEditMode: false, setGraphEditMode: (isEdit) => set({ isGraphEditMode: isEdit }),
        nodes: INITIAL_NODES, edges: INITIAL_EDGES, history: [],
        sidebarWidth: 200, setSidebarWidth: (width) => set({ sidebarWidth: width }),

        presets: [{ id: 'day1', name: 'Day 1', data: {}, deadIcons: [] }],
        activePresetId: 'day1',

        isPlaying: false, currentTime: 0, playbackSpeed: 1.0,

        notes: {
            overview: '',
            overviewCanvas: { objects: [], assets: [] },
            presets: {},
            characters: {},
            misc: {},
            miscPages: []
        },
        noteHistory: [],
        
        saveNoteHistory: () => {
            const { notes, noteHistory } = get();
            const newHistory = [...noteHistory, notes].slice(-20);
            set({ noteHistory: newHistory });
        },
        undoNote: () => {
            const { noteHistory } = get();
            if (noteHistory.length === 0) return;
            const previousNotes = noteHistory[noteHistory.length - 1];
            const newHistory = noteHistory.slice(0, -1);
            set({ notes: previousNotes, noteHistory: newHistory });
        },

        saveHistory: () => {
            const { nodes, edges, history } = get();
            const newHistory = [...history, { nodes, edges }].slice(-saveHistoryNum);
            set({ history: newHistory });
        },
        undo: () => {
            const { history } = get();
            if (history.length === 0) return;
            const previousState = history[history.length - 1];
            const newHistory = history.slice(0, -1);
            set({ nodes: previousState.nodes, edges: previousState.edges, history: newHistory });
        },
        addNode: (node) => { get().saveHistory(); set((state) => ({ nodes: [...state.nodes, node] })); },
        updateNode: (id, pos, data = {}) => set((state) => ({ nodes: state.nodes.map((n) => n.id === id ? { ...n, ...pos, ...data } : n) })),
        removeNode: (id) => { get().saveHistory(); set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id), edges: state.edges.filter((e) => e.nodeA !== id && e.nodeB !== id) })); },
        removeEdge: (id) => { get().saveHistory(); set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })); },
        addEdge: (edge) => { get().saveHistory(); set((state) => ({ edges: [...state.edges, edge] })); },

        addPreset: () => set((state) => {
            const num = state.presets.length + 1;
            const newId = `preset_${Date.now()}`;
            return { presets: [...state.presets, { id: newId, name: `Day ${num}`, data: {}, deadIcons: [] }], activePresetId: newId };
        }),
        setActivePresetId: (id) => set({ activePresetId: id }),
        updatePresetName: (id, name) => set((state) => ({ presets: state.presets.map(p => p.id === id ? { ...p, name } : p) })),
        updatePresetNote: (id, note) => set((state) => ({ presets: state.presets.map(p => p.id === id ? { ...p, note } : p) })),
        deletePreset: (id) => set((state) => {
            if (state.presets.length <= 1) return state;
            const newPresets = state.presets.filter(p => p.id !== id);
            const newActiveId = state.activePresetId === id ? newPresets[0].id : state.activePresetId;
            return { presets: newPresets, activePresetId: newActiveId };
        }),

        saveCharacterAnimation: (presetId, charId, path, waypoints, startTIme = 0) => set((state) => ({
            presets: state.presets.map(p => {
                if (p.id !== presetId) return p;
                const newData: CharacterTimelineData = { path: path, startTime: startTIme, duration: Math.max(path.length * 30, 60), waypoints: waypoints };
                return { ...p, data: { ...p.data, [charId]: newData } };
            })
        })),
        deleteCharacterAnimation: (presetId, charId) => set((state) => ({
            presets: state.presets.map(p => {
                if (p.id !== presetId) return p;
                const newData = { ...p.data }; delete newData[charId]; 
                return { ...p, data: newData };
            })
        })),
        saveBatchCharacterAnimations: (presetId, charIds, path, waypoints, startTIme=0) => set((state) => ({
            presets: state.presets.map(p => {
                if (p.id !== presetId) return p;
                const newData = { ...p.data };
                const timelineData: CharacterTimelineData = { path: path, startTime: startTIme, duration: Math.max(path.length * 30, 60), waypoints: waypoints };
                charIds.forEach(charId => { newData[charId] = timelineData; });
                return { ...p, data: newData };
            })
        })),
        updateTimelineItem: (presetId, charId, updates) => set((state) => ({
            presets: state.presets.map(p => {
                if (p.id !== presetId) return p;
                let current = p.data[charId]; if (!current) return p;
                if (Array.isArray(current)) current = { path: current, startTime: 0, duration: Math.max(current.length * 30, 60) };
                return { ...p, data: { ...p.data, [charId]: { ...current, ...updates } } };
            })
        })),
        toggleDeadIcon: (icon) => set((state) => ({
            presets: state.presets.map(p => {
                if (p.id !== state.activePresetId) return p;
                const currentDead = p.deadIcons || []; 
                const newDead = currentDead.includes(icon) ? currentDead.filter(i => i !== icon) : [...currentDead, icon];
                return { ...p, deadIcons: newDead };
            })
        })),

        setIsPlaying: (isPlaying) => set({ isPlaying }),
        setCurrentTime: (currentTime) => set({ currentTime }),
        setPlaybackSpeed: (speed) => set({ playbackSpeed: speed}),

        updateOverview: (content) => set((state) => ({ notes: { ...state.notes, overview: content } })),

        addNoteObject: (targetType, targetId, obj) => {
            if (!get()._hasHydrated) return;
            get().saveNoteHistory();
            set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, objects: [...canvas.objects, obj] })));
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
            get().saveNoteHistory();
            set((state) => updateCanvasState(state, targetType, targetId, (canvas) => {
                if (canvas.assets.includes(asset)) return canvas;
                return { ...canvas, assets: [...canvas.assets, asset] };
            }));
        },
        removeNoteAsset: (targetType, targetId, index) => {
            if (!get()._hasHydrated) return;
            get().saveNoteHistory();
            set((state) => updateCanvasState(state, targetType, targetId, (canvas) => ({ ...canvas, assets: canvas.assets.filter((_, i) => i !== index) })));
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

        _hasHydrated: false,
        setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
        name: 'mystery-map-storage',
        storage: createJSONStorage(() => idbStorage),
        partialize: (state) => 
            Object.fromEntries(
                Object.entries(state).filter(([key]) => key !== 'noteHistory' && key !== '_hasHydrated')
            ) as AppState,
        onRehydrateStorage: () => (state) => {
            if (state) state.setHasHydrated(true);
        }
    }
  )
);