import React, { useEffect, useRef } from 'react';
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
import { useAnimationPositions, AnimFloorId } from '../hooks/useAnimationPositions';

const ICON_SIZE = 80;
const HALF_SIZE = ICON_SIZE / 2;

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
  const setSidebarWidth = useAppStore(state => state.setSidebarWidth);
  const presets         = useAppStore(state => state.presets);
  const activePresetId  = useAppStore(state => state.activePresetId);
  const nodes           = useAppStore(state => state.nodes);

  useAnimationLoop();

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const nodesMapRef = useRef<Record<string, MapNode>>({});
  useEffect(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      nodesMapRef.current = map;
  }, [nodes]);

  const charNodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const currentVisualPositions = useRef<Record<string, { x: number, y: number }>>({});

  useEffect(() => {
    setSidebarWidth(MIN_SIDEBAR_WIDTH);
  }, [setSidebarWidth]);

  useAnimationPositions(nodesMapRef, charNodeRefs, currentVisualPositions);

  // 全キャラを全フロアに事前レンダリング。表示/非表示は useAnimationPositions が node.visible() で制御する
  const renderAllCharsForFloor = (floorId: AnimFloorId) => {
      return ICON_FILES.map(icon => {
          const nodeKey = `${icon}:${floorId}`;
          const setRef = (node: Konva.Group | null) => {
              if (node) charNodeRefs.current.set(nodeKey, node);
              else charNodeRefs.current.delete(nodeKey);
          };
          return <MovingCharIcon key={nodeKey} ref={setRef} icon={icon} x={0} y={0} />;
      });
  };

  return (
    <div className="animate-view-container">
      <div className="grid-cell">
        <div className="cell-label">Map 1 (2F)</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadOnlyMapView floorId="2F" fitContainer={true}>
                {renderAllCharsForFloor('2F')}
            </ReadOnlyMapView>
        </div>
      </div>
      <div className="grid-cell">
        <div className="cell-label">Map 2 (1F)</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <ReadOnlyMapView floorId="1F" fitContainer={true}>
                {renderAllCharsForFloor('1F')}
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
                {renderAllCharsForFloor('B1')}
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
