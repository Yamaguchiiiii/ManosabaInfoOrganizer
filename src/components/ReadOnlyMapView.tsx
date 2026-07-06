import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Group, Text, Circle } from 'react-konva';
import { useAppStore, FloorId } from '../store';
import { StairNode, MapImage } from './common/MapElements';
import { useStageZoom } from '../hooks/useStageZoom';

interface ReadOnlyMapViewProps {
  floorId: FloorId;
  fitContainer?: boolean;
  children?: React.ReactNode;
}

export const ReadOnlyMapView: React.FC<ReadOnlyMapViewProps> = ({ 
    floorId, fitContainer = false, children 
}) => {
    const nodes = useAppStore(state => state.nodes);
    const edges = useAppStore(state => state.edges);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

    const handleImageLoad = useCallback((w: number, h: number) => {
        setImageSize(prev => {
            if (prev.width === w && prev.height === h) return prev;
            return { width: w, height: h };
        });
    }, []);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                const height = containerRef.current.offsetHeight;
                if (width > 0 && height > 0) {
                    setContainerSize({ width, height });
                }
            }
        };

        updateSize();

        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                updateSize();
            });
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const { stageSpec, handleWheel, handleDragEnd } = useStageZoom({
        initialScale: 0.5, minScale: 0.25, maxScale: 1.5
    });

    const getMapSrc = (floor: FloorId) => {
        switch(floor) {
        case 'B1': return './maps/floor_b1.png';
        case '1F': return './maps/floor_1.png';
        case '2F': return './maps/floor_2.png';
        default: return './maps/floor_1.png';
        }
    };

    let scale = stageSpec.scale;
    let x = stageSpec.x;
    let y = stageSpec.y;
    
    // ▼▼▼ 修正: 初期値は fitContainer であれば false にする（初期状態で矛盾させない） ▼▼▼
    let draggable = !fitContainer;

    if (fitContainer && containerSize.width > 0 && containerSize.height > 0 && imageSize.width > 0 && imageSize.height > 0) {
        const scaleX = containerSize.width / imageSize.width;
        const scaleY = containerSize.height / imageSize.height;
        scale = Math.min(scaleX, scaleY);
        
        if (!isFinite(scale) || scale === 0) scale = 0.1;

        x = (containerSize.width - imageSize.width * scale) / 2;
        y = (containerSize.height - imageSize.height * scale) / 2;
        
        // ここでも明示的にfalse
        draggable = false;
    }

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#222', position: 'relative' }}>
            {/* ▼▼▼ 修正: コンテナサイズ確定までStageを描画しない ▼▼▼ */}
            {containerSize.width > 0 && containerSize.height > 0 && (
                <Stage
                    width={containerSize.width} 
                    height={containerSize.height}
                    draggable={draggable} // 修正されたdraggableを使用
                    scaleX={scale}
                    scaleY={scale}
                    x={x}
                    y={y}
                    onWheel={fitContainer ? undefined : handleWheel}
                    onDragEnd={draggable ? handleDragEnd : undefined} // draggableの場合のみイベントハンドラを渡す
                    style={{ cursor: draggable ? 'move' : 'default', backgroundColor: '#222' }}
                >
                    {/* Static layer: map image + edges + nodes. listening=false prevents hit-testing on every frame. */}
                    <Layer listening={false}>
                        <MapImage
                            src={getMapSrc(floorId)}
                            onLoad={handleImageLoad}
                        />

                        <Group>
                        {edges.filter(e => e.floor === floorId).map(edge => {
                            const nodeA = nodes.find(n => n.id === edge.nodeA);
                            const nodeB = nodes.find(n => n.id === edge.nodeB);
                            if (!nodeA || !nodeB) return null;
                            return (
                            <Line
                                key={edge.id}
                                points={[nodeA.x, nodeA.y, nodeB.x, nodeB.y]}
                                stroke="#007acc" strokeWidth={4} lineCap="round" lineJoin="round" opacity={0.0}
                            />
                            );
                        })}
                        </Group>

                        <Group>
                        {nodes.filter(n => n.floor === floorId).map(node => {
                            if (node.type === 'stair') {
                                return (
                                    <Group key={node.id}>
                                    {node.connectedFloor && (
                                        <Text
                                        x={node.x - 20} y={node.y - 25} text={`${node.connectedFloor}`} fontSize={14} fill="white" stroke="black" strokeWidth={3} fillAfterStrokeEnabled align="center"
                                        />
                                    )}
                                    <StairNode x={node.x} y={node.y} fill="#28a745" stroke="white" opacity={0} />
                                    </Group>
                                );
                            }
                            return <Circle key={node.id} x={node.x} y={node.y} radius={8} fill="#007acc" stroke="white" strokeWidth={2} opacity={0.0} />;
                        })}
                        </Group>
                    </Layer>

                    {/* Dynamic layer: character icons only. Redraws only this layer on each animation frame. */}
                    <Layer>
                        {children}
                    </Layer>
            </Stage>
            )}
    </div>
  );
};