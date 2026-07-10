import { NoteData, NoteTargetType, CanvasState, AnimationPreset } from '../store';
import { formatCharName } from './charName';

export interface NoteSearchHit {
    targetType: NoteTargetType;
    targetId: string;
    objId?: string;
    snippet: string;
    title: string;
}

// F3: 全ノート（全体/事件/キャラクター/メモ）のテキストオブジェクトを対象に部分一致検索する。
export const searchNotes = (
    notes: NoteData,
    presets: AnimationPreset[],
    q: string
): NoteSearchHit[] => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const hits: NoteSearchHit[] = [];
    const scanCanvas = (tt: NoteTargetType, tid: string, title: string, c?: CanvasState) =>
        c?.objects.forEach(o => {
            if (o.type === 'text' && o.text?.toLowerCase().includes(query)) {
                hits.push({ targetType: tt, targetId: tid, objId: o.id, title, snippet: o.text.slice(0, 60) });
            }
        });

    scanCanvas('overview', 'overview', '全体ノート', notes.overviewCanvas);
    presets.forEach(p => scanCanvas('preset', p.id, `事件ノート: ${p.name}`, notes.presets?.[p.id]));
    Object.entries(notes.characters || {}).forEach(([cid, c]) => scanCanvas('character', cid, `キャラ: ${formatCharName(cid)}`, c));
    notes.miscPages.forEach(p => scanCanvas('misc', p.id, `メモ: ${p.title}`, p.canvas));

    return hits.slice(0, 50);
};
