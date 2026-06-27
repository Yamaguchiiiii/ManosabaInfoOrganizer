import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Line, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { ReadOnlyMapView } from './ReadOnlyMapView';
import { AnimationTimeline } from './AnimationTimeline';
import { NotesPanel } from './NotesPanel';
import '../styles/AnimateView.scss';
import { useAppStore, usePlaybackStore, PRISON_POSITIONS, ICON_FILES, MapNode } from '../store';
import { MIN_SIDEBAR_WIDTH } from '../hooks/useSidebarResizer';
import { useAnimationPositions, AnimFloorId } from '../hooks/useAnimationPositions';

const ICON_SIZE = 80;
const HALF_SIZE = ICON_SIZE / 2;

const MovingCharIcon = React.memo(React.forwardRef<Konva.Group, { icon: string, x: number, y: number }>(
    ({ icon, x, y }, ref) => {
        const [image] = useImage(`./icon/${icon}`);
        return (
            // 画像2枚重ね＋shadowBlur(高コスト)は避け、1枚＋白縁ストロークのみ。
            <Group ref={ref} x={x} y={y}>
                <KonvaImage
                    image={image}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    offsetX={HALF_SIZE}
                    offsetY={HALF_SIZE}
                    cornerRadius={HALF_SIZE}
                    stroke="rgba(255, 255, 255, 0.85)"
                    strokeWidth={2.5}
                />
            </Group>
        );
    }
));

export const AnimateView = () => {
  const setSidebarWidth = useAppStore(state => state.setSidebarWidth);
  const presets         = useAppStore(state => state.presets);
  const activePresetId  = useAppStore(state => state.activePresetId);
  const nodes           = useAppStore(state => state.nodes);

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const nodesMapRef = useRef<Record<string, MapNode>>({});
  useEffect(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      nodesMapRef.current = map;
  }, [nodes]);

  const charNodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const currentVisualPositions = useRef<Record<string, { x: number, y: number, floor: string }>>({});

  // 再生操作盤をフローティングウィンドウ化する。デフォルト位置は Map3 B1(左下ペイン)の左下隅。
  const mapCellRef = useRef<HTMLDivElement>(null);     // Map3 B1 セル
  const toolbarRef = useRef<HTMLDivElement>(null);     // 操作盤本体(高さ計測用)
  const placedRef = useRef(false);
  const [timelinePos, setTimelinePos] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Map3 セルの左下隅に操作盤の左下を合わせる。実高さを測るため、仮配置→計測→補正の2段階。
  useEffect(() => {
    if (placedRef.current) return;
    const cell = mapCellRef.current;
    if (cell) {
      const r = cell.getBoundingClientRect();
      if (r.width > 0) {
        if (!timelinePos) {
          setTimelinePos({ x: r.left + 4, y: r.bottom - 80 }); // 仮(描画して高さ計測)
        } else if (toolbarRef.current) {
          const h = toolbarRef.current.offsetHeight;
          placedRef.current = true;
          setTimelinePos({ x: r.left + 4, y: Math.round(r.bottom - h - 4) }); // 下端を揃える
        }
        return;
      }
    }
    // 計測できない場合も必ず表示する（後でドラッグ移動可）
    if (!timelinePos) setTimelinePos({ x: 12, y: Math.round(window.innerHeight * 0.6) });
  }, [timelinePos]);

  const handleTimelineDragStart = (e: React.MouseEvent) => {
    if (!timelinePos) return;
    setIsDraggingTimeline(true);
    timelineDragStartRef.current = { x: e.clientX, y: e.clientY, posX: timelinePos.x, posY: timelinePos.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingTimeline) return;
      const dx = e.clientX - timelineDragStartRef.current.x;
      const dy = e.clientY - timelineDragStartRef.current.y;
      setTimelinePos({ x: timelineDragStartRef.current.posX + dx, y: timelineDragStartRef.current.posY + dy });
    };
    const onUp = () => setIsDraggingTimeline(false);
    if (isDraggingTimeline) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingTimeline]);

  useEffect(() => {
    setSidebarWidth(MIN_SIDEBAR_WIDTH);
  }, [setSidebarWidth]);

  // Space でアニメーションの再生/一時停止をトグルする（入力欄にフォーカス中は無効）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      e.preventDefault();
      const { isPlaying, setIsPlaying } = usePlaybackStore.getState();
      setIsPlaying(!isPlaying);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      <div className="grid-cell" style={{ position: 'relative' }} ref={mapCellRef}>
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
        <div className="notes-section"><NotesPanel /></div>
      </div>

      {/* 再生操作盤: フローティングウィンドウ（ドラッグ移動可・既定はMap1の右上隅）。
          .workspace の opacity サブツリー外へ portal して確実に表示する。 */}
      {timelinePos && createPortal(
        <div
          ref={toolbarRef}
          style={{
            position: 'fixed', left: timelinePos.x, top: timelinePos.y, zIndex: 9000,
            width: '480px', maxWidth: '92vw',
            background: '#222', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div
            onMouseDown={handleTimelineDragStart}
            style={{ cursor: isDraggingTimeline ? 'grabbing' : 'grab', padding: '3px', display: 'flex', justifyContent: 'center', background: '#2a2a2a', borderBottom: '1px solid #333' }}
          >
            <div style={{ width: '34px', height: '4px', borderRadius: '2px', background: '#666' }} />
          </div>
          <AnimationTimeline />
        </div>,
        document.body
      )}
    </div>
  );
};
