import { MapNode } from '../store';
import { getNodeVisitTimesAnchored, normalizeTimelineData } from './animationUtils';

// 遭遇（同室）自動検出（refactoring B-6）。
// 「誰と誰がいつ同じ部屋に居たか」は本作の推理の核。各キャラの room 滞在区間を求め、
// 同一 room で 2人以上が同時に滞在する時間窓を Encounter として抽出する。
// v1 は room（type==='room'）の滞在のみ対象（pass/stair の一瞬の交差はノイズになるため除外）。
export interface Encounter {
    nodeId: string;
    nodeName: string;
    charIds: string[];
    start: number; // 絶対フレーム（resolvedStarts 反映済み）
    end: number;
}

export const detectEncounters = (
    rawData: Record<string, unknown>,
    nodes: MapNode[],
    resolvedStarts: Record<string, number>
): Encounter[] => {
    const nodeMap: Record<string, MapNode> = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    // room ノードごとに各キャラの滞在区間を集める
    const perNode: Record<string, { charId: string; start: number; end: number }[]> = {};
    Object.entries(rawData).forEach(([charId, raw]) => {
        const base = normalizeTimelineData(raw);
        if (!base) return;
        const cd = { ...base, startTime: resolvedStarts[charId] ?? base.startTime ?? 0 };
        const roomIds = [...new Set(cd.path)].filter(id => nodeMap[id]?.type === 'room');
        roomIds.forEach(nid => {
            // sync（アンカー）反映済みの時刻で滞在区間を計算する（revise2 №2: 旧は duration 按分で
            // sync ありキャラの実際の同室判定とズレていた）
            getNodeVisitTimesAnchored(cd, nid, nodes).forEach(v => {
                (perNode[nid] ||= []).push({ charId, start: v.arrival, end: v.departure });
            });
        });
    });

    const encounters: Encounter[] = [];
    Object.entries(perNode).forEach(([nodeId, intervals]) => {
        if (intervals.length < 2) return;

        // スイープライン: 各区間の in(+1)/out(-1) イベントを時刻順に処理し、
        // 「異なるキャラが2人以上同時に居る」時間窓を切り出す。同時刻は in を先に処理。
        const events = intervals.flatMap(iv => [
            { t: iv.start, d: 1, charId: iv.charId },
            { t: iv.end, d: -1, charId: iv.charId },
        ]).sort((a, b) => a.t - b.t || b.d - a.d);

        const activeCount: Record<string, number> = {};
        const distinct = () => Object.keys(activeCount).reduce((n, k) => n + (activeCount[k] > 0 ? 1 : 0), 0);

        let winStart: number | null = null;
        let winChars = new Set<string>();

        for (const ev of events) {
            const was = distinct() >= 2;
            activeCount[ev.charId] = (activeCount[ev.charId] || 0) + ev.d;
            const now = distinct() >= 2;

            if (now) {
                if (!was) { winStart = ev.t; winChars = new Set(); }
                Object.keys(activeCount).forEach(k => { if (activeCount[k] > 0) winChars.add(k); });
            } else if (was && winStart !== null) {
                // 正の長さの窓だけ採用（同時刻の接触=0長は除外）
                if (ev.t > winStart && winChars.size >= 2) {
                    encounters.push({ nodeId, nodeName: nodeMap[nodeId]?.name || nodeId, charIds: [...winChars], start: winStart, end: ev.t });
                }
                winStart = null;
                winChars = new Set();
            }
        }
    });

    return encounters.sort((a, b) => a.start - b.start);
};
