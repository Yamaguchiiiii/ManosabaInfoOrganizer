import React, { useMemo } from 'react';
import { Group, Line, Text } from 'react-konva';
import Konva from 'konva';
import { MapNode, MapEdge, FloorId, Waypoint } from '../../store';
import { StairNode, RoomNode, PassNode, THEME_COLORS } from '../common/MapElements';
import { SEGMENT_COLORS, getOffsetPoint } from '../../utils/mapDrawUtils';

interface MapObjectLayerProps {
    nodes: MapNode[];
    nodeMap: Record<string, MapNode>; 
    edges: MapEdge[];
    activeFloor: FloorId;
    isGraphEditMode: boolean;
    mode: string;
    pathSegments: string[][];
    highlightedPath: string[];
    connectingNodeId: string | null;
    hoveredNodeId: string | null;
    waypoints: Waypoint[];
    handleEdgeContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void;
    onNodeClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void;
    onNodeMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void;
    onNodeMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void;
    onNodeDragMove: (e: Konva.KonvaEventObject<DragEvent>, id: string) => void;
    onNodeDragEnd: (e: Konva.KonvaEventObject<DragEvent>, id: string) => void;
}

export const MapObjectLayer = React.memo<MapObjectLayerProps>(({
    nodes, nodeMap, edges, activeFloor, isGraphEditMode, mode,
    pathSegments, highlightedPath, connectingNodeId, hoveredNodeId, waypoints,
    handleEdgeContextMenu, onNodeClick, onNodeMouseEnter, onNodeMouseLeave,
    onNodeDragMove, onNodeDragEnd 
}) => {
    
    // エッジ使用数カウント
    const edgeUsageMap = useMemo(() => {
        const usageCount: Record<string, number> = {};
        if (pathSegments.length === 0) return usageCount;

        pathSegments.forEach(segment => {
            for (let i = 0; i < segment.length - 1; i++) {
                const u = segment[i];
                const v = segment[i+1];
                
                const nodeA = nodeMap[u];
                const nodeB = nodeMap[v];
                if (!nodeA || !nodeB || nodeA.floor !== activeFloor || nodeB.floor !== activeFloor) continue;

                const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                usageCount[key] = (usageCount[key] || 0) + 1;
            }
        });
        return usageCount;
    }, [pathSegments, activeFloor, nodeMap]);

    // 表示対象ノードのフィルタリング
    const visibleNodes = useMemo(() => 
        nodes.filter(n => n.floor === activeFloor), 
    [nodes, activeFloor]);

    // 表示対象エッジのフィルタリング
    const visibleEdges = useMemo(() => 
        edges.filter(e => e.floor === activeFloor), 
    [edges, activeFloor]);

    return (
        <>
            {/* 1. ベースエッジ */}
            <Group>
                {visibleEdges.map((edge) => {
                    const nodeA = nodeMap[edge.nodeA];
                    const nodeB = nodeMap[edge.nodeB];
                    if (!nodeA || !nodeB) return null;
                    
                    return (
                        <Line 
                            key={`base-${edge.id}`} 
                            points={[nodeA.x, nodeA.y, nodeB.x, nodeB.y]} 
                            stroke={THEME_COLORS.edge.stroke} strokeWidth={3} 
                            lineCap="round" lineJoin="round" opacity={0.2} 
                            listening={isGraphEditMode} hitStrokeWidth={20}
                            onContextMenu={(e) => handleEdgeContextMenu(e, edge.id)}
                            onMouseEnter={(e) => { 
                                if (isGraphEditMode) { 
                                    const c = e.target.getStage()?.container(); if(c) c.style.cursor = 'pointer'; 
                                    (e.target as Konva.Shape).stroke('red'); (e.target as Konva.Shape).opacity(1); 
                                } 
                            }}
                            onMouseLeave={(e) => { 
                                if (isGraphEditMode) { 
                                    const c = e.target.getStage()?.container(); if(c) c.style.cursor = 'crosshair'; 
                                    (e.target as Konva.Shape).stroke(THEME_COLORS.edge.stroke); (e.target as Konva.Shape).opacity(0.2); 
                                } 
                            }}
                        />
                    );
                })}
            </Group>

            {/* 2. パスセグメント */}
            <Group>
                {(() => {
                    const currentUsage: Record<string, number> = {};
                    return pathSegments.map((segment, segIndex) => {
                        const color = SEGMENT_COLORS[segIndex % SEGMENT_COLORS.length];
                        
                        const segmentLines = [];
                        
                        for (let i = 0; i < segment.length - 1; i++) {
                            const nodeId = segment[i];
                            const nextId = segment[i+1];
                            const nodeA = nodeMap[nodeId];
                            const nodeB = nodeMap[nextId];
                            
                            if (!nodeA || !nodeB || nodeA.floor !== activeFloor || nodeB.floor !== activeFloor) continue;

                            const isForward = nodeA.id < nodeB.id;
                            const key = isForward ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
                            
                            const count = (currentUsage[key] || 0);
                            currentUsage[key] = count + 1;
                            const total = edgeUsageMap[key] || 1;
                            
                            const GAP = 6; 
                            const offset = (count - (total - 1) / 2) * GAP;
                            const { x, y, x2, y2 } = getOffsetPoint(nodeA.x, nodeA.y, nodeB.x, nodeB.y, offset);

                            // #06/28-6:04-3: 進行方向の「>」マークをセグメント長に依存しない固定サイズにする。
                            // 中点 M から単位方向ベクトル u と固定長 ARROW で左右の翼を描く（V字シェブロン）。
                            const segLen = Math.hypot(x2 - x, y2 - y);
                            const mx = (x + x2) / 2, my = (y + y2) / 2;
                            const ux = segLen > 0 ? (x2 - x) / segLen : 0;
                            const uy = segLen > 0 ? (y2 - y) / segLen : 0;
                            const ARROW = 9; // マップ論理座標での固定長
                            const w1x = mx - ux * ARROW - uy * ARROW, w1y = my - uy * ARROW + ux * ARROW;
                            const w2x = mx - ux * ARROW + uy * ARROW, w2y = my - uy * ARROW - ux * ARROW;

                            segmentLines.push(
                                <React.Fragment key={`path-${segIndex}-${i}`}>
                                    <Line points={[x, y, x2, y2]} stroke={color} strokeWidth={4} lineCap="round" lineJoin="round" opacity={0.9} listening={false} shadowColor={color} shadowBlur={4} />
                                    {segLen > 30 && (
                                        <Line points={[w1x, w1y, mx, my, w2x, w2y]} stroke="white" strokeWidth={2} lineCap="round" lineJoin="round" listening={false} opacity={0.8} />
                                    )}
                                </React.Fragment>
                            );
                        }
                        return <Group key={`seg-${segIndex}`}>{segmentLines}</Group>;
                    });
                })()}
            </Group>

            {/* 3. ノード */}
            <Group>
                {visibleNodes.map((node) => {
                    const isSelected = connectingNodeId === node.id || waypoints.some(wp => wp.id === node.id);
                    const isPath = pathSegments.some(seg => seg.includes(node.id));
                    
                    // #06/28-6:04-2: 通常時のノード不透明度を少し上げて視認性を改善
                    let nodeOpacity = 0.6;
                    if (mode === 'animate') { nodeOpacity = 0; }
                    else if (isGraphEditMode) { nodeOpacity = 1; }
                    else {
                        if (highlightedPath.length > 0) {
                            if (isPath || isSelected) nodeOpacity = 1; else nodeOpacity = 0.35;
                        } else {
                            const isHovered = hoveredNodeId === node.id; 
                            const isNeighbor = hoveredNodeId && edges.some(edge => (edge.nodeA === hoveredNodeId && edge.nodeB === node.id) || (edge.nodeB === hoveredNodeId && edge.nodeA === node.id)); 
                            if (isHovered || isNeighbor || isSelected) nodeOpacity = 1; 
                        } 
                    }

                    // Props定義
                    const commonProps = {
                        x: node.x,
                        y: node.y,
                        isSelected,
                        isPath,
                        opacity: nodeOpacity,
                        draggable: isGraphEditMode,
                        onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onNodeClick(e, node.id),
                        onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => onNodeMouseEnter(e, node.id),
                        onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => onNodeMouseLeave(e, node.id),
                    };

                    // ▼ 修正: ドラッグイベントを親のGroupでキャッチして確実に状態を更新する
                    const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
                        onNodeDragMove(e, node.id);
                    };

                    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
                        onNodeDragEnd(e, node.id);
                    };

                    if (node.type === 'stair') {
                        return (
                            <Group 
                                key={node.id}
                                onDragMove={handleDragMove}
                                onDragEnd={handleDragEnd}
                            >
                                {node.name && isGraphEditMode && <Text x={node.x - 20} y={node.y + 15} text={node.name} fontSize={12} fill="white" />}
                                {node.connectedFloor && mode !== 'animate' && <Text x={node.x - 20} y={node.y - 25} text={`↑ ${node.connectedFloor}へ`} fontSize={14} fill={THEME_COLORS.text} stroke="#000000" strokeWidth={3} fillAfterStrokeEnabled={true} fontStyle="bold" listening={false} align="center" />}
                                <StairNode {...commonProps} />
                            </Group>
                        );
                    } else if (node.type === 'room') {
                        return (
                            <Group 
                                key={node.id}
                                onDragMove={handleDragMove}
                                onDragEnd={handleDragEnd}
                            >
                                {node.name && (isGraphEditMode || isSelected || hoveredNodeId === node.id) && <Text x={node.x - 20} y={node.y + 15} text={node.name} fontSize={12} fill="white" stroke="black" strokeWidth={2} fillAfterStrokeEnabled />}
                                <RoomNode {...commonProps} />
                            </Group>
                        );
                    } else {
                        // ▼ 修正: PassNodeもGroupで囲んでイベントをキャッチ
                        return (
                            <Group 
                                key={node.id}
                                onDragMove={handleDragMove}
                                onDragEnd={handleDragEnd}
                            >
                                <PassNode {...commonProps} />
                            </Group>
                        );
                    }
                })}
            </Group>
        </>
    );
});