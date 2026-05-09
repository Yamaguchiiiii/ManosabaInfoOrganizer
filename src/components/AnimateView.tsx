import React, { useEffect, useRef, useMemo } from 'react';
import { Line, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { ReadOnlyMapView } from './ReadOnlyMapView';
import { AnimationTimeline } from './AnimationTimeline';
import { NotesPanel } from './NotesPanel';
import '../styles/AnimateView.scss';
import { useAppStore, PRISON_POSITIONS, ICON_FILES, MapNode } from '../store';
import { MIN_SIDEBAR_WIDTH } from '../hooks/useSidebarResizer';
import { useAnimationLoop } from '../hooks/useAnimationLoop';
import { calculateRawPosition, getCollisionOffsets } from '../utils/animationUtils';

const ICON_SIZE = 80;
const HALF_SIZE = ICON_SIZE / 2;
const LERP_FACTOR = 0.15; 
const TELEPORT_THRESHOLD = 200; 

const MovingCharIcon = React.memo(React.forwardRef<Konva.Group, { icon: string, x: number, y: number }>(
    ({ icon, x, y }, ref) => {
        const [image] = useImage(`./icon/${icon}`);
        return (
            <Group ref={ref} x={x} y={y}>
                <KonvaImage image={image} width={ICON_SIZE} height={ICON_SIZE} offsetX={HALF_SIZE} offsetY={HALF_SIZE} cornerRadius={HALF_SIZE} />
                <KonvaImage image={image} width={ICON_SIZE} height={ICON_SIZE} offsetX={HALF_SIZE} offsetY={HALF_SIZE} stroke="#007acc" strokeWidth={3} cornerRadius={HALF_SIZE} />
            </Group>
        );
    }
));

export const AnimateView = () => {
  const { setSidebarWidth, presets, activePresetId, nodes, currentTime } = useAppStore();
  
  useAnimationLoop();

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];
  const timelineData = activePreset?.data || {};

  const nodesMap = useMemo(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      return map;
  }, [nodes]);

  const charNodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const currentVisualPositions = useRef<Record<string, { x: number, y: number }>>({});
  
  // 最後の速度ベクトルを保持 (隊列維持用)
  const lastVelocitiesRef = useRef<Record<string, { vx: number, vy: number }>>({});

  useEffect(() => {
    setSidebarWidth(MIN_SIDEBAR_WIDTH);
  }, [setSidebarWidth]);

  // 目標座標計算
  const targetPositionsRef = useRef<Record<string, { x: number, y: number, isFinished: boolean }>>({});

  const activeCharData = useMemo(() => {
      const activePositions = ICON_FILES
        .filter(icon => !deadIcons.includes(icon) && timelineData[icon])
        .map(icon => {
            let charData = timelineData[icon];
            if (Array.isArray(charData)) {
                charData = { path: charData, startTime: 0, duration: (charData.length * 30) };
            }
            
            const pos = calculateRawPosition(charData as any, currentTime, nodesMap);
            
            if (pos && pos.visible) {
                let { vx, vy } = pos;

                if (Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001) {
                    lastVelocitiesRef.current[icon] = { vx, vy };
                } else {
                    const last = lastVelocitiesRef.current[icon];
                    if (last) {
                        vx = last.vx;
                        vy = last.vy;
                    }
                }

                return { 
                    id: icon, x: pos.x, y: pos.y, floor: pos.floor, 
                    vx, vy, isFinished: pos.isFinished 
                };
            }
            return null;
        })
        .filter((p): p is { id: string, x: number, y: number, floor: string, vx: number, vy: number, isFinished: boolean } => !!p);

      const offsets = getCollisionOffsets(activePositions, ICON_SIZE);

      const targets: Record<string, { x: number, y: number, floor: string, isFinished: boolean }> = {};
      
      activePositions.forEach(p => {
          const offset = offsets[p.id] || { x: 0, y: 0 };
          targets[p.id] = {
              x: p.x + offset.x,
              y: p.y + offset.y,
              floor: p.floor,
              isFinished: p.isFinished
          };
      });

      return { list: activePositions, targets };

  }, [currentTime, nodesMap, deadIcons, timelineData]);

  useEffect(() => {
      targetPositionsRef.current = activeCharData.targets;
  }, [activeCharData]);

  useEffect(() => {
      let animId: number;
      const animate = () => {
          charNodeRefs.current.forEach((node, charId) => {
              if (!node) return;

              const target = targetPositionsRef.current[charId];
              const current = currentVisualPositions.current[charId] || (target ? { x: target.x, y: target.y } : { x: 0, y: 0 });

              if (target) {
                  const diffX = target.x - current.x;
                  const diffY = target.y - current.y;
                  const distSq = diffX * diffX + diffY * diffY;

                  if (target.isFinished) {
                      current.x = target.x;
                      current.y = target.y;
                  } else if (distSq > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
                      current.x = target.x;
                      current.y = target.y;
                  } else if (Math.abs(diffX) < 0.1 && Math.abs(diffY) < 0.1) {
                      current.x = target.x;
                      current.y = target.y;
                  } else {
                      current.x += diffX * LERP_FACTOR;
                      current.y += diffY * LERP_FACTOR;
                  }

                  node.x(current.x);
                  node.y(current.y);
                  node.visible(true); 
              }
              currentVisualPositions.current[charId] = current;
          });
          animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animId);
  }, []);

  const renderFloorChars = (floorId: string) => {
      return activeCharData.list
          .filter(p => p.floor === floorId)
          .map(p => {
              const setRef = (node: Konva.Group | null) => {
                  if (node) {
                      charNodeRefs.current.set(p.id, node);
                      if (!currentVisualPositions.current[p.id]) {
                          const t = activeCharData.targets[p.id];
                          if(t) {
                              node.x(t.x);
                              node.y(t.y);
                              currentVisualPositions.current[p.id] = { x: t.x, y: t.y };
                          }
                      }
                  } else {
                      charNodeRefs.current.delete(p.id);
                  }
              };
              const initialT = activeCharData.targets[p.id] || { x: 0, y: 0 };
              return (
                  <MovingCharIcon key={p.id} ref={setRef} icon={p.id} x={initialT.x} y={initialT.y} />
              );
          });
  };

  return (
    <div className="animate-view-container">
      <div className="grid-cell">
        <div className="cell-label">Map 1 (2F)</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadOnlyMapView floorId="2F" fitContainer={true}>
                {renderFloorChars('2F')}
            </ReadOnlyMapView>
        </div>
      </div>
      <div className="grid-cell">
        <div className="cell-label">Map 2 (1F)</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadOnlyMapView floorId="1F" fitContainer={true}>
                {renderFloorChars('1F')}
            </ReadOnlyMapView>
        </div>
      </div>
      <div className="grid-cell" style={{ position: 'relative' }}>
        <div className="cell-label">Map 3 (B1)</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadOnlyMapView floorId="B1" fitContainer={true}>
                {deadIcons.map(icon => {
                    const pos = PRISON_POSITIONS[icon];
                    if (!pos) return null;
                    return (
                        <Line key={icon} points={[0, 0, pos.w, 0]} x={pos.x} y={pos.y} rotation={pos.angle || -5} stroke="black" strokeWidth={5} lineCap="round" />
                    );
                })}
                {renderFloorChars('B1')}
            </ReadOnlyMapView>
        </div>
      </div>
      <div className="grid-cell control-cell-wrapper">
        <div className="timeline-section"><AnimationTimeline /></div>
        <div className="notes-section"><NotesPanel /></div>
      </div>
    </div>
  );
};