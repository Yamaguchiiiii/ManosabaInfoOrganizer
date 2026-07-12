import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, FloorId, MapNode, Waypoint } from '../store';
import { MapImage } from './common/MapElements';
import { NodeEditModal } from './modals/NodeEditModal';
import { CharacterSelectModal } from './modals/CharacterSelectModal';

import { WaypointPanel } from './create/WaypointPanel';
import { RouteDock } from './create/RouteDock';
import { FollowConfirmModal } from './create/FollowConfirmModal';
import { MapObjectLayer, MapPointerKonvaEvent } from './create/MapObjectLayer';
import { useRouteEditor } from '../hooks/useRouteEditor';
import { useResponsiveQuadGrid } from '../hooks/useResponsiveQuadGrid';
import { useViewport } from '../hooks/useViewport';
import { AdSlot } from './AdSlot';
import { MergeModal } from './modals/MergeModal';
import { TOUR_TARGETS } from './tutorial/tourTargets';

const generateId = () => Math.random().toString(36).substr(2, 9);

// タッチ(TouchEvent)には button が無い。MouseEvent のときだけ button を判定する。#23-A
const isMouseEvt = (e: MapPointerKonvaEvent): e is Konva.KonvaEventObject<MouseEvent> =>
    e.evt instanceof MouseEvent;
const isRightButton = (e: MapPointerKonvaEvent): boolean => isMouseEvt(e) && e.evt.button === 2;
// 主ボタン以外(中/右)のマウスクリックだけ弾く。タッチは常に主入力として通す。
const isSecondaryMouse = (e: MapPointerKonvaEvent): boolean => isMouseEvt(e) && e.evt.button !== 0;
// C-1(ピンチ)/C-2(長押し)直後の合成タップを無視するためのゲート。stage attr に期限時刻を積む。
const isTapSuppressed = (e: MapPointerKonvaEvent): boolean => {
    const stage = e.target.getStage();
    const until = stage ? ((stage.getAttr('suppressTapUntil') as number | undefined) ?? 0) : 0;
    return Date.now() < until;
};

const mapSrcFor = (floor: FloorId): string => {
    switch (floor) {
        case 'B1': return './maps/floor_b1.png';
        case '1F': return './maps/floor_1.png';
        case '2F': return './maps/floor_2.png';
        default: return './maps/floor_1.png';
    }
};

