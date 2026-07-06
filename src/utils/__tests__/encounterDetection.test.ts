import { describe, it, expect } from 'vitest';
import { detectEncounters } from '../encounterDetection';
import type { MapNode } from '../../store';

const nodes: MapNode[] = [
    { id: 'P', x: 0, y: 0, floor: '1F', type: 'room' },
    { id: 'Q', x: 100, y: 0, floor: '1F', type: 'room' },
    { id: 'R', x: 200, y: 0, floor: '1F', type: 'room' },
    { id: 'X', x: 100, y: 100, floor: '1F', type: 'pass' },
];

// path 末尾の重複ノードで「滞在」を表現する（getNodeVisitTimes が arrival<departure を返す）
const stayAtQ_fromP = { path: ['P', 'Q', 'Q'], startTime: 0, duration: 150 };
const stayAtQ_fromR = { path: ['R', 'Q', 'Q'], startTime: 0, duration: 150 };

describe('detectEncounters', () => {
    it('同じ部屋に同時滞在する2人を1件検出', () => {
        const enc = detectEncounters({ A: stayAtQ_fromP, B: stayAtQ_fromR }, nodes, { A: 0, B: 0 });
        expect(enc).toHaveLength(1);
        expect(enc[0].nodeId).toBe('Q');
        expect(new Set(enc[0].charIds)).toEqual(new Set(['A', 'B']));
    });

    it('滞在時刻が重ならなければ検出しない', () => {
        // B は開始を +200 ずらすと Q 滞在が [300,350] になり A[100,150] と重ならない
        const enc = detectEncounters({ A: stayAtQ_fromP, B: stayAtQ_fromR }, nodes, { A: 0, B: 200 });
        expect(enc).toHaveLength(0);
    });

    it('3人の同時滞在を1件に統合', () => {
        const enc = detectEncounters(
            { A: stayAtQ_fromP, B: stayAtQ_fromR, C: { path: ['P', 'Q', 'Q'], startTime: 0, duration: 150 } },
            nodes, { A: 0, B: 0, C: 0 }
        );
        expect(enc).toHaveLength(1);
        expect(new Set(enc[0].charIds)).toEqual(new Set(['A', 'B', 'C']));
    });

    it('room 以外（pass）での同時滞在は検出しない', () => {
        const enc = detectEncounters(
            { A: { path: ['P', 'X', 'X'], startTime: 0, duration: 150 }, B: { path: ['R', 'X', 'X'], startTime: 0, duration: 150 } },
            nodes, { A: 0, B: 0 }
        );
        expect(enc).toHaveLength(0);
    });
});
