import { INITIAL_NODES, INITIAL_EDGES } from '../constants';
import { MapNode, MapEdge, HistoryState, SliceCreator } from './types';

const saveHistoryNum = 50;

export interface MapSlice {
    nodes: MapNode[]; edges: MapEdge[]; history: HistoryState[];
    undo: () => void; saveHistory: () => void;
    addNode: (node: MapNode) => void; updateNode: (id: string, pos: { x: number, y: number }, data?: Partial<MapNode>) => void;
    removeNode: (id: string) => void; removeEdge: (id: string) => void; addEdge: (edge: MapEdge) => void;
}

export const createMapSlice: SliceCreator<MapSlice> = (set, get) => ({
    nodes: INITIAL_NODES, edges: INITIAL_EDGES, history: [],

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
});
