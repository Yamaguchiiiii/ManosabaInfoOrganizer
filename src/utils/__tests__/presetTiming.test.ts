import { describe, it, expect } from 'vitest';
import { computePresetTiming } from '../presetTiming';
import type { MapNode } from '../../store';

const nodes: MapNode[] = [
    { id: 'P', x: 0, y: 0, floor: '1F', type: 'room' },
    { id: 'Q', x: 100, y: 0, floor: '1F', type: 'room' },
];

describe('computePresetTiming', () => {
    it('全員 start=0 なら offset は 0', () => {
        const { offset, maxDuration } = computePresetTiming({
            A: { path: ['P', 'Q'], startTime: 0, duration: 500 },
            B: { path: ['P', 'Q'], startTime: 0, duration: 300 },
        }, nodes);
        expect(offset).toBe(0);
        expect(maxDuration).toBe(560); // max(500+60, 300)
    });

    it('全員 start>=100 なら offset は最小開始時刻になり、尺が縮む', () => {
        const { offset, maxDuration } = computePresetTiming({
            A: { path: ['P', 'Q'], startTime: 100, duration: 500 },
            B: { path: ['P', 'Q'], startTime: 150, duration: 500 },
        }, nodes);
        expect(offset).toBe(100);
        // offset補正後の終端(650-100=550)が offset 無しの終端(650)より小さい尺になる
        expect(maxDuration).toBe(610); // max(550+60, 300)
        expect(maxDuration).toBeLessThan(650 + 60);
    });

    it('空データなら既定値 {offset:0, maxDuration:300} を返す', () => {
        const { offset, maxDuration, resolvedStarts } = computePresetTiming({}, nodes);
        expect(offset).toBe(0);
        expect(maxDuration).toBe(300);
        expect(resolvedStarts).toEqual({});
    });
});