// 4ペインの1フロア分。自前の Stage / ズーム / コンテナ計測を持つ。
// 編集対象フロアは props.floorId で明示し、ホバーで onHover(floorId) を通知する。
interface FloorPaneProps {
    floorId: FloorId;
    label: string;
    isActive: boolean;
    onHover: (f: FloorId) => void;
    nodes: MapNode[];
    nodeMap: Record<string, MapNode>;
    edges: ReturnType<typeof useAppStore.getState>['edges'];
    isGraphEditMode: boolean;
    mode: string;
    displaySegments: string[][];
    displayPath: string[];
    connectingNodeId: string | null;
    hoveredNodeId: string | null;
    waypoints: Waypoint[];
    dynamicEdgeRef: React.RefObject<Konva.Line | null>;
    onStageClick: (e: MapPointerKonvaEvent, floor: FloorId) => void;
    onStageMouseMove: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
    onNodeClick: (e: MapPointerKonvaEvent, nodeId: string, floor: FloorId) => void;
    onNodeMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => void;
    onNodeMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => void;
    onNodeDragMove: (e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => void;
    onNodeDragEnd: (e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => void;
    onEdgeContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, edgeId: string) => void;
    // C-2: グラフ編集モードの長押し(=右クリック相当)
    onNodeTouchStart?: (e: Konva.KonvaEventObject<TouchEvent>, nodeId: string) => void;
    onNodeTouchEnd?: () => void;
    onEdgeTouchStart?: (e: Konva.KonvaEventObject<TouchEvent>, edgeId: string) => void;
    onEdgeTouchEnd?: () => void;
    // §A-3/C-1: モバイル単一ペインでのみ true。タッチヒット領域底上げ + ピンチズームを有効にする。
    interactiveZoom?: boolean;
}

const FloorPane: React.FC<FloorPaneProps> = ({
    floorId, label, isActive, onHover,
    nodes, nodeMap, edges, isGraphEditMode, mode,
    displaySegments, displayPath, connectingNodeId, hoveredNodeId, waypoints, dynamicEdgeRef,
    onStageClick, onStageMouseMove, onNodeClick, onNodeMouseEnter, onNodeMouseLeave,
    onNodeDragMove, onNodeDragEnd, onEdgeContextMenu,
    onNodeTouchStart, onNodeTouchEnd, onEdgeTouchStart, onEdgeTouchEnd,   // C-2
    interactiveZoom,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    // #06/28-6:04-1: 4ペインのマップはズーム不要。マップ自然サイズをペインにフィット（中央寄せ）するだけ。
    const [mapNat, setMapNat] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const update = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.offsetWidth;
            const h = containerRef.current.offsetHeight;
            setSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h });
        };
        update();
        const obs = new ResizeObserver(update);
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const fitScale = (mapNat.w > 0 && mapNat.h > 0 && size.width > 0 && size.height > 0)
        ? Math.min(size.width / mapNat.w, size.height / mapNat.h) : 1;
    const fitX = (size.width - mapNat.w * fitScale) / 2;
    const fitY = (size.height - mapNat.h * fitScale) / 2;

    // C-1: モバイルの2本指ピンチズーム/パン。null = fit 表示（従来）。
    const [view, setView] = useState<{ scale: number; x: number; y: number } | null>(null);
    const lastCenterRef = useRef<{ x: number; y: number } | null>(null);
    const lastDistRef = useRef(0);
    useEffect(() => { setView(null); lastCenterRef.current = null; lastDistRef.current = 0; }, [floorId]);

    const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
        if (!interactiveZoom || e.evt.touches.length < 2) {
            onStageMouseMove(e);   // 1本指: 連結中の動的エッジ線プレビュー（従来動作）
            return;
        }
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        // ピンチ操作中および直後の tap を握りつぶす（指を離した瞬間の誤タップ防止）#23-A
        stage.setAttr('suppressTapUntil', Date.now() + 400);
        const t1 = e.evt.touches[0], t2 = e.evt.touches[1];
        const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (!lastCenterRef.current || lastDistRef.current === 0) {
            lastCenterRef.current = center;
            lastDistRef.current = dist;
            return;
        }
        const cur = view ?? { scale: fitScale, x: fitX, y: fitY };
        const newScale = Math.min(Math.max(cur.scale * (dist / lastDistRef.current), fitScale), fitScale * 8);
        const rect = stage.container().getBoundingClientRect();
        const centerOnStage = { x: center.x - rect.left, y: center.y - rect.top };
        // ピンチ中心を不動点にズームし、中心の移動分だけパンする
        const pointTo = { x: (centerOnStage.x - cur.x) / cur.scale, y: (centerOnStage.y - cur.y) / cur.scale };
        const dx = center.x - lastCenterRef.current.x;
        const dy = center.y - lastCenterRef.current.y;
        setView({ scale: newScale, x: centerOnStage.x - pointTo.x * newScale + dx, y: centerOnStage.y - pointTo.y * newScale + dy });
        lastCenterRef.current = center;
        lastDistRef.current = dist;
    };
    const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
        if (e.evt.touches.length < 2) { lastCenterRef.current = null; lastDistRef.current = 0; }
    };

    const effScale = view?.scale ?? fitScale;
    const effX = view?.x ?? fitX;
    const effY = view?.y ?? fitY;

    const showDynamic = isGraphEditMode && !!connectingNodeId && nodeMap[connectingNodeId]?.floor === floorId;

    return (
        <div
            ref={containerRef}
            onMouseEnter={() => onHover(floorId)}
            onPointerDown={() => onHover(floorId)}
            style={{
                position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                background: '#222', boxSizing: 'border-box',
                border: isActive ? '2px solid #007acc' : '2px solid #333'
            }}
        >
            <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 12, pointerEvents: 'none' }}>
                {label}
            </div>
            {interactiveZoom && view && (
                <button
                    className="floorpane-zoom-reset"
                    onClick={() => setView(null)}
                    title="表示をリセット"
                    aria-label="ズームをリセット"
                >⤢</button>
            )}
            {size.width > 0 && size.height > 0 && (
                <Stage
                    width={size.width} height={size.height}
                    scaleX={effScale} scaleY={effScale} x={effX} y={effY}
                    onClick={(e) => onStageClick(e, floorId)}
                    onTap={(e) => onStageClick(e, floorId)}
                    onMouseMove={onStageMouseMove}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onContextMenu={(e) => e.evt.preventDefault()}
                    style={{ cursor: isGraphEditMode ? 'crosshair' : 'default' }}
                >
                    <Layer>
                        <MapImage src={mapSrcFor(floorId)} onLoad={(w, h) => setMapNat(prev => (prev.w === w && prev.h === h) ? prev : { w, h })} />
                        <MapObjectLayer
                            nodes={nodes}
                            nodeMap={nodeMap}
                            edges={edges} activeFloor={floorId}
                            isGraphEditMode={isGraphEditMode} mode={mode}
                            pathSegments={isGraphEditMode ? [] : displaySegments}
                            highlightedPath={isGraphEditMode ? [] : displayPath}
                            connectingNodeId={connectingNodeId} hoveredNodeId={hoveredNodeId}
                            waypoints={waypoints} handleEdgeContextMenu={onEdgeContextMenu}
                            onNodeClick={(e, nodeId) => onNodeClick(e, nodeId, floorId)}
                            onNodeMouseEnter={onNodeMouseEnter}
                            onNodeMouseLeave={onNodeMouseLeave}
                            onNodeDragMove={onNodeDragMove}
                            onNodeDragEnd={onNodeDragEnd}
                            onNodeTouchStart={onNodeTouchStart}
                            onNodeTouchEnd={onNodeTouchEnd}
                            onEdgeTouchStart={onEdgeTouchStart}
                            onEdgeTouchEnd={onEdgeTouchEnd}
                            touchHitScale={interactiveZoom ? effScale : undefined}
                            showNodeNames={interactiveZoom}
                        />
                        {showDynamic && nodeMap[connectingNodeId!] && (
                            <Line
                                ref={dynamicEdgeRef}
                                points={[nodeMap[connectingNodeId!].x, nodeMap[connectingNodeId!].y, nodeMap[connectingNodeId!].x, nodeMap[connectingNodeId!].y]}
                                stroke="#007acc" strokeWidth={3} dash={[5, 5]} listening={false}
                            />
                        )}
                    </Layer>
                </Stage>
            )}
        </div>
    );
};

