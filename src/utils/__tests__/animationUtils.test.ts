import { describe, it, expect } from 'vitest';
import {
    normalizeTimelineData,
    getNodeVisitTimes,
    getNodeVisitOccurrences,
    resolveStartTimes,
    computeAnchors,
    precomputePath,
} from '../animationUtils';
import type { MapNode, CharacterTimelineData } from '../../store';

// 距離が分かりやすい直線ノード（WAIT_VIRTUAL_DISTANCE=50, 隣接=100px を利用）
const nodes: MapNode[] = [
    { id: 'P', x: 0, y: 0, floor: '1F', type: 'room' },
    { id: 'Q', x: 100, y: 0, floor: '1F', type: 'room' },
    { id: 'R', x: 200, y: 0, floor: '1F', type: 'room' },
];

describe('normalizeTimelineData', () => {
    it('旧形式(配列)を CharacterTimelineData に変換する', () => {
        const r = normalizeTimelineData(['P', 'Q']);
        expect(r).toEqual({ path: ['P', 'Q'], startTime: 0, duration: 60 });
    });
    it('新形式(オブジェクト)はそのまま返す', () => {
        const cd: CharacterTimelineData = { path: ['P', 'Q'], startTime: 5, duration: 100 };
        expect(normalizeTimelineData(cd)).toBe(cd);
    });
    it('null/空配列/不正値は null', () => {
        expect(normalizeTimelineData(null)).toBeNull();
        expect(normalizeTimelineData([])).toBeNull();
        expect(normalizeTimelineData({ foo: 1 })).toBeNull();
    });
});

describe('getNodeVisitTimes', () => {
    it('連続重複(滞在)を1訪問に集約し arrival<departure を返す', () => {
        // path P->Q->Q->R: 距離 100 + 50(待機) + 100 = 250、duration=250 なら timeAt=cum
        const cd: CharacterTimelineData = { path: ['P', 'Q', 'Q', 'R'], startTime: 0, duration: 250 };
        const visits = getNodeVisitTimes(cd, 'Q', nodes);
        expect(visits).toHaveLength(1);
        expect(visits[0].arrival).toBeCloseTo(100);
        expect(visits[0].departure).toBeCloseTo(150);
    });
    it('startTime を絶対時刻としてオフセットする', () => {
        const cd: CharacterTimelineData = { path: ['P', 'Q', 'R'], startTime: 1000, duration: 200 };
        const visits = getNodeVisitTimes(cd, 'Q', nodes);
        expect(visits[0].arrival).toBeCloseTo(1000 + 100); // Q は中点
    });
});

describe('getNodeVisitOccurrences', () => {
    it('同一地点を複数回訪れる経路で全訪問を時系列順に返す', () => {
        // P->Q->R->Q: Q を2回訪問（距離 100,100,100 = 300, duration=300）
        const cd: CharacterTimelineData = { path: ['P', 'Q', 'R', 'Q'], startTime: 0, duration: 300 };
        const occ = getNodeVisitOccurrences(cd, 'Q', nodes);
        expect(occ.map(o => o.pathIndex)).toEqual([1, 3]);
        expect(occ[0].arrival).toBeCloseTo(100);
        expect(occ[1].arrival).toBeCloseTo(300);
    });
    it('滞在（連続重複）は1訪問に集約する', () => {
        const cd: CharacterTimelineData = { path: ['P', 'Q', 'Q', 'R'], startTime: 0, duration: 250 };
        const occ = getNodeVisitOccurrences(cd, 'Q', nodes);
        expect(occ).toHaveLength(1);
        expect(occ[0].arrival).toBeCloseTo(100);
        expect(occ[0].departure).toBeCloseTo(150);
    });
});

describe('computeAnchors', () => {
    // 3ノード直線マップ(P-Q-R、各区間100px)を使う
    it('過去向きの合流時刻のアンカーは無効化される（瞬間移動しない）', () => {
        const cd: CharacterTimelineData = {
            path: ['P', 'Q', 'R'], startTime: 100, duration: 200,
            syncConstraints: [{ waypointId: 'Q', waypointName: 'Q', meetingTime: 0, charIds: ['X'] }],
        };
        const cached = precomputePath(cd.path, nodes);
        const anchors = computeAnchors(cd, cached);
        // 過去向き(meetingTime=0 < startTime=100)は無効化され、[start, end] の2点のみになる
        expect(anchors).toHaveLength(2);
        expect(anchors[0]).toEqual({ cumDist: 0, time: 100 });
        expect(anchors[1].cumDist).toBeCloseTo(cached.totalDistance);
    });
    it('未来向きの合流時刻はアンカーになる', () => {
        const cd: CharacterTimelineData = {
            path: ['P', 'Q', 'R'], startTime: 0, duration: 200,
            syncConstraints: [{ waypointId: 'Q', waypointName: 'Q', meetingTime: 500, charIds: ['X'] }],
        };
        const cached = precomputePath(cd.path, nodes);
        const anchors = computeAnchors(cd, cached);
        expect(anchors).toHaveLength(3);
        expect(anchors[1].time).toBeCloseTo(500);
    });
});

describe('resolveStartTimes', () => {
    it('startRef を「基準キャラの到達時刻 + extraDelay」で解決する', () => {
        const data: Record<string, CharacterTimelineData> = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100 },      // Q 到達=100
            B: { path: ['Q', 'P'], startTime: 0, duration: 100,
                 startRef: { charId: 'A', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 10 } },
        };
        const resolved = resolveStartTimes(data, nodes);
        expect(resolved.A).toBeCloseTo(0);
        expect(resolved.B).toBeCloseTo(110);
    });

    it('syncConstraints があるキャラは startRef より startTime を優先する', () => {
        const data: Record<string, CharacterTimelineData> = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100 },
            C: { path: ['Q', 'R'], startTime: 42, duration: 100,
                 startRef: { charId: 'A', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 5 },
                 syncConstraints: [{ waypointId: 'Q', waypointName: 'Q', meetingTime: 100, charIds: ['A'] }] },
        };
        const resolved = resolveStartTimes(data, nodes);
        expect(resolved.C).toBeCloseTo(42);
    });

    it('循環参照は 0 にフォールバックし、無限ループにならない', () => {
        const data: Record<string, CharacterTimelineData> = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100,
                 startRef: { charId: 'B', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 0 } },
            B: { path: ['P', 'Q'], startTime: 0, duration: 100,
                 startRef: { charId: 'A', nodeId: 'Q', occurrence: 0, phase: 'arrival', extraDelay: 0 } },
        };
        const resolved = resolveStartTimes(data, nodes);
        expect(Number.isFinite(resolved.A)).toBe(true);
        expect(Number.isFinite(resolved.B)).toBe(true);
    });

    it('基準キャラがその地点を通らない場合は自分の startTime にフォールバック', () => {
        const data: Record<string, CharacterTimelineData> = {
            A: { path: ['P', 'Q'], startTime: 0, duration: 100 }, // R は通らない
            B: { path: ['R', 'P'], startTime: 7, duration: 100,
                 startRef: { charId: 'A', nodeId: 'R', occurrence: 0, phase: 'arrival', extraDelay: 3 } },
        };
        const resolved = resolveStartTimes(data, nodes);
        expect(resolved.B).toBeCloseTo(7);
    });
});
