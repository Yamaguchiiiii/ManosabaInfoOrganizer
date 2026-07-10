import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, FloorId, MapNode, Waypoint, StartRef, computeDuration } from '../store';
import { MapImage } from './common/MapElements';
import { NodeEditModal } from './modals/NodeEditModal';
import { CharacterSelectModal } from './modals/CharacterSelectModal';
import { SuggestionSidebar } from './common/SuggestionSidebar';
import { calculateNodeArrivalTime, calculateArrivalTimeAtIndex, getNodeArrivalOccurrences, resolveStartTimes } from '../utils/animationUtils';

import { WaypointPanel, SyncConstraint } from './create/WaypointPanel';
import { MapObjectLayer } from './create/MapObjectLayer';
import { useWaypointPath } from '../hooks/useWaypointPath';
import { useResponsiveQuadGrid } from '../hooks/useResponsiveQuadGrid';
import { useViewport } from '../hooks/useViewport';
import { AdSlot } from './AdSlot';
import { MergeModal, MergeCandidate } from './modals/MergeModal';
import { setNavigationGuard } from '../services/navigationGuard';
import { TOUR_TARGETS } from './tutorial/tourTargets';
import { formatCharName } from '../utils/charName';
import { toast } from '../services/toast';
import { validatePresetSync } from '../utils/syncValidation';

const generateId = () => Math.random().toString(36).substr(2, 9);

const floorOrder: Record<string, number> = { 'B1': 0, '1F': 1, '2F': 2 };
const sortNodes = (a: MapNode, b: MapNode) => {
    const orderA = floorOrder[a.floor] ?? 99;
    const orderB = floorOrder[b.floor] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '');
};

interface FollowWaypoint extends Waypoint {
    displayLabel: string; // 「地点X（2回目）」など、同名地点の訪問回数を含む表示名
}

interface FollowTargetInfo {
    charId: string;
    subsequentWaypoints: FollowWaypoint[];
}