interface CreateViewProps {
    onFloorChange: (floor: FloorId) => void;
}

export const CreateView: React.FC<CreateViewProps> = ({
    onFloorChange
}) => {
  const {
    activeFloor, setActiveFloor, mode, isGraphEditMode, nodes, edges,
    addNode, updateNode, removeNode, addEdge, removeEdge,
    undo, saveHistory, setSidebarWidth,
    saveCharacterAnimation, saveBatchCharacterAnimations, deleteCharacterAnimation,
    activePresetId, presets, addPresetEvent,
    showConfirm, showAlert, showDialog,
    isSkullMode, setSkullMode,
    selectedIcons, selectIcon, clearIconSelection,
    setGraphEditMode,
  } = useAppStore();

  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<MapNode | null>(null);

  // 4ペイン化: 各ペイン(FloorPane)が自前のStage/ズーム/計測を持つため、ここでの単一Stage用の
  // stageRef/containerRef/size は不要になった。連結中の動的エッジ線の ref のみ共有する。
  const dynamicEdgeRef = useRef<Konva.Line>(null);

  // #06/28-3:58-8: ウィンドウサイズに応じて 2x2 / 縦1x4 / 横4x1 をマップ最大化で切替
  const gridRef = useRef<HTMLDivElement>(null);
  const { gridStyle } = useResponsiveQuadGrid(gridRef);

  // 高速検索用マップ
  const nodeMap = useMemo(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      return map;
  }, [nodes]);

  // 経路データ（waypoints/開始条件/sync/保存・編集・削除ハンドラ）一式。#R2
  const {
      isCharModalOpen, isMultiSelectMode, isEditing, setIsEditing,
      startRef, setStartRef, showBeforeStart, setShowBeforeStart,
      suggestionTargetIndex, setSuggestionTargetIndex,
      isMergeModalOpen, setIsMergeModalOpen, mergeCandidates, mergeTargetWaypointName,
      followTargetInfo, setFollowTargetInfo,
      syncConstraints, waypoints, setWaypoints,
      displayPath, displaySegments,
      matchedNodes, otherNodes,
      savedPathData, startRefCharOptions, startRefNodeOptions,
      handleWaypointChange, handleAddWaypoint, handleRemoveWaypoint, handleSelectSuggestion,
      handleEditPath, handleSyncTime, handleMergeConfirm, handleRemoveSyncConstraint,
      handleSavePath, handleDeletePath, handleModalClose,
      handleCharSelect, handleMultiSelect,
  } = useRouteEditor({
      nodes, edges, nodeMap, selectedIcons, selectIcon, activePresetId, presets,
      saveCharacterAnimation, saveBatchCharacterAnimations, deleteCharacterAnimation, addPresetEvent,
      showConfirm, showAlert, showDialog, setConnectingNodeId,
  });

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
          if (useAppStore.getState().dialog) return; // ダイアログ表示中は背後のUndo等を無効化（revise2 №29）
          if ((e.ctrlKey || e.metaKey) && e.key === 'z' && isGraphEditMode) { e.preventDefault(); undo(); }
          if (e.key === 'Escape' && isGraphEditMode && connectingNodeId) {
              setConnectingNodeId(null);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, isGraphEditMode, connectingNodeId]);

  useEffect(() => { setSidebarWidth(210); }, [setSidebarWidth]);

  const handleEdgeContextMenu = useCallback(async (e: Konva.KonvaEventObject<PointerEvent>, edgeId: string) => {
      e.evt.preventDefault(); e.cancelBubble = true;
      if (isGraphEditMode && await showConfirm("この通路(エッジ)を削除しますか？")) removeEdge(edgeId);
  }, [isGraphEditMode, removeEdge, showConfirm]);

  // C-2: タッチの長押しを右クリック相当にする（ノード=編集モーダル / エッジ=削除確認）。
  // 長押し成立時は stage attr で後続の tap を握りつぶす（§A の isTapSuppressed が見る）。
  const nodePressRef = useRef<number | null>(null);
  const edgePressRef = useRef<number | null>(null);
  const cancelNodePress = useCallback(() => {
      if (nodePressRef.current !== null) { window.clearTimeout(nodePressRef.current); nodePressRef.current = null; }
  }, []);
  const cancelEdgePress = useCallback(() => {
      if (edgePressRef.current !== null) { window.clearTimeout(edgePressRef.current); edgePressRef.current = null; }
  }, []);

  const handleNodeTouchStart = useCallback((e: Konva.KonvaEventObject<TouchEvent>, nodeId: string) => {
      if (!isGraphEditMode) return;
      const stage = e.target.getStage();
      cancelNodePress();
      nodePressRef.current = window.setTimeout(() => {
          nodePressRef.current = null;
          stage?.setAttr('suppressTapUntil', Date.now() + 600);
          const node = nodeMap[nodeId];
          if (node) setEditingNode(node);
      }, 500);
  }, [isGraphEditMode, nodeMap, cancelNodePress]);

  const handleEdgeTouchStart = useCallback((e: Konva.KonvaEventObject<TouchEvent>, edgeId: string) => {
      if (!isGraphEditMode) return;
      const stage = e.target.getStage();
      cancelEdgePress();
      edgePressRef.current = window.setTimeout(() => {
          edgePressRef.current = null;
          stage?.setAttr('suppressTapUntil', Date.now() + 600);
          void (async () => {
              if (await showConfirm('この通路(エッジ)を削除しますか？')) removeEdge(edgeId);
          })();
      }, 500);
  }, [isGraphEditMode, removeEdge, showConfirm, cancelEdgePress]);

  const handleStageClick = useCallback((e: MapPointerKonvaEvent, floorOverride?: FloorId) => {
    // 4ペインでは編集対象フロアをペイン(floorOverride)で明示。未指定時は activeFloor。
    const floor = floorOverride ?? activeFloor;
    if (isTapSuppressed(e)) return;   // ピンチ/長押し直後の合成タップは無視 #23-C1/C2
    // 死亡設定モード(どくろ)中にマップがクリックされたら自動解除する
    if (isSkullMode) setSkullMode(false);
    if (isRightButton(e)) {
        if (isGraphEditMode && connectingNodeId) {
            setConnectingNodeId(null);
        }
        return;
    }
    if (isSecondaryMouse(e)) return;

    if (suggestionTargetIndex !== null) setSuggestionTargetIndex(null);

    if (!isGraphEditMode && e.target.getClassName() === 'Image') {
        if (selectedIcons.length === 0) {
            setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
            setIsEditing(false);
            setConnectingNodeId(null);
            clearIconSelection();
            return;
        }
    }

    if (!isGraphEditMode) return;
    if (e.target.getClassName() !== 'Image') return;

    // C-5: 連結中の空クリック/空タップは「キャンセルのみ」。ノードを勝手に増やさない
    if (connectingNodeId) {
        setConnectingNodeId(null);
        return;
    }
    const stage = e.target.getStage();
    const pointer = stage?.getRelativePointerPosition();
    if (pointer) addNode({ id: generateId(), x: pointer.x, y: pointer.y, floor, type: 'pass' });
  }, [isGraphEditMode, suggestionTargetIndex, activeFloor, addNode, selectedIcons.length, clearIconSelection, connectingNodeId, isSkullMode, setSkullMode]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isGraphEditMode || !connectingNodeId || !dynamicEdgeRef.current) return;

      const stage = e.target.getStage();
      const pointer = stage?.getRelativePointerPosition();
      const startNode = nodeMap[connectingNodeId];

      if (pointer && startNode) {
          dynamicEdgeRef.current.points([startNode.x, startNode.y, pointer.x, pointer.y]);
          dynamicEdgeRef.current.getLayer()?.batchDraw();
      }
  }, [isGraphEditMode, connectingNodeId, nodeMap]);

  const handleNodeClick = useCallback((e: MapPointerKonvaEvent, nodeId: string, floorOverride?: FloorId) => {
      const floor = floorOverride ?? activeFloor;
      if (isTapSuppressed(e)) return;   // ピンチ/長押し直後の合成タップは無視 #23-C1/C2
      // 死亡設定モード(どくろ)中にマップ上のノードがクリックされたら自動解除する
      if (isSkullMode) setSkullMode(false);
      if (isRightButton(e)) {
          if (isGraphEditMode) {
              if (connectingNodeId) {
                  setConnectingNodeId(null);
                  return;
              }
              const node = nodeMap[nodeId];
              if (node) {
                  setEditingNode(node);
              }
          }
          return;
      }

      if (isSecondaryMouse(e)) return;
      e.cancelBubble = true;

      if (isGraphEditMode) {
          if (connectingNodeId === null) {
              // #06/28-6:04-5: 4ペイン化により階段クリックでのフロア表示切替は廃止（経路計算はそのまま）。
              setConnectingNodeId(nodeId);
          } else {
              if (connectingNodeId !== nodeId) addEdge({ id: generateId(), nodeA: connectingNodeId, nodeB: nodeId, floor });
              setConnectingNodeId(null);
          }
          return;
      }

      else {
          const node = nodeMap[nodeId];
          if (!node) return;

          // #06/28-6:04-5: 階段クリックでのフロア表示切替は廃止。階段も通常ノード同様に経由地として扱う。

          if (!isEditing) {
              setIsEditing(true);
          }

          let targetIdx = suggestionTargetIndex;

          if (targetIdx === null) {
              const emptyIdx = waypoints.findIndex(wp => wp.id === "");
              if (emptyIdx !== -1) {
                  targetIdx = emptyIdx;
              } else {
                  targetIdx = waypoints.length - 1;
              }
          }

          const isStart = targetIdx === 0;
          const isEnd = targetIdx === waypoints.length - 1;
          const hasName = !!(node.name && node.name.trim());
          const isTargeting = suggestionTargetIndex !== null;

          const displayName = hasName ? node.name! : `Passage ${node.id.substr(0, 4)}`;

          if ((isStart || isEnd) && !hasName && !isTargeting) {
              const hasEmptySlot = waypoints.some(wp => wp.id === "");

              if (!hasEmptySlot) {
                   const insertIndex = waypoints.length - 1;
                   const tmp = [...waypoints];
                   tmp.splice(insertIndex, 0, { id: node.id, name: displayName, stayTime: 0 });
                   setWaypoints(tmp);
                   return;
              } else {
                   const chosenSlot = (waypoints[targetIdx].id === "") ? targetIdx : waypoints.findIndex(wp => wp.id === "");

                   if (chosenSlot !== -1) {
                       const nextWaypoints = [...waypoints];
                       nextWaypoints[chosenSlot] = { ...nextWaypoints[chosenSlot], id: node.id, name: displayName };
                       setWaypoints(nextWaypoints);
                       return;
                   }
              }
          }

          const nextWaypoints = [...waypoints];
          if (targetIdx >= 0 && targetIdx < nextWaypoints.length) {
              nextWaypoints[targetIdx] = { ...nextWaypoints[targetIdx], name: displayName, id: node.id };
              setWaypoints(nextWaypoints);
          }
      }
  }, [isGraphEditMode, connectingNodeId, nodeMap, activeFloor, isEditing, suggestionTargetIndex, waypoints, onFloorChange, addEdge, isSkullMode, setSkullMode]);

  const handleNodeMouseEnter = useCallback((e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => {
      setHoveredNodeId(nodeId);
      const stage = e.target.getStage();
      if (stage) {
          const container = stage.container();
          container.style.cursor = 'pointer';
      }
      e.target.scale({x: 1.5, y: 1.5});
  }, []);

  const handleNodeMouseLeave = useCallback((e: Konva.KonvaEventObject<MouseEvent>, _nodeId: string) => {
      setHoveredNodeId(null);
      const stage = e.target.getStage();
      if (stage) {
          const container = stage.container();
          container.style.cursor = isGraphEditMode ? 'crosshair' : 'default';
      }
      e.target.scale({x: 1, y: 1});
  }, [isGraphEditMode]);

  const handleNodeDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => {
      if (!isGraphEditMode) return;
      updateNode(nodeId, { x: e.target.x(), y: e.target.y() });
  }, [isGraphEditMode, updateNode]);

  const handleNodeDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => {
      if (!isGraphEditMode) return;
      saveHistory();
      updateNode(nodeId, { x: e.target.x(), y: e.target.y() });
  }, [isGraphEditMode, saveHistory, updateNode]);

  const isMobile = useViewport() === 'mobile';
  // FloorPane に渡す共通 props（デスクトップの4ペインとモバイルの単一ペインで共有）
  const floorPaneCommon = {
      nodes, nodeMap, edges, isGraphEditMode, mode,
      displaySegments, displayPath, connectingNodeId, hoveredNodeId,
      waypoints, dynamicEdgeRef,
      onStageClick: handleStageClick,
      onStageMouseMove: handleStageMouseMove,
      onNodeClick: handleNodeClick,
      onNodeMouseEnter: handleNodeMouseEnter,
      onNodeMouseLeave: handleNodeMouseLeave,
      onNodeDragMove: handleNodeDragMove,
      onNodeDragEnd: handleNodeDragEnd,
      onEdgeContextMenu: handleEdgeContextMenu,
      onNodeTouchStart: handleNodeTouchStart,
      onNodeTouchEnd: cancelNodePress,
      onEdgeTouchStart: handleEdgeTouchStart,
      onEdgeTouchEnd: cancelEdgePress,
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: '#111' }}>
      <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {/* 4ペイン(2x2): Animateと同じ配置。各ペインが自前のStage/ズームを持ち、
            ホバーされたペインのフロアを編集対象(activeFloor)とする。右下はハウス広告枠。#06/28-3:58-7 */}
        {isMobile ? (
            // モバイル: 4ペインをやめ、単一フロア + フロア切替セグメント（smartphone.md M3）
            <div data-tour={TOUR_TARGETS.createMaps} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="floor-segment">
                    {(['2F', '1F', 'B1'] as FloorId[]).map(f => (
                        <button key={f} className={activeFloor === f ? 'active' : ''} onClick={() => setActiveFloor(f)}>{f}</button>
                    ))}
                </div>
                <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                    <FloorPane
                        {...floorPaneCommon}
                        floorId={activeFloor}
                        label={`Map (${activeFloor})`}
                        isActive={true}
                        onHover={setActiveFloor}
                        interactiveZoom
                    />
                </div>
                {isGraphEditMode && (
                    <div className="mobile-editbar">
                        <span className="mobile-editbar__label">
                            {connectingNodeId ? '連結中: つなぐ先をタップ（空きタップで解除）' : '🕸 グラフ編集中'}
                        </span>
                        <button className="mobile-editbar__btn" onClick={undo}>↩ Undo</button>
                        <button className="mobile-editbar__btn mobile-editbar__btn--done" onClick={() => setGraphEditMode(false)}>完了</button>
                    </div>
                )}
                {/* 0711 #7: オーバーレイをやめ通常フローの下ペインに。マップは上ペインで常時可視 */}
                <WaypointPanel
                    isGraphEditMode={isGraphEditMode} selectedIcons={selectedIcons}
                    highlightedPath={displayPath} savedPathData={savedPathData} isEditing={isEditing}
                    waypoints={waypoints}
                    suggestionTargetIndex={suggestionTargetIndex}
                    startRef={startRef} setStartRef={setStartRef}
                    showBeforeStart={showBeforeStart} setShowBeforeStart={setShowBeforeStart}
                    startRefCharOptions={startRefCharOptions} startRefNodeOptions={startRefNodeOptions}
                    handleWaypointChange={handleWaypointChange} setSuggestionTargetIndex={setSuggestionTargetIndex}
                    handleSyncTime={handleSyncTime} handleRemoveWaypoint={handleRemoveWaypoint}
                    handleAddWaypoint={handleAddWaypoint} handleSavePath={handleSavePath}
                    handleEditPath={handleEditPath} handleDeletePath={handleDeletePath}
                    syncConstraints={syncConstraints}
                    onRemoveSyncConstraint={handleRemoveSyncConstraint}
                    variant="dock"
                    matchedNodes={matchedNodes}
                    otherNodes={otherNodes}
                    handleSelectSuggestion={handleSelectSuggestion}
                />
            </div>
        ) : (
            /* 4ペイン(2x2): Animateと同じ配置。各ペインが自前のStage/ズームを持ち、
               ホバーされたペインのフロアを編集対象(activeFloor)とする。右下はハウス広告枠。#06/28-3:58-7 */
            <div ref={gridRef} data-tour={TOUR_TARGETS.createMaps} style={{ position: 'absolute', inset: 0, display: 'grid', ...gridStyle, gap: 4, padding: 4, boxSizing: 'border-box' }}>
                {(['2F', '1F', 'B1'] as FloorId[]).map((fl, i) => (
                    <FloorPane
                        {...floorPaneCommon}
                        key={fl}
                        floorId={fl}
                        label={`Map ${i + 1} (${fl})`}
                        isActive={activeFloor === fl}
                        onHover={setActiveFloor}
                    />
                ))}
                {/* 右下: 広告枠。Web版はAdSense、デスクトップ/未設定時はハウス枠にフォールバック。 */}
                <AdSlot />
            </div>
        )}

      </div>

      {!isMobile && (
        <RouteDock
            isGraphEditMode={isGraphEditMode} selectedIcons={selectedIcons}
            highlightedPath={displayPath} savedPathData={savedPathData} isEditing={isEditing}
            waypoints={waypoints}
            suggestionTargetIndex={suggestionTargetIndex}
            startRef={startRef} setStartRef={setStartRef}
            showBeforeStart={showBeforeStart} setShowBeforeStart={setShowBeforeStart}
            startRefCharOptions={startRefCharOptions} startRefNodeOptions={startRefNodeOptions}
            handleWaypointChange={handleWaypointChange} setSuggestionTargetIndex={setSuggestionTargetIndex}
            handleSyncTime={handleSyncTime} handleRemoveWaypoint={handleRemoveWaypoint}
            handleAddWaypoint={handleAddWaypoint} handleSavePath={handleSavePath}
            handleEditPath={handleEditPath} handleDeletePath={handleDeletePath}
            syncConstraints={syncConstraints}
            onRemoveSyncConstraint={handleRemoveSyncConstraint}
            matchedNodes={matchedNodes}
            otherNodes={otherNodes}
            handleSelectSuggestion={handleSelectSuggestion}
        />
      )}

      <MergeModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          onConfirm={handleMergeConfirm}
          candidates={mergeCandidates}
          waypointName={mergeTargetWaypointName}
      />

      <FollowConfirmModal
          info={followTargetInfo}
          onClose={() => setFollowTargetInfo(null)}
          onConfirm={(waypointsToAppend) => {
              if (waypointsToAppend.length > 0) {
                  setWaypoints(prev => {
                      const next = [...prev];
                      if (next.length > 0 && next[next.length - 1].id === '') {
                          next.pop();
                      }
                      const mergeId = next.length > 0 ? next[next.length - 1].id : '';
                      // displayLabel など余分なフィールドを落として純粋な Waypoint として追加。
                      // 合流地点と重複する先頭の追従地点は除外する（Goalと同じ地点の二重追加を防止）
                      const appended = waypointsToAppend
                          .map(wp => ({ id: wp.id, name: wp.name, stayTime: wp.stayTime }))
                          .filter((wp, i) => !(i === 0 && wp.id === mergeId));
                      return [...next, ...appended];
                  });
                  setIsEditing(true);
              }
              setFollowTargetInfo(null);
          }}
      />

      <NodeEditModal isOpen={!!editingNode} initialType={editingNode?.type||'pass'} initialFloor={editingNode?.connectedFloor} initialName={editingNode?.name}
        onClose={()=>setEditingNode(null)} onSave={(t,f,n)=>{if(editingNode){saveHistory();updateNode(editingNode.id,{x:editingNode.x,y:editingNode.y},{type:t,connectedFloor:f,name:n});setEditingNode(null);}}}
        onDelete={async ()=>{if(editingNode && await showConfirm("このノードを削除しますか？")){removeNode(editingNode.id);setConnectingNodeId(null);}setEditingNode(null);}} />

      <CharacterSelectModal isOpen={isCharModalOpen} isMultiSelect={isMultiSelectMode} onClose={handleModalClose}
        onSelect={handleCharSelect} onMultiSelect={handleMultiSelect} />
    </div>
  );
};
