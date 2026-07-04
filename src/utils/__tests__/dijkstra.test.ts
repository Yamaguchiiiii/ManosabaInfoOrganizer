import { describe, it, expect } from 'vitest';
import { findShortestPath } from '../dijkstra';
import type { MapNode, MapEdge } from '../../store';

// テスト用の最小グラフを都度定義する（INITIAL_NODES には依存しない）。
const node = (id: string, x: number, y: number, floor: MapNode['floor'], type: MapNode['type'] = 'room', connectedFloor?: MapNode['floor']): MapNode =>
    ({ id, x, y, floor, type, connectedFloor });
const edge = (id: string, a: string, b: string, floor: MapNode['floor']): MapEdge => ({ id, nodeA: a, nodeB: b, floor });

describe('findShortestPath', () => {
    it('同一フロアの直線経路を返す', () => {
        const nodes = [node('A', 0, 0, '1F'), node('B', 100, 0, '1F'), node('C', 200, 0, '1F')];
        const edges = [edge('e1', 'A', 'B', '1F'), edge('e2', 'B', 'C', '1F')];
        expect(findShortestPath(nodes, edges, 'A', 'C')).toEqual(['A', 'B', 'C']);
    });

    it('より短い方の経路を選ぶ', () => {
        // A-B-D(遠回り) と A-C-D(近道) の2経路
        const nodes = [node('A', 0, 0, '1F'), node('B', 0, 500, '1F'), node('C', 10, 0, '1F'), node('D', 20, 0, '1F')];
        const edges = [edge('e1', 'A', 'B', '1F'), edge('e2', 'B', 'D', '1F'), edge('e3', 'A', 'C', '1F'), edge('e4', 'C', 'D', '1F')];
        expect(findShortestPath(nodes, edges, 'A', 'D')).toEqual(['A', 'C', 'D']);
    });

    it('階段(connectedFloor)を介してフロアをまたぐ経路を返す', () => {
        const nodes = [
            node('X', 50, 0, '1F'),
            node('S1', 0, 0, '1F', 'stair', 'B1'),
            node('S2', 0, 0, 'B1', 'stair', '1F'),
            node('Y', 50, 0, 'B1'),
        ];
        const edges = [edge('e1', 'X', 'S1', '1F'), edge('e2', 'S2', 'Y', 'B1')];
        expect(findShortestPath(nodes, edges, 'X', 'Y')).toEqual(['X', 'S1', 'S2', 'Y']);
    });

    it('到達不能なら null', () => {
        const nodes = [node('A', 0, 0, '1F'), node('B', 100, 0, '1F'), node('Z', 999, 0, '1F')];
        const edges = [edge('e1', 'A', 'B', '1F')];
        expect(findShortestPath(nodes, edges, 'A', 'Z')).toBeNull();
    });

    it('始点と終点が同一なら始点のみ', () => {
        const nodes = [node('A', 0, 0, '1F'), node('B', 100, 0, '1F')];
        const edges = [edge('e1', 'A', 'B', '1F')];
        expect(findShortestPath(nodes, edges, 'A', 'A')).toEqual(['A']);
    });
});
