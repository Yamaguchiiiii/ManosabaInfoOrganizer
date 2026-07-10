import { StateCreator } from 'zustand';
import type { UiSlice } from './uiSlice';
import type { MapSlice } from './mapSlice';
import type { PresetSlice } from './presetSlice';
import type { NoteSlice } from './noteSlice';

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

export interface SyncConstraint {
    waypointId: string;
    waypointName: string;
    meetingTime: number;
    charIds: string[];
    // このキャラ自身の経路における waypointId の何回目の訪問で合流するか（0始まり）。
    // 複数地点sync時、合流地点を時刻アンカーに解決するために使う。
    occurrence?: number;
}

// 開始条件（相対参照）: 「基準キャラ(charId)が地点(nodeId)の occurrence 回目の visit に
// 到達(arrival)／出発(departure)した後 +extraDelay」で開始。
export interface StartRef {
    charId: string;
    nodeId: string;
    occurrence: number; // 0始まり（同地点を複数回“訪れる”うちの何回目か。滞在の連続重複は1訪問に集約）
    phase: 'arrival' | 'departure'; // 到達時 / 出発時（滞在後）
    extraDelay: number; // 追加フレーム（0可）
}

export interface CharacterTimelineData {
    path: string[]; startTime: number; duration: number; waypoints?: Waypoint[]; syncConstraints?: SyncConstraint[];
    // 数値delayの代わりの開始条件。設定時は Animate 側で動的に startTime を解決する。
    startRef?: StartRef | null;
    // 待機中（開始前）も開始地点にアイコンを表示するか。既定 true（従来挙動）。
    showBeforeStart?: boolean;
}

// sync合流時に明示的に記録する「会話」イベント（20.md #8）。
// 自動検出の同室(会話)と違い、ユーザーの意思で「ここで話した」ことを固定する。
export interface PresetEvent {
    id: string;
    kind: 'talk';
    nodeId: string;
    nodeName: string;
    time: number; // 絶対フレーム（meetingTime と同じ、resolveStartTimes 基準の正規化前時刻）
    charIds: string[];
}

export interface AnimationPreset {
    // data は onRehydrate で正規化され、常に CharacterTimelineData（旧 string[] 形式は移行済み）。#A-5
    id: string; name: string; data: Record<string, CharacterTimelineData>; deadIcons: string[]; note?: string;
    events?: PresetEvent[]; // 明示会話イベント（省略可＝旧データ互換）
}

// ▼▼▼ 修正: 'freehand' を正式な型として追加 ▼▼▼
export type NoteObjectType = 'image' | 'text' | 'rect' | 'circle' | 'triangle' | 'line' | 'arrow' | 'curve' | 'curve_arrow' | 'freehand';

export interface NoteObject {
    id: string; type: NoteObjectType; x: number; y: number; width?: number; height?: number;
    rotation?: number; scaleX?: number; scaleY?: number; fill?: string; text?: string; fontSize?: number; fontWeight?: string;
    content?: string; stroke?: string; strokeWidth?: number; points?: number[]; lineStyle?: 'normal' | 'marker' | 'pen';
    canvasIndex?: number; groupId?: string; keepRatio?: boolean;
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

export interface HistoryState { nodes: MapNode[]; edges: MapEdge[]; }

// --- オーバーレイダイアログ（window.alert/confirm の代替・Tauri/Web両対応） ---
export interface DialogButton {
    label: string;
    value: string;
    variant?: 'primary' | 'danger' | 'default';
}
export interface DialogRequest {
    title?: string;
    message: string;
    buttons: DialogButton[];
}

export type AppState = UiSlice & MapSlice & PresetSlice & NoteSlice;

export type SliceCreator<T> = StateCreator<AppState, [['zustand/persist', unknown]], [], T>;
