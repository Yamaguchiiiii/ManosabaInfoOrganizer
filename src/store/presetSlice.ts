import { WAIT_VIRTUAL_DISTANCE, MOVEMENT_SPEED_PX_PER_SEC, TARGET_FPS } from '../constants';
import { AnimationPreset, CharacterTimelineData, MapNode, PresetEvent, StartRef, SyncConstraint, Waypoint, SliceCreator } from './types';

export const computeDuration = (path: string[], nodes: MapNode[]): number => {
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

export interface PresetSlice {
    presets: AnimationPreset[]; activePresetId: string;
    addPreset: () => void; setActivePresetId: (id: string) => void;
    updatePresetName: (id: string, name: string) => void; updatePresetNote: (id: string, note: string) => void;
    deletePreset: (id: string) => void;

    saveCharacterAnimation: (presetId: string, charId: string, path: string[], waypoints: Waypoint[], startTime?: number, syncConstraints?: SyncConstraint[], startRef?: StartRef | null, showBeforeStart?: boolean) => void;
    deleteCharacterAnimation: (presetId: string, charId: string) => void;
    saveBatchCharacterAnimations: (presetId: string, charIds: string[], path: string[], waypoints: Waypoint[], startTime?: number, syncConstraints?: SyncConstraint[], startRef?: StartRef | null, showBeforeStart?: boolean) => void;
    updateTimelineItem: (presetId: string, charId: string, updates: Partial<CharacterTimelineData>) => void;
    toggleDeadIcon: (icon: string) => void;
    addPresetEvent: (presetId: string, ev: PresetEvent) => void;
    removePresetEvent: (presetId: string, evId: string) => void;
}

export const createPresetSlice: SliceCreator<PresetSlice> = (set) => ({
    presets: [{ id: 'chapter1', name: 'Episode 1', data: {}, deadIcons: [] }],
    activePresetId: 'chapter1',

    addPreset: () => set((state) => {
        const num = state.presets.length + 1;
        const newId = `preset_${Date.now()}`;
        return { presets: [...state.presets, { id: newId, name: `Episode ${num}`, data: {}, deadIcons: [] }], activePresetId: newId };
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

    saveCharacterAnimation: (presetId, charId, path, waypoints, startTIme = 0, syncConstraints, startRef = null, showBeforeStart = true) => set((state) => ({
        presets: state.presets.map(p => {
            if (p.id !== presetId) return p;
            const newData: CharacterTimelineData = { path, startTime: startTIme, duration: computeDuration(path, state.nodes), waypoints, syncConstraints, startRef, showBeforeStart };
            return { ...p, data: { ...p.data, [charId]: newData } };
        })
    })),
    deleteCharacterAnimation: (presetId, charId) => set((state) => ({
        presets: state.presets.map(p => {
            if (p.id !== presetId) return p;
            const newData: Record<string, CharacterTimelineData> = { ...p.data };
            delete newData[charId];
            // 削除したキャラを参照している他キャラの sync 表示が残らないよう、
            // 各キャラの syncConstraints から charId を除去し、参照が無くなった制約は破棄する。
            Object.keys(newData).forEach(cid => {
                const cData = newData[cid];
                if (!cData || !Array.isArray(cData.syncConstraints)) return;
                const cleaned = cData.syncConstraints
                    .map(sc => ({ ...sc, charIds: sc.charIds.filter(id => id !== charId) }))
                    .filter(sc => sc.charIds.length > 0);
                if (cleaned.length !== cData.syncConstraints.length) {
                    newData[cid] = { ...cData, syncConstraints: cleaned };
                }
            });
            // 削除キャラを含む会話イベントからも除去し、1人以下になったら破棄
            const cleanedEvents = (p.events || [])
                .map(ev => ({ ...ev, charIds: ev.charIds.filter(id => id !== charId) }))
                .filter(ev => ev.charIds.length >= 2);
            return { ...p, data: newData, events: cleanedEvents };
        })
    })),
    saveBatchCharacterAnimations: (presetId, charIds, path, waypoints, startTIme = 0, syncConstraints, startRef = null, showBeforeStart = true) => set((state) => ({
        presets: state.presets.map(p => {
            if (p.id !== presetId) return p;
            const newData = { ...p.data };
            const timelineData: CharacterTimelineData = { path, startTime: startTIme, duration: computeDuration(path, state.nodes), waypoints, syncConstraints, startRef, showBeforeStart };
            charIds.forEach(charId => { newData[charId] = timelineData; });
            return { ...p, data: newData };
        })
    })),
    updateTimelineItem: (presetId, charId, updates) => set((state) => ({
        presets: state.presets.map(p => {
            if (p.id !== presetId) return p;
            const current = p.data[charId]; if (!current) return p;
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
    addPresetEvent: (presetId, ev) => set((state) => ({
        presets: state.presets.map(p => p.id !== presetId ? p : { ...p, events: [...(p.events || []), ev] })
    })),
    removePresetEvent: (presetId, evId) => set((state) => ({
        presets: state.presets.map(p => p.id !== presetId ? p : { ...p, events: (p.events || []).filter(e => e.id !== evId) })
    })),
});