// targetWaypoints（訪問順）を path 上のオカレンス順に解決し、各waypointの出現位置を返す。
// 同一地点を複数回訪れる経路でも正しい時系列インデックスを得る（indexOf の先頭固定問題を回避）。
const resolveWaypointPathIndices = (path: string[], wps: Waypoint[]): number[] => {
    const indices: number[] = [];
    let from = 0;
    for (const wp of wps) {
        let idx = path.indexOf(wp.id, from);
        if (idx === -1) idx = path.indexOf(wp.id); // 順序が崩れている場合のフォールバック
        indices.push(idx);
        if (idx !== -1) from = idx + 1;
    }
    return indices;
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
    onStageClick: (e: Konva.KonvaEventObject<MouseEvent>, floor: FloorId) => void;
    onStageMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    onNodeClick: (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string, floor: FloorId) => void;
    onNodeMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => void;
    onNodeMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => void;
    onNodeDragMove: (e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => void;
    onNodeDragEnd: (e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => void;
    onEdgeContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, edgeId: string) => void;
}

const FloorPane: React.FC<FloorPaneProps> = ({
    floorId, label, isActive, onHover,
    nodes, nodeMap, edges, isGraphEditMode, mode,
    displaySegments, displayPath, connectingNodeId, hoveredNodeId, waypoints, dynamicEdgeRef,
    onStageClick, onStageMouseMove, onNodeClick, onNodeMouseEnter, onNodeMouseLeave,
    onNodeDragMove, onNodeDragEnd, onEdgeContextMenu
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
            {size.width > 0 && size.height > 0 && (
                <Stage
                    width={size.width} height={size.height}
                    scaleX={fitScale} scaleY={fitScale} x={fitX} y={fitY}
                    onClick={(e) => onStageClick(e, floorId)}
                    onMouseMove={onStageMouseMove}
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
  } = useAppStore();

  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<MapNode | null>(null);
  
  // 4ペイン化: 各ペイン(FloorPane)が自前のStage/ズーム/計測を持つため、ここでの単一Stage用の
  // stageRef/containerRef/size は不要になった。連結中の動的エッジ線の ref のみ共有する。
  const dynamicEdgeRef = useRef<Konva.Line>(null);
  // #06/28-14:10-1: ナビゲーションガードから「保存」した際、キャラ未選択ならモーダルでの
  // キャラ選択完了まで遷移を待つためのリゾルバ。
  const pendingSaveResolveRef = useRef<((ok: boolean) => void) | null>(null);

  // #06/28-3:58-8: ウィンドウサイズに応じて 2x2 / 縦1x4 / 横4x1 をマップ最大化で切替
  const gridRef = useRef<HTMLDivElement>(null);
  const gridStyle = useResponsiveQuadGrid(gridRef);

  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  // 開始条件（数値delayの代替）: 「基準キャラが地点に occurrence 回目に到達後 +extraDelay」
  const [startRef, setStartRef] = useState<StartRef | null>(null);
  // 待機中（開始前）もアイコンを表示するか（既定 true）
  const [showBeforeStart, setShowBeforeStart] = useState<boolean>(true);
  const [suggestionTargetIndex, setSuggestionTargetIndex] = useState<number | null>(null);

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [mergeTargetWaypointName, setMergeTargetWaypointName] = useState("");
  
  const [mergeTargetWaypointId, setMergeTargetWaypointId] = useState(""); 
  const [followTargetInfo, setFollowTargetInfo] = useState<FollowTargetInfo | null>(null);

  // ▼ 追加: 同期した地点と時間を保持し、パスが伸びても時間がズレないように追従させるためのステート
  // pathIndex は同期地点が経路上で何番目の訪問かを保持する（同一地点を複数回訪れる経路でアンカーがずれないように）
  const [syncTarget, setSyncTarget] = useState<{ waypointId: string, meetingTime: number, pathIndex?: number } | null>(null);
  const [syncConstraints, setSyncConstraints] = useState<SyncConstraint[]>([]);
  const [myCurrentSyncPathIndex, setMyCurrentSyncPathIndex] = useState<number>(-1);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([
      { id: '', name: '', stayTime: 0 },
      { id: '', name: '', stayTime: 0 }
  ]);

  const { highlightedPath: hookPath, pathSegments: hookSegments } = useWaypointPath(waypoints, nodes, edges);

  const [displayPath, setDisplayPath] = useState<string[]>([]);
  const [displaySegments, setDisplaySegments] = useState<string[][]>([]);

  // 高速検索用マップ
  const nodeMap = useMemo(() => {
      const map: Record<string, MapNode> = {};
      nodes.forEach(n => { map[n.id] = n; });
      return map;
  }, [nodes]);

  const namedNodes = useMemo(() => nodes.filter(n => n.name && n.name.trim() !== "").sort(sortNodes), [nodes]);

  const { matchedNodes, otherNodes } = useMemo(() => {
      const currentText = (suggestionTargetIndex !== null && waypoints[suggestionTargetIndex]) ? waypoints[suggestionTargetIndex].name : "";
      const searchText = currentText.trim().toLowerCase();
      if (!searchText) return { matchedNodes: namedNodes, otherNodes: [] };
      const matched: MapNode[] = [];
      const others: MapNode[] = [];
      namedNodes.forEach(node => {
          if (node.name && node.name.toLowerCase().includes(searchText)) matched.push(node);
          else others.push(node);
      });
      return { matchedNodes: matched, otherNodes: others };
  }, [namedNodes, suggestionTargetIndex, waypoints]);

  const primaryIcon = selectedIcons.length > 0 ? selectedIcons[selectedIcons.length - 1] : null;
  const activePreset = presets.find(p => p.id === activePresetId);
  const savedDataRaw = (primaryIcon && activePreset?.data) ? activePreset.data[primaryIcon] : null;

  // 開始条件ピッカー用: 基準にできる他キャラ（このプリセットで経路を持つ・自分以外）
  const prettyCharName = (cid: string) => cid.replace(/^[0-9]+_/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ');
  const startRefCharOptions = useMemo(() => {
      if (!activePreset?.data) return [] as { id: string; name: string }[];
      return Object.keys(activePreset.data)
          .filter(cid => !selectedIcons.includes(cid))
          .map(cid => ({ id: cid, name: prettyCharName(cid) }));
  }, [activePreset, selectedIcons]);

  // 選択中の基準キャラが通る「名前付き地点」を訪問順（オカレンス付き）で列挙
  const startRefNodeOptions = useMemo(() => {
      const cid = startRef?.charId;
      if (!cid || !activePreset?.data) return [] as { nodeId: string; occurrence: number; label: string }[];
      const path: string[] = activePreset.data[cid]?.path || [];
      // 滞在(連続重複)は1訪問に集約して数える（getNodeVisitTimes と同じ集約）
      const total: Record<string, number> = {};
      { let j = 0; while (j < path.length) { const nid = path[j]; let k = j; while (k + 1 < path.length && path[k + 1] === nid) k++; total[nid] = (total[nid] || 0) + 1; j = k + 1; } }
      const seen: Record<string, number> = {};
      const opts: { nodeId: string; occurrence: number; label: string }[] = [];
      let i = 0;
      while (i < path.length) {
          const nid = path[i];
          let k = i; while (k + 1 < path.length && path[k + 1] === nid) k++;
          const node = nodeMap[nid];
          if (node && node.name && node.name.trim()) {
              const occ = seen[nid] || 0; seen[nid] = occ + 1;
              const label = total[nid] > 1 ? `${node.name}（${occ + 1}回目）` : node.name;
              opts.push({ nodeId: nid, occurrence: occ, label });
          }
          i = k + 1;
      }
      return opts;
  }, [startRef?.charId, activePreset, nodeMap]);
  
  useEffect(() => {
      setIsEditing(false);
      setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      setStartTime(0);
      setStartRef(null);
      setShowBeforeStart(true);
      setConnectingNodeId(null);
      setSyncTarget(null);
      setSyncConstraints([]);
      // 別キャラの編集で残った地点入力ターゲットをクリアする。
      // これにより行動未設定キャラ選択後、最初の地点クリックが空きスロット先頭(=Start)へ入る。
      setSuggestionTargetIndex(null);
  }, [primaryIcon]);
  
  const savedPathData = useMemo(() => {
    if (!savedDataRaw) return null;
      return savedDataRaw.path ?? null;
  }, [savedDataRaw]);

  useEffect(() => {
      setWaypoints(prev => prev.map(wp => {
          // 名前が空のwaypointは名前が空のノードへ誤マッチさせない（Goal未設定時の誤ハイライト防止）
          const trimmedName = wp.name ? wp.name.trim() : "";
          const matchedNode = trimmedName ? nodes.find(n => n.name === wp.name) : undefined;
          if (matchedNode) {
              return { ...wp, id: matchedNode.id };
          }
          else if (wp.id) {
              const currentNode = nodeMap[wp.id];
              if (!currentNode) {
                  return { ...wp, id: '' };
              }
              if (currentNode.name && currentNode.name.trim() !== "") {
                   if (!currentNode.name.startsWith(wp.name)) {
                       return { ...wp, id: '' };
                   }
              }
              return wp;
          }
          return wp;
      }));
  }, [nodes, nodeMap]); 

  useEffect(() => {
    if (isEditing) {
        setDisplayPath(hookPath);
        setDisplaySegments(hookSegments);
    } else {
        if (savedPathData && savedPathData.length > 0) {
            setDisplayPath(savedPathData);
            const segments: string[][] = [];
            for (let i = 0; i < savedPathData.length - 1; i++) {
                segments.push([savedPathData[i], savedPathData[i+1]]);
            }
            setDisplaySegments(segments);
            
            const isWaypointsCleared = waypoints.length === 2 && waypoints[0].id === '' && waypoints[1].id === '';
            if (!isWaypointsCleared) {
                setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
            }
            if (startTime !== 0) setStartTime(0);

        } else {
            setDisplayPath([]);
            setDisplaySegments([]);
            
            const isWaypointsCleared = waypoints.length === 2 && waypoints[0].id === '' && waypoints[1].id === '';
            if (!isWaypointsCleared) {
                setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
            }
            if (startTime !== 0) setStartTime(0);
        }
    }
  }, [isEditing, savedPathData, hookPath, hookSegments, waypoints, startTime]);

  useEffect(() => {
      if (syncTarget && displayPath.length > 0 && isEditing) {
          const tempData = {
              path: displayPath,
              startTime: 0,
              duration: computeDuration(displayPath, nodes),
              waypoints
          };
          // アンカーの pathIndex が現在の経路上でも同じ地点を指しているならその訪問で再計算する。
          // 経路構造が変わって食い違う場合は従来どおり node id の最初の出現で再計算する。
          const pi = syncTarget.pathIndex;
          const useIndex = pi !== undefined && pi >= 0 && pi < displayPath.length && displayPath[pi] === syncTarget.waypointId;
          const travelTime = useIndex
              ? calculateArrivalTimeAtIndex(tempData, pi, nodes)
              : calculateNodeArrivalTime(tempData, syncTarget.waypointId, nodes);
          if (travelTime !== null) {
              const newStartTime = syncTarget.meetingTime - travelTime;
              setStartTime(prev => {
                  // 無限ループ防止のため、値の差がフレーム未満の場合は更新しない
                  if (Math.abs(prev - newStartTime) > 0.01) {
                      return newStartTime;
                  }
                  return prev;
              });
          }
      }
  }, [displayPath, syncTarget, nodes, waypoints, isEditing]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
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

  const handleWaypointChange = (index: number, field: keyof Waypoint, value: string | number) => {
      if (!isEditing) setIsEditing(true);
      setWaypoints(prev => {
          const next = [...prev];
          const updated: Waypoint = { ...next[index], [field]: value };
          if (field === 'name') {
              const match = nodes.find(n => n.name === (value as string));
              updated.id = match ? match.id : '';
          }
          next[index] = updated;
          return next;
      });
  };

  const handleAddWaypoint = () => {
      setWaypoints(prev => {
          const next = [...prev];
          const goal = next[next.length - 1];
          // 現在のGoalの地点を新しい中継地点にコピーし、Goalはクリア
          next.splice(next.length - 1, 0, { id: goal.id, name: goal.name, stayTime: 0 });
          next[next.length - 1] = { id: '', name: '', stayTime: 0 };
          return next;
      });
      // 追加後の新しいGoal(末尾)をターゲットにする。
      // (Add Stop 前にGoalへフォーカスしていた場合、その index が移動した経由地を指してしまうのを防ぐ)
      setSuggestionTargetIndex(waypoints.length);
      setIsEditing(true);
  };
  
  const handleRemoveWaypoint = (index: number) => {
      setWaypoints(prev => { 
          if(prev.length<=2) return prev; 
          const next = [...prev]; 
          next.splice(index, 1); 
          return next; 
      });
      if (suggestionTargetIndex === index) {
          setSuggestionTargetIndex(null);
      } else if (suggestionTargetIndex !== null && suggestionTargetIndex > index) {
          setSuggestionTargetIndex(suggestionTargetIndex - 1);
      }
  };

  const handleSelectSuggestion = useCallback((node: MapNode) => {
      if (suggestionTargetIndex === null) return;
      setIsEditing(true);
      const updated = [...waypoints];
      updated[suggestionTargetIndex] = {
          ...updated[suggestionTargetIndex],
          name: node.name || "",
          id: node.id
      };
      setWaypoints(updated);
      // #06/28-14:10-6: 地点を入力したら、次の空ボックスへターゲットを自動で移動する
      // （移動しないと連続クリックで同じボックスを上書きしてしまう）。空きが無ければ閉じる。
      const nextAfter = updated.findIndex((wp, i) => i > suggestionTargetIndex && wp.id === "");
      const target = nextAfter !== -1 ? nextAfter : updated.findIndex(wp => wp.id === "");
      setSuggestionTargetIndex(target !== -1 ? target : null);
  }, [suggestionTargetIndex, waypoints]);

  const handleEditPath = () => {
      if (!savedDataRaw) return;
      const currentData = savedDataRaw;

      if (currentData.waypoints && currentData.waypoints.length > 0) {
          setWaypoints(currentData.waypoints);
      } else if (currentData.path && currentData.path.length > 0) {
          const path = currentData.path;
          const s = nodeMap[path[0]];
          const e = nodeMap[path[path.length - 1]];
          setWaypoints([{ id: path[0], name: s?.name || "", stayTime: 0 }, { id: path[path.length - 1], name: e?.name || "", stayTime: 0 }]);
      } else {
          setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      }

      // 保存済みのSync制約を復元し、先頭をアンカーとしてsyncTargetに設定する
      const restoredConstraints: SyncConstraint[] = currentData.syncConstraints || [];
      setSyncConstraints(restoredConstraints);
      if (restoredConstraints.length > 0) {
          setSyncTarget({ waypointId: restoredConstraints[0].waypointId, meetingTime: restoredConstraints[0].meetingTime });
      } else {
          setSyncTarget(null);
      }
      setStartTime(currentData.startTime || 0);
      setStartRef(currentData.startRef ? { ...currentData.startRef, phase: currentData.startRef.phase ?? 'arrival' } : null);
      setShowBeforeStart(currentData.showBeforeStart ?? true);
      setIsEditing(true);
  };

  const handleSyncTime = (waypointId: string, waypointName: string, waypointIndex?: number) => {
      if (!waypointId || !activePreset?.data) return;

      const tempData = {
          path: displayPath,
          startTime: 0,
          duration: computeDuration(displayPath, nodes),
          waypoints
      };

      // クリックされた待機点が経路上の「何番目の訪問」かを解決する（同一地点の複数訪問に対応）
      let myPathIndex = -1;
      if (waypointIndex !== undefined && waypointIndex >= 0) {
          const wpIndices = resolveWaypointPathIndices(displayPath, waypoints);
          myPathIndex = wpIndices[waypointIndex] ?? -1;
      }

      let myTime = (myPathIndex >= 0)
          ? calculateArrivalTimeAtIndex(tempData, myPathIndex, nodes)
          : calculateNodeArrivalTime(tempData, waypointId, nodes);
      // Goal未設定などで経路が無い場合（StartだけにB等の地点を入れてsyncした場合）は、
      // その地点に静止して相手を待ち受けるキャラとして扱う。移動はしないので相対移動時間は 0
      // （絶対到達時刻は startTime + 0 = startTime ＝現在のDelayになる）。
      if (myTime === null && displayPath.length < 2) {
          myTime = 0;
          myPathIndex = 0;
      }
      if (myTime === null) { showAlert("到達時刻を計算できませんでした。"); return; }
      setMyCurrentSyncPathIndex(myPathIndex);

      // 自分の自然な絶対到達時刻。相手キャラのどの訪問(オカレンス)に合流するかの基準にする。
      const myAbsArrival = startTime + myTime;

      // 相手キャラの実開始時刻は startRef により動的に決まるため、保存済み startTime ではなく
      // 解決後の開始時刻で到達時刻を計算する（startRef を使う相手とも正しく合流できるように）。#sync-startref
      const resolvedStarts = resolveStartTimes(activePreset.data, nodes);

      const candidates: MergeCandidate[] = [];
      Object.entries(activePreset.data).forEach(([cid, data]) => {
          if (selectedIcons.includes(cid)) return;
          const resolvedStart = resolvedStarts[cid] ?? (data.startTime || 0);
          const cData = { ...data, startTime: resolvedStart };
          // 相手キャラがこの地点を通る「全ての訪問」を取得し、自分の到達時刻に最も近い訪問を合流点に選ぶ。
          // 従来は indexOf(最初の訪問)固定だったため、同一地点を複数回通る複雑Syncで時刻がずれていた。
          // 最も近い訪問を選ぶことで、相手の他の予定（別Sync等）を壊しにくくなる。
          const occurrences = getNodeArrivalOccurrences(cData, waypointId, nodes);
          if (occurrences.length === 0) return;
          let best = occurrences[0];
          for (let k = 1; k < occurrences.length; k++) {
              if (Math.abs(occurrences[k].arrival - myAbsArrival) < Math.abs(best.arrival - myAbsArrival)) {
                  best = occurrences[k];
              }
          }
          const currentStart = cData.startTime || 0;
          candidates.push({
              charId: cid,
              arrivalTime: best.arrival,
              currentStartTime: currentStart,
              travelTime: best.arrival - currentStart,
              data: cData,
              pathIndex: best.pathIndex,
          });
      });

      if (!candidates.length) { showAlert(`「${waypointName}」を通る他のキャラクターが見つかりませんでした。`); return; }
      
      setMergeCandidates(candidates);
      setMergeTargetWaypointName(waypointName);
      setMergeTargetWaypointId(waypointId);
      setIsMergeModalOpen(true);
  };

  const handleMergeConfirm = async (selectedIds: string[]) => {
      const targets = mergeCandidates.filter(c => selectedIds.includes(c.charId));
      if (targets.length === 0) {
          setIsMergeModalOpen(false);
          return;
      }
      
      if (!isEditing) setIsEditing(true);

      // 「自分が相手(同行先)に合わせる」: 合流時刻は相手の到達時刻に揃える。相手は変更しない。
      // 複数選択時は全員が揃う最も遅い到達に合わせる。#sync-startref
      const meetingTime = Math.max(...targets.map(t => t.arrivalTime));

      // この合流が自経路の waypoint の何回目の訪問か（複数地点sync の時刻アンカー解決に使う）
      const myOccurrence = displayPath
          .slice(0, myCurrentSyncPathIndex >= 0 ? myCurrentSyncPathIndex : displayPath.length)
          .filter(id => id === mergeTargetWaypointId).length;

      const newConstraint: SyncConstraint = {
          waypointId: mergeTargetWaypointId,
          waypointName: mergeTargetWaypointName,
          meetingTime,
          charIds: targets.map(t => t.charId),
          occurrence: myOccurrence,
      };
      const existingIdx = syncConstraints.findIndex(c => c.waypointId === mergeTargetWaypointId && (c.occurrence ?? 0) === myOccurrence);
      const nextConstraints = existingIdx !== -1
          ? syncConstraints.map((c, i) => i === existingIdx ? newConstraint : c)
          : [...syncConstraints, newConstraint];
      setSyncConstraints(nextConstraints);

      // 複数地点sync: 開始時刻は「最も手前の合流地点」に揃える（最初の区間は通常速度）。
      // それ以降の区間は Animate 側がアンカー間で速度を変えて各合流時刻を満たす。
      const idxOf = (sc: SyncConstraint) => {
          const occ = sc.occurrence ?? 0; let cnt = 0;
          for (let i = 0; i < displayPath.length; i++) { if (displayPath[i] === sc.waypointId) { if (cnt === occ) return i; cnt++; } }
          return displayPath.indexOf(sc.waypointId);
      };
      let earliest = nextConstraints[0]; let earliestIdx = idxOf(earliest);
      nextConstraints.forEach(c => { const pi = idxOf(c); if (pi >= 0 && (earliestIdx < 0 || pi < earliestIdx)) { earliest = c; earliestIdx = pi; } });
      setSyncTarget({ waypointId: earliest.waypointId, meetingTime: earliest.meetingTime, pathIndex: earliestIdx >= 0 ? earliestIdx : undefined });

      setIsMergeModalOpen(false);

      // #07/04-8: 合流地点で「会話」を記録するか（明示イベント）
      const talk = await showConfirm(
          `合流地点「${mergeTargetWaypointName}」で会話イベントを記録しますか？\n（Animateのイベント一覧に「💬会話」として表示されます）`,
          '会話イベント');
      if (talk) {
          addPresetEvent(activePresetId, {
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              kind: 'talk',
              nodeId: mergeTargetWaypointId,
              nodeName: mergeTargetWaypointName,
              time: meetingTime,
              charIds: [...selectedIcons, ...targets.map(t => t.charId)],
          });
      }

      const followTarget = targets[0];
      const targetWaypoints: Waypoint[] = followTarget.data.waypoints || [];
      const targetPath: string[] = followTarget.data.path || [];
      
      // 合流地点は handleSyncTime で選んだ訪問（オカレンス）に揃える。
      // これにより「同行できる以降の経由地」も正しい訪問以降だけが対象になる。
      const targetPathIndex = followTarget.pathIndex ?? targetPath.indexOf(mergeTargetWaypointId);

      if (targetPathIndex !== -1) {
          const wpIndices = resolveWaypointPathIndices(targetPath, targetWaypoints);

          // 同名地点が複数回出るものだけ「（n回目）」を付与する
          const totalCount: Record<string, number> = {};
          targetWaypoints.forEach((wp: Waypoint) => {
              const key = wp.name || wp.id;
              totalCount[key] = (totalCount[key] || 0) + 1;
          });
          const runningCount: Record<string, number> = {};

          const subsequentWaypoints: FollowWaypoint[] = targetWaypoints
              .map((wp: Waypoint, i: number) => {
                  const key = wp.name || wp.id;
                  runningCount[key] = (runningCount[key] || 0) + 1;
                  const occurrence = runningCount[key];
                  const displayLabel = totalCount[key] > 1 ? `${key}（${occurrence}回目）` : key;
                  return { ...wp, pathIndex: wpIndices[i], displayLabel };
              })
              .filter(item => item.pathIndex > targetPathIndex)
              .sort((a, b) => a.pathIndex - b.pathIndex)
              .map(({ id, name, stayTime, displayLabel }) => ({ id, name, stayTime, displayLabel }));

          if (subsequentWaypoints.length > 0) {
              setFollowTargetInfo({
                  charId: followTarget.charId,
                  subsequentWaypoints
              });
          }
      }
  };

  const handleRemoveSyncConstraint = (index: number) => {
      setSyncConstraints(prev => {
          const next = prev.filter((_, i) => i !== index);
          // アンカーは常に先頭の制約。削除後に残っていれば先頭をsyncTargetに設定する
          if (next.length > 0) {
              setSyncTarget({ waypointId: next[0].waypointId, meetingTime: next[0].meetingTime });
          } else {
              setSyncTarget(null);
          }
          return next;
      });
  };

  const handleSavePath = () => {
      if (!displayPath.length) return;
      // #06/28-6:04-4: キャラ未選択でSave Pathされたら、保存先キャラを選ぶフローティングウィンドウを開く
      if (!selectedIcons.length) { setIsMultiSelectMode(false); setIsCharModalOpen(true); return; }
      const validWp = waypoints.filter(wp => wp.id !== "");
      if (selectedIcons.length === 1) saveCharacterAnimation(activePresetId, selectedIcons[0], displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
      else saveBatchCharacterAnimations(activePresetId, selectedIcons, displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
      setConnectingNodeId(null); setIsEditing(false);

      // 保存後の sync 整合性チェック（B-5）。矛盾は無警告フォールバックされるため人間に提示する。
      const savedName = selectedIcons.length > 1 ? `${selectedIcons.length}体の経路を保存しました` : '経路を保存しました';
      const updated = useAppStore.getState().presets.find(p => p.id === activePresetId)?.data;
      const issues = updated ? validatePresetSync(updated, nodes) : [];
      const errors = issues.filter(i => i.level === 'error');
      const warns = issues.filter(i => i.level === 'warn');
      if (errors.length > 0) {
          showAlert(`${savedName}。\nただし sync 設定に問題があります:\n\n` + [...errors, ...warns].map(i => '• ' + i.message).join('\n'), 'sync 警告');
      } else if (warns.length > 0) {
          toast.info(`${savedName}（sync 警告 ${warns.length}件）`);
      } else {
          toast.success(savedName);
      }
  };

  // #06/28-14:10-1: 保存を要求し、完了したら true を解決する。
  // キャラ選択済みなら即保存して true。未選択ならモーダルを開き、選択(true)/キャンセル(false)まで待つ。
  const requestSaveOrPrompt = useCallback((): Promise<boolean> => {
      if (!displayPath.length) return Promise.resolve(true);
      if (selectedIcons.length) {
          const validWp = waypoints.filter(wp => wp.id !== "");
          if (selectedIcons.length === 1) saveCharacterAnimation(activePresetId, selectedIcons[0], displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
          else saveBatchCharacterAnimations(activePresetId, selectedIcons, displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
          setConnectingNodeId(null); setIsEditing(false);
          return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
          pendingSaveResolveRef.current = resolve;
          setIsMultiSelectMode(false);
          setIsCharModalOpen(true);
      });
  }, [displayPath, selectedIcons, waypoints, activePresetId, startTime, syncConstraints, startRef, showBeforeStart, saveCharacterAnimation, saveBatchCharacterAnimations]);

  // 未保存の経路があるまま別キャラ/別モードへ遷移しようとした際のガードを登録する
  const hasUnsavedPath = isEditing && displayPath.length > 0;
  useEffect(() => {
      if (!hasUnsavedPath) {
          setNavigationGuard(null);
          return;
      }
      setNavigationGuard(async () => {
          const choice = await showDialog({
              title: '未保存の経路があります',
              message: 'このキャラクターの行動がまだ保存されていません。保存しますか？',
              buttons: [
                  { label: 'キャンセル', value: 'cancel' },
                  { label: '保存せず移動', value: 'discard', variant: 'danger' },
                  { label: '保存して移動', value: 'save', variant: 'primary' },
              ]
          });
          // #06/28-14:10-1: 「保存」選択時、キャラ未選択ならモーダルでの選択完了を待ってから遷移を許可する。
          if (choice === 'save') { return await requestSaveOrPrompt(); }
          if (choice === 'discard') { return true; }
          return false; // cancel → 遷移中止
      });
      return () => setNavigationGuard(null);
  }, [hasUnsavedPath, showDialog, requestSaveOrPrompt]);

  const handleDeletePath = async () => {
      if(selectedIcons.length && await showConfirm("この経路を削除しますか？")){
          selectedIcons.forEach(i => deleteCharacterAnimation(activePresetId, i));
          setDisplayPath([]);
          setDisplaySegments([]);
          setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      }
  };
  
  // モーダルを閉じる。保存待ち(ガード由来)があれば「キャンセル＝遷移しない(false)」で解決する。
  const handleModalClose = () => {
      setIsCharModalOpen(false); setIsMultiSelectMode(false);
      if (pendingSaveResolveRef.current) { pendingSaveResolveRef.current(false); pendingSaveResolveRef.current = null; }
  };

  // 保存待ちがあれば「保存完了＝遷移してよい(true)」で解決する。
  const resolvePendingSave = () => {
      if (pendingSaveResolveRef.current) { pendingSaveResolveRef.current(true); pendingSaveResolveRef.current = null; }
  };

  const handleCharSelect = (icon: string) => { void selectIcon(icon, false); setIsCharModalOpen(false); setIsMultiSelectMode(false); saveCharacterAnimation(activePresetId, icon, displayPath, waypoints.filter(w=>w.id), startTime, syncConstraints, startRef, showBeforeStart); setConnectingNodeId(null); setIsEditing(false); resolvePendingSave(); };
  const handleMultiSelect = (icons: string[]) => { setIsCharModalOpen(false); setIsMultiSelectMode(false); if(icons.length) saveBatchCharacterAnimations(activePresetId, icons, displayPath, waypoints.filter(w=>w.id), startTime, syncConstraints, startRef, showBeforeStart); setConnectingNodeId(null); setIsEditing(false); resolvePendingSave(); };

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, floorOverride?: FloorId) => {
    // 4ペインでは編集対象フロアをペイン(floorOverride)で明示。未指定時は activeFloor。
    const floor = floorOverride ?? activeFloor;
    // 死亡設定モード(どくろ)中にマップがクリックされたら自動解除する
    if (isSkullMode) setSkullMode(false);
    if (e.evt.button === 2) {
        if (isGraphEditMode && connectingNodeId) {
            setConnectingNodeId(null);
        }
        return;
    }
    if (e.evt.button !== 0) return;
    
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
    
    setConnectingNodeId(null);
    const stage = e.target.getStage();
    const pointer = stage?.getRelativePointerPosition();
    if (pointer) addNode({ id: generateId(), x: pointer.x, y: pointer.y, floor, type: 'pass' });
  }, [isGraphEditMode, suggestionTargetIndex, activeFloor, addNode, selectedIcons.length, clearIconSelection, connectingNodeId, isSkullMode, setSkullMode]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isGraphEditMode || !connectingNodeId || !dynamicEdgeRef.current) return;
      
      const stage = e.target.getStage();
      const pointer = stage?.getRelativePointerPosition();
      const startNode = nodeMap[connectingNodeId];
      
      if (pointer && startNode) {
          dynamicEdgeRef.current.points([startNode.x, startNode.y, pointer.x, pointer.y]);
          dynamicEdgeRef.current.getLayer()?.batchDraw();
      }
  }, [isGraphEditMode, connectingNodeId, nodeMap]);

  const handleNodeClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, nodeId: string, floorOverride?: FloorId) => {
      const floor = floorOverride ?? activeFloor;
      // 死亡設定モード(どくろ)中にマップ上のノードがクリックされたら自動解除する
      if (isSkullMode) setSkullMode(false);
      if (e.evt.button === 2) {
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

      if (e.evt.button !== 0) return;
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
                    />
                </div>
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
        />
      </div>

      <SuggestionSidebar 
        isOpen={suggestionTargetIndex!==null} 
        targetType={suggestionTargetIndex===0?'start':(suggestionTargetIndex!==null&&suggestionTargetIndex===waypoints.length-1?'end':null)}
        matchedNodes={matchedNodes} 
        otherNodes={otherNodes} 
        selectedNodeId={(suggestionTargetIndex !== null && waypoints[suggestionTargetIndex]) ? (waypoints[suggestionTargetIndex].id || "") : ""}
        onSelect={handleSelectSuggestion} 
        onClose={()=>setSuggestionTargetIndex(null)} 
      />
      
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

const FollowConfirmModal: React.FC<{
    info: FollowTargetInfo | null;
    onClose: () => void;
    onConfirm: (waypointsToAppend: Waypoint[]) => void;
}> = ({ info, onClose, onConfirm }) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    useEffect(() => {
        setSelectedIndex(-1);
    }, [info]);

    if (!info) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 2000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="modal-content" style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #444', width: '450px', maxWidth: '90vw', color: '#ccc' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px', color: '#fff' }}>
                    行動を共にする (Sync & Follow)
                </h3>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                    <strong style={{ color: '#007acc' }}>{formatCharName(info.charId)}</strong> と合流しました。<br/>
                    このまま行動を共にしますか？<br/>
                    共にする場合は、どこまで同行するか選択してください。
                </p>
                
                <div style={{ maxHeight: '200px', overflowY: 'auto', margin: '15px 0', border: '1px solid #444', borderRadius: '4px', padding: '10px', background: '#252526' }}>
                    <label style={{ display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', borderBottom: '1px solid #333' }}>
                        <input 
                            type="radio" 
                            name="follow" 
                            checked={selectedIndex === -1} 
                            onChange={() => setSelectedIndex(-1)} 
                            style={{ marginRight: '10px' }}
                        />
                        <span>同行しない（ここで別れる）</span>
                    </label>
                    {info.subsequentWaypoints.map((wp, i) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', borderBottom: i === info.subsequentWaypoints.length - 1 ? 'none' : '1px solid #333' }}>
                            <input 
                                type="radio" 
                                name="follow" 
                                checked={selectedIndex === i} 
                                onChange={() => setSelectedIndex(i)} 
                                style={{ marginRight: '10px' }}
                            />
                            <span>{wp.displayLabel} まで同行</span>
                        </label>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ background: '#444', border: '1px solid #555', color: 'white', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                        キャンセル
                    </button>
                    <button
                        onClick={() => {
                            if (selectedIndex === -1) {
                                onConfirm([]);
                            } else {
                                onConfirm(info.subsequentWaypoints.slice(0, selectedIndex + 1));
                            }
                        }}
                        style={{ background: '#007acc', border: 'none', color: 'white', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        決定
                    </button>
                </div>
            </div>
        </div>
    );
};