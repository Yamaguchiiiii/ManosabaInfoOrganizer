import { useMemo } from 'react';
import { MapNode, MapEdge, Waypoint } from '../store';
import { findShortestPath } from '../utils/dijkstra';
import { DUPLICATES_PER_SEC } from '../constants';

export const useWaypointPath = (
    waypoints: Waypoint[],
    nodes: MapNode[],
    edges: MapEdge[]
) => {
    // useMemoを使って計算結果をメモ化して返す (State更新はしない)
    const { highlightedPath, pathSegments } = useMemo(() => {
        const resolvedPoints = waypoints.map(wp => {
            if (wp.id !== "") return wp;
            const match = nodes.find(n => n.name === wp.name);
            return match ? { ...wp, id: match.id } : wp;
        });
        const validPoints = resolvedPoints.filter(wp => wp.id !== "");
        
        if (validPoints.length < 2) {
            return { highlightedPath: [], pathSegments: [] };
        }

        let fullPath: string[] = [];
        const newSegments: string[][] = [];
        
        for (let i = 0; i < validPoints.length - 1; i++) {
            const start = validPoints[i];
            const end = validPoints[i+1];

            if (!start.id || !end.id) continue; 

            let segmentPath: string[] = [];

            if (start.id === end.id) {
                segmentPath = [start.id];
            } else {
                const path = findShortestPath(nodes, edges, start.id, end.id);
                if (path && path.length > 0) {
                    segmentPath = path;
                } else {
                    segmentPath = []; 
                }
            }

            if (segmentPath.length > 0) {
                // fullPathの結合
                if (fullPath.length > 0) {
                    fullPath = [...fullPath, ...segmentPath.slice(1)];
                } else {
                    fullPath = [...segmentPath];
                }
                
                // セグメント追加
                newSegments.push([...segmentPath]);

                // 滞在時間処理 (fullPathのみに追加)
                if (end.stayTime > 0 && i < validPoints.length - 1) { 
                    const waitCount = Math.ceil(end.stayTime * DUPLICATES_PER_SEC);
                    const waitNodes = Array(waitCount).fill(end.id);
                    fullPath = [...fullPath, ...waitNodes];
                }
            }
        }

        return { highlightedPath: fullPath, pathSegments: newSegments };

    }, [waypoints, nodes, edges]); // 依存配列

    return { highlightedPath, pathSegments };
};