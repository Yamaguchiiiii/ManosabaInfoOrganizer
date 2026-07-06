import { describe, it, expect } from 'vitest';
import { validatePresetSync } from '../syncValidation';
import type { MapNode, CharacterTimelineData } from '../../store';

const nodes: MapNode[] = [
    { id: 'P', x: 0, y: 0, floor: '1F', type: 'room' },
    { id: 'Q', x: 100, y: 0, floor: '1F', type: 'room' },
    { id: 'R', x: 200, y: 0, floor: '1F', type: 'room' },
];

type Data = Record<string, CharacterTimelineData>;

describe('validatePresetSync', () => {
    it('矛盾のないデータは指摘なし', () => {
        const data: Data = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100 },
            B: { path: ['Q', 'P'], startTime: 0, duration: 100 },
        };
        expect(validatePresetSync(data, nodes)).toHaveLength(0);
    });

    it('startRef の循環を error として検出', () => {
        const data: Data = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100, startRef: { charId: 'B', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 0 } },
            B: { path: ['P', 'Q'], startTime: 0, duration: 100, startRef: { charId: 'A', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 0 } },
        };
        const issues = validatePresetSync(data, nodes);
        expect(issues.some(i => i.level === 'error' && i.message.includes('循環'))).toBe(true);
    });

    it('存在しない基準キャラを error として検出', () => {
        const data: Data = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100, startRef: { charId: 'GHOST', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 0 } },
        };
        const issues = validatePresetSync(data, nodes);
        expect(issues.some(i => i.level === 'error' && i.message.includes('存在しません'))).toBe(true);
    });

    it('存在しない合流相手を error として検出', () => {
        const data: Data = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100, syncConstraints: [{ waypointId: 'Q', waypointName: 'Q', meetingTime: 100, charIds: ['GHOST'] }] },
        };
        const issues = validatePresetSync(data, nodes);
        expect(issues.some(i => i.level === 'error' && i.message.includes('合流相手'))).toBe(true);
    });

    it('間に合わない（過速な）合流を warn として検出', () => {
        const data: Data = {
            A: { path: ['P', 'Q', 'R'], startTime: 0, duration: 200, syncConstraints: [{ waypointId: 'R', waypointName: 'R', meetingTime: 10, charIds: ['B'], occurrence: 0 }] },
            B: { path: ['R', 'P'], startTime: 0, duration: 100 },
        };
        const issues = validatePresetSync(data, nodes);
        expect(issues.some(i => i.level === 'warn' && i.message.includes('速すぎ'))).toBe(true);
    });

    it('全員の開始が遅い場合に warn（長時間の待機）', () => {
        const data: Data = {
            A: { path: ['P', 'Q'], startTime: 700, duration: 100 },
        };
        const issues = validatePresetSync(data, nodes);
        expect(issues.some(i => i.level === 'warn' && i.message.includes('誰も動きません'))).toBe(true);
    });
});
