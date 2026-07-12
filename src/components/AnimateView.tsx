import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Line, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import { useCachedImage } from '../services/imageCache';
import { ReadOnlyMapView } from './ReadOnlyMapView';
import { AnimationTimeline } from './AnimationTimeline';
import { NotesPanel } from './NotesPanel';
import '../styles/AnimateView.scss';
import { useAppStore, usePlaybackStore, PRISON_POSITIONS, ICON_FILES, MapNode } from '../store';
import { useAnimationPositions, AnimFloorId } from '../hooks/useAnimationPositions';
import { useResponsiveQuadGrid } from '../hooks/useResponsiveQuadGrid';
import { useViewport } from '../hooks/useViewport';
import { TOUR_TARGETS } from './tutorial/tourTargets';

const ICON_SIZE = 80;
const HALF_SIZE = ICON_SIZE / 2;

// フロアマップ画像の実寸(px)。上ペインをこの比率にフィットさせ、レターボックス(無駄な余白)を
// 出さずに済む高さへ縮めることで、下段の事件ノートへ最大限の高さを譲る。
const MAP_ASPECT: Record<AnimFloorId, number> = {
  '2F': 1239 / 587,
  '1F': 1406 / 761,
  'B1': 1031 / 589,
};

const MovingCharIcon = React.memo(React.forwardRef<Konva.Group, { icon: string, x: number, y: number }>(
    ({ icon, x, y }, ref) => {
        const image = useCachedImage(`./icon/${icon}`);
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
  const presets         = useAppStore(state => state.presets);
  const activePresetId  = useAppStore(state => state.activePresetId);
  const nodes           = useAppStore(state => state.nodes);
  const playbackPinned  = useAppStore(state => state.playbackPinned);

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const isMobile = useViewport() === 'mobile';
  // モバイルは1フロアずつ表示（4ペインは狭すぎるため）。#smartphone.md M2
  const [mobileFloor, setMobileFloor] = useState<AnimFloorId>('1F');
  // モバイル: 下段の事件ノートの折りたたみ（20.md #3）。縦が細い端末は初期折りたたみ
  const [noteCollapsed, setNoteCollapsed] = useState(() => window.innerHeight < 700);
  // モバイル: フロア切替を上部バー（Animate の横）へ portal するためのスロット解決。
  // 独立した .floor-segment 行を廃し、縦の圧迫を1行ぶん解消する。
  const [appbarSlot, setAppbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!isMobile) return;
    setAppbarSlot(document.getElementById('mobile-appbar-slot'));
  }, [isMobile]);

  const nodesMapRef = useRef<Record<string, MapNode>>({});
  useEffect(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      nodesMapRef.current = map;
  }, [nodes]);

  const charNodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const currentVisualPositions = useRef<Record<string, { x: number, y: number, floor: string }>>({});

  // #06/28-3:58-8: ウィンドウサイズに応じて 2x2 / 縦1x4 / 横4x1 をマップ最大化で切替
  const gridRef = useRef<HTMLDivElement>(null);
  const { gridStyle } = useResponsiveQuadGrid(gridRef);

  // 再生操作盤をフローティングウィンドウ化する。デフォルト位置は Map3 B1(左下ペイン)の左下隅。
  const mapCellRef = useRef<HTMLDivElement>(null);     // Map3 B1 セル
  const toolbarRef = useRef<HTMLDivElement>(null);     // 操作盤本体(高さ計測用)
  const placedRef = useRef(false);
  const [timelinePos, setTimelinePos] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Map3 セルの左下隅に操作盤の左下を合わせる。実高さを測るため、仮配置→計測→補正の2段階。
  // playbackPinned中はフローティング自体を描画しないため計測不要（📌でフローティングに戻した時に再計算）。
  useEffect(() => {
    if (playbackPinned) return;
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
  }, [timelinePos, playbackPinned]);

  // revise3 B-6: mousedown+mousemove はタッチで動かせないため Pointer Events へ統一
  const handleTimelineDragStart = (e: React.PointerEvent) => {
    if (!timelinePos) return;
    setIsDraggingTimeline(true);
    timelineDragStartRef.current = { x: e.clientX, y: e.clientY, posX: timelinePos.x, posY: timelinePos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!isDraggingTimeline) return;
      const dx = e.clientX - timelineDragStartRef.current.x;
      const dy = e.clientY - timelineDragStartRef.current.y;
      setTimelinePos({ x: timelineDragStartRef.current.posX + dx, y: timelineDragStartRef.current.posY + dy });
    };
    const onUp = () => setIsDraggingTimeline(false);
    if (isDraggingTimeline) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [isDraggingTimeline]);

  // ウィンドウを縮めてもフローティング再生盤(📌解除時)が画面外に取り残されないようにする（revise2 №18）
  useEffect(() => {
    const onResize = () => {
      setTimelinePos(p => p && ({
        x: Math.min(Math.max(0, p.x), window.innerWidth - 60),
        y: Math.min(Math.max(0, p.y), window.innerHeight - 40),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ui.md P2: ContextPanel は折りたたみで幅を制御できるため、Animate での強制縮小は廃止。
  // （sidebarWidth の強制 set をやめ、ユーザーのパネル幅/折りたたみ設定を尊重する）

  // Space でアニメーションの再生/一時停止をトグルする（入力欄にフォーカス中は無効）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (useAppStore.getState().dialog) return; // ダイアログ表示中は背後の再生を切り替えない（revise2 №29）
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

  // モバイル: 単一フロア + フロア切替セグメント + 下部固定の再生バー（smartphone.md M2）
  if (isMobile) {
    return (
      <div className="animate-mobile">
        {/* フロア切替は上部バー（Animate の横）へ移設（smartphone.md 圧迫対策）。
            マップを縦に広げるため、独立した .floor-segment 行は廃止。 */}
        {appbarSlot && createPortal(
          <div className="appbar-floor-segment">
            {(['2F', '1F', 'B1'] as AnimFloorId[]).map(f => (
              <button
                key={f}
                className={mobileFloor === f ? 'active' : ''}
                onClick={() => setMobileFloor(f)}
              >{f}</button>
            ))}
          </div>,
          appbarSlot
        )}
        <div className="animate-mobile-map" style={{ aspectRatio: `${MAP_ASPECT[mobileFloor]}` }}>
          <ReadOnlyMapView floorId={mobileFloor} fitContainer={true}>
            {mobileFloor === 'B1' && deadIcons.map(icon => {
              const pos = PRISON_POSITIONS[icon];
              if (!pos) return null;
              return (
                <Line key={icon} points={[0, 0, pos.w, 0]} x={pos.x} y={pos.y} rotation={pos.angle || -5} stroke="black" strokeWidth={5} lineCap="round" />
              );
            })}
            {renderAllCharsForFloor(mobileFloor)}
          </ReadOnlyMapView>
        </div>
        <div className={`animate-mobile-note ${noteCollapsed ? 'collapsed' : ''}`}>
          <div className="note-collapse-row">
            <button className="note-collapse-bar" onClick={() => setNoteCollapsed(v => !v)}>
              事件ノート {noteCollapsed ? '▸' : '▾'}
            </button>
            {/* 表示モード(1面/4面/編集)を折りたたみボタンの横へ移設する portal 先。
                旧: Tools の上に専用行があり縦を圧迫していた（CanvasWorkspace(compact) が挿す）。 */}
            <div id="animate-note-viewseg-slot" className="note-viewseg-slot" />
            {/* 0711_2 #2: 選択中オブジェクト操作バーの portal 先（CanvasWorkspace(compact) が挿す）。
                行の高さは固定なので、バーが出ても canvas がピコピコ動かない。 */}
            <div id="animate-note-selection-slot" className="note-selection-slot" />
          </div>
          {!noteCollapsed && <div className="note-body"><NotesPanel /></div>}
        </div>
        <div className="animate-mobile-playbar" data-tour={TOUR_TARGETS.animatePlayback}>
          {/* 0711_2 #4: イベントタップで発生フロアのマップへ切替（時刻シークは AnimationTimeline 内で実施済み） */}
          <AnimationTimeline onEventJump={(ev) => { if (ev.floor) setMobileFloor(ev.floor); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-view-wrapper">
      <div className="animate-view-container" ref={gridRef} style={gridStyle}>
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
      </div>

      {playbackPinned ? (
        // U2: 再生操作盤を workspace 下端に固定するドック（既定）。マップに被る浮遊UIは0。
        <div className="animate-playback-dock" data-tour={TOUR_TARGETS.animatePlayback}>
          <AnimationTimeline />
        </div>
      ) : (
        // 旧: ドラッグ可能フローティング（📌で復帰できる互換モード）。
        // .workspace の opacity サブツリー外へ portal して確実に表示する。
        timelinePos && createPortal(
          <div
            ref={toolbarRef}
            data-tour={TOUR_TARGETS.animatePlayback}
            style={{
              position: 'fixed', left: timelinePos.x, top: timelinePos.y, zIndex: 9000,
              width: '480px', maxWidth: '92vw',
              background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: '8px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              onPointerDown={handleTimelineDragStart}
              style={{ cursor: isDraggingTimeline ? 'grabbing' : 'grab', padding: '3px', display: 'flex', justifyContent: 'center', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-default)', touchAction: 'none' }}
            >
              <div style={{ width: '34px', height: '4px', borderRadius: '2px', background: 'var(--text-disabled)' }} />
            </div>
            <AnimationTimeline />
          </div>,
          document.body
        )
      )}
    </div>
  );
};
