import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, FloorId, MapNode, Waypoint } from '../store';
import { MapImage } from './common/MapElements';
import { NodeEditModal } from './modals/NodeEditModal';
import { CharacterSelectModal } from './modals/CharacterSelectModal';
import { SuggestionSidebar } from './common/SuggestionSidebar';
import { useStageZoom } from '../hooks/useStageZoom';
import { calculateNodeArrivalTime } from '../utils/animationUtils';
import { findShortestPath } from '../utils/dijkstra';

import { WaypointPanel } from './create/WaypointPanel';
import { MapObjectLayer } from './create/MapObjectLayer';
import { useWaypointPath } from '../hooks/useWaypointPath';
import { MergeModal, MergeCandidate } from './modals/MergeModal';

const generateId = () => Math.random().toString(36).substr(2, 9);

const floorOrder: Record<string, number> = { 'B1': 0, '1F': 1, '2F': 2 };
const sortNodes = (a: MapNode, b: MapNode) => {
    const orderA = floorOrder[a.floor] ?? 99;
    const orderB = floorOrder[b.floor] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '');
};

interface FollowTargetInfo {
    charId: string;
    subsequentWaypoints: Waypoint[];
}

interface CreateViewProps {
    onFloorChange: (floor: FloorId) => void;
    selectedIcons: string[];
    onIconSelect: (icon: string, isShift: boolean) => void;
    onClearSelection: () => void;
}

export const CreateView: React.FC<CreateViewProps> = ({ 
    onFloorChange, selectedIcons, onIconSelect, onClearSelection 
}) => {
  const { 
    activeFloor, mode, isGraphEditMode, nodes, edges, 
    addNode, updateNode, removeNode, addEdge, removeEdge,
    undo, saveHistory, setSidebarWidth,
    saveCharacterAnimation, saveBatchCharacterAnimations, deleteCharacterAnimation,
    activePresetId, presets
  } = useAppStore();

  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<MapNode | null>(null);
  
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dynamicEdgeRef = useRef<Konva.Line>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [suggestionTargetIndex, setSuggestionTargetIndex] = useState<number | null>(null);

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [mergeTargetWaypointName, setMergeTargetWaypointName] = useState("");
  
  const [mergeTargetWaypointId, setMergeTargetWaypointId] = useState(""); 
  const [followTargetInfo, setFollowTargetInfo] = useState<FollowTargetInfo | null>(null);

  const [myCurrentTravelTime, setMyCurrentTravelTime] = useState<number>(0);

  // ▼ 追加: 同期した地点と時間を保持し、パスが伸びても時間がズレないように追従させるためのステート
  const [syncTarget, setSyncTarget] = useState<{ waypointId: string, meetingTime: number } | null>(null);

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
  
  useEffect(() => {
      setIsEditing(false);
      setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      setStartTime(0);
      setConnectingNodeId(null);
      setSyncTarget(null); // キャラ切り替え時に同期ターゲットもリセット
  }, [primaryIcon]);
  
  const savedPathData = useMemo(() => {
    if (!savedDataRaw) return null;
      if (Array.isArray(savedDataRaw)) return savedDataRaw as string[];
      return (savedDataRaw as any).path as string[];
  }, [savedDataRaw]);

  useEffect(() => {
      setWaypoints(prev => prev.map(wp => {
          const matchedNode = nodes.find(n => n.name === wp.name);
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

  // ▼ 追加: 同行等によりパス長が変わった際、指定した同期地点での到着時間がズレないように startTime を自動補正する
  useEffect(() => {
      if (syncTarget && displayPath.length > 0 && isEditing) {
          const tempData = { 
              path: displayPath, 
              startTime: 0, 
              duration: Math.max(displayPath.length * 30, 60), 
              waypoints 
          };
          const travelTime = calculateNodeArrivalTime(tempData, syncTarget.waypointId, nodes);
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
    const updateSize = () => {
      if (containerRef.current) {
        setSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { stageSpec, handleWheel, handleDragEnd } = useStageZoom({ initialScale: 1.0, minScale: 0.1, maxScale: 5.0 });

  const getMapSrc = () => {
    switch(activeFloor) {
      case 'B1': return './maps/floor_b1.png';
      case '1F': return './maps/floor_1.png';
      case '2F': return './maps/floor_2.png';
      default: return './maps/floor_1.png';
    }
  };

  useEffect(() => { 
      const handleKeyDown = (e: KeyboardEvent) => { 
          if ((e.ctrlKey || e.metaKey) && e.key === 'z' && isGraphEditMode) { e.preventDefault(); undo(); } 
          if (e.key === 'Escape' && isGraphEditMode && connectingNodeId) {
              setConnectingNodeId(null);
          }
      }; 
      window.addEventListener('keydown', handleKeyDown); 
      return () => window.removeEventListener('keydown', handleKeyDown); 
  }, [undo, isGraphEditMode, connectingNodeId]);

  useEffect(() => { 
      const stage = stageRef.current; 
      if (stage) {
          const container = stage.container();
          container.style.cursor = isGraphEditMode ? 'crosshair' : 'default'; 
      }
  }, [nodes.length, isGraphEditMode]);
  
  useEffect(() => { setSidebarWidth(210); }, [setSidebarWidth]);

  const handleEdgeContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>, edgeId: string) => {
      e.evt.preventDefault(); e.cancelBubble = true;
      if (isGraphEditMode && window.confirm("この通路(エッジ)を削除しますか？")) removeEdge(edgeId);
  }, [isGraphEditMode, removeEdge]);

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
          next.splice(next.length - 1, 0, { id: '', name: '', stayTime: 0 }); 
          return next; 
      });
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
      setWaypoints(prev => {
          const next = [...prev];
          next[suggestionTargetIndex] = {
              ...next[suggestionTargetIndex],
              name: node.name || "",
              id: node.id
          };
          return next;
      });
  }, [suggestionTargetIndex]);

  const handleEditPath = () => {
      if (!savedDataRaw) return;
      const currentData = Array.isArray(savedDataRaw) ? { path: savedDataRaw, waypoints: undefined, startTime: 0 } : savedDataRaw as any;
      
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

      setStartTime(currentData.startTime || 0);
      setIsEditing(true);
  };

  const handleSyncTime = (waypointId: string, waypointName: string) => {
      if (!waypointId || !activePreset?.data) return;
      
      const tempData = { 
          path: displayPath, 
          startTime: 0, 
          duration: Math.max(displayPath.length * 30, 60), 
          waypoints 
      };
      
      const myTime = calculateNodeArrivalTime(tempData, waypointId, nodes);
      if (myTime === null) return alert("計算不可");
      setMyCurrentTravelTime(myTime);

      const candidates: MergeCandidate[] = [];
      Object.entries(activePreset.data).forEach(([cid, data]: [string, any]) => {
          if (selectedIcons.includes(cid)) return;
          const cData = Array.isArray(data) ? { path: data, startTime: 0, duration: data.length * 30 } : data;
          const arrival = calculateNodeArrivalTime(cData, waypointId, nodes);
          if (arrival !== null) {
              const currentStart = cData.startTime || 0;
              const travelTime = arrival - currentStart;
              candidates.push({ 
                  charId: cid, 
                  arrivalTime: arrival, 
                  currentStartTime: currentStart,
                  travelTime: travelTime,
                  data: cData 
              });
          }
      });

      if (!candidates.length) return alert(`「${waypointName}」を通る他のキャラクターが見つかりませんでした。`);
      
      setMergeCandidates(candidates);
      setMergeTargetWaypointName(waypointName);
      setMergeTargetWaypointId(waypointId);
      setIsMergeModalOpen(true);
  };

  const handleMergeConfirm = (selectedIds: string[]) => {
      const targets = mergeCandidates.filter(c => selectedIds.includes(c.charId));
      if (targets.length === 0) {
          setIsMergeModalOpen(false);
          return;
      }
      
      if (!isEditing) setIsEditing(true);

      const myAbsArrival = startTime + myCurrentTravelTime;
      const allArrivalTimes = [myAbsArrival, ...targets.map(t => t.arrivalTime)];
      const meetingTime = Math.max(...allArrivalTimes);

      // ▼ 修正: ここで同期ターゲットを記録することで、のちにパスが伸びても時間がズレないようにする
      setSyncTarget({ waypointId: mergeTargetWaypointId, meetingTime });

      const newMyStartTime = meetingTime - myCurrentTravelTime;
      setStartTime(newMyStartTime);

      targets.forEach(target => {
          const newTargetStartTime = meetingTime - target.travelTime;
          const targetPath = target.data.path || (Array.isArray(target.data) ? target.data : []);
          const targetWaypoints = target.data.waypoints || [];

          if (newTargetStartTime !== target.currentStartTime) {
              saveCharacterAnimation(
                  activePresetId,
                  target.charId,
                  targetPath,
                  targetWaypoints,
                  newTargetStartTime
              );
          }
      });
      setIsMergeModalOpen(false);

      const followTarget = targets[0]; 
      const targetWaypoints = followTarget.data.waypoints || [];
      const targetPath = followTarget.data.path || (Array.isArray(followTarget.data) ? followTarget.data : []);
      
      const targetPathIndex = targetPath.indexOf(mergeTargetWaypointId);

      if (targetPathIndex !== -1) {
          const subsequentWaypoints = targetWaypoints.filter((wp: Waypoint) => {
              const wpPathIndex = targetPath.indexOf(wp.id);
              return wpPathIndex > targetPathIndex;
          });

          if (subsequentWaypoints.length > 0) {
              setFollowTargetInfo({
                  charId: followTarget.charId,
                  subsequentWaypoints: subsequentWaypoints
              });
          }
      }
  };

  const handleSavePath = () => {
      if (!displayPath.length || !selectedIcons.length) return;
      const validWp = waypoints.filter(wp => wp.id !== "");
      if (selectedIcons.length === 1) saveCharacterAnimation(activePresetId, selectedIcons[0], displayPath, validWp, startTime);
      else saveBatchCharacterAnimations(activePresetId, selectedIcons, displayPath, validWp, startTime);
      setConnectingNodeId(null); setIsEditing(false);
  };
  const handleDeletePath = () => { 
      if(selectedIcons.length && window.confirm("削除?")){ 
          selectedIcons.forEach(i => deleteCharacterAnimation(activePresetId, i)); 
          setDisplayPath([]); 
          setDisplaySegments([]);
          setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      } 
  };
  
  const handleModalClose = () => { setIsCharModalOpen(false); setIsMultiSelectMode(false); };

  const handleCharSelect = (icon: string) => { onIconSelect(icon, false); handleModalClose(); saveCharacterAnimation(activePresetId, icon, displayPath, waypoints.filter(w=>w.id), startTime); setConnectingNodeId(null); };
  const handleMultiSelect = (icons: string[]) => { handleModalClose(); if(icons.length) saveBatchCharacterAnimations(activePresetId, icons, displayPath, waypoints.filter(w=>w.id), startTime); setConnectingNodeId(null); };

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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
            onClearSelection();
            return;
        }
    }

    if (!isGraphEditMode) return;
    if (e.target.getClassName() !== 'Image') return;
    
    setConnectingNodeId(null);
    const stage = e.target.getStage();
    const pointer = stage?.getRelativePointerPosition();
    if (pointer) addNode({ id: generateId(), x: pointer.x, y: pointer.y, floor: activeFloor, type: 'pass' });
  }, [isGraphEditMode, suggestionTargetIndex, activeFloor, addNode, selectedIcons.length, onClearSelection, connectingNodeId]);

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

  const handleNodeClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => {
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
          const node = nodeMap[nodeId];
          if (connectingNodeId === null) {
              if (node?.type === 'stair' && node.connectedFloor) { onFloorChange(node.connectedFloor); return; }
              setConnectingNodeId(nodeId);
          } else {
              if (connectingNodeId !== nodeId) addEdge({ id: generateId(), nodeA: connectingNodeId, nodeB: nodeId, floor: activeFloor });
              setConnectingNodeId(null);
          }
          return;
      } 
      
      else {
          const node = nodeMap[nodeId];
          if (!node) return;

          if (node.type === 'stair' && node.connectedFloor) { 
              onFloorChange(node.connectedFloor); 
              return; 
          }

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
  }, [isGraphEditMode, connectingNodeId, nodeMap, activeFloor, isEditing, suggestionTargetIndex, waypoints, onFloorChange, addEdge]);

  const handleNodeMouseEnter = useCallback((e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => {
      setHoveredNodeId(nodeId);
      const stage = e.target.getStage();
      if (stage) {
          const container = stage.container();
          container.style.cursor = 'pointer';
      }
      e.target.scale({x: 1.5, y: 1.5});
  }, []);

  const handleNodeMouseLeave = useCallback((e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => {
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

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: '#111' }}>
      <div ref={containerRef} style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {size.width > 0 && size.height > 0 && (
            <Stage ref={stageRef} width={size.width} height={size.height} draggable={!isGraphEditMode}
                scaleX={stageSpec.scale} scaleY={stageSpec.scale} x={stageSpec.x} y={stageSpec.y}
                onWheel={handleWheel} onDragEnd={handleDragEnd} 
                onClick={handleStageClick} 
                onMouseMove={handleStageMouseMove}
                onContextMenu={(e) => e.evt.preventDefault()} style={{ cursor: isGraphEditMode ? 'crosshair' : 'default' }}>
                <Layer>
                    <MapImage src={getMapSrc()} />
                    <MapObjectLayer 
                        nodes={nodes} 
                        nodeMap={nodeMap}
                        edges={edges} activeFloor={activeFloor}
                        isGraphEditMode={isGraphEditMode} mode={mode}
                        pathSegments={isGraphEditMode ? [] : displaySegments} 
                        highlightedPath={isGraphEditMode ? [] : displayPath}
                        connectingNodeId={connectingNodeId} hoveredNodeId={hoveredNodeId}
                        waypoints={waypoints} handleEdgeContextMenu={handleEdgeContextMenu}
                        onNodeClick={handleNodeClick}
                        onNodeMouseEnter={handleNodeMouseEnter}
                        onNodeMouseLeave={handleNodeMouseLeave}
                        onNodeDragMove={handleNodeDragMove}
                        onNodeDragEnd={handleNodeDragEnd}
                    />
                    {isGraphEditMode && connectingNodeId && nodeMap[connectingNodeId] && (
                        <Line
                            ref={dynamicEdgeRef}
                            points={[
                                nodeMap[connectingNodeId].x, 
                                nodeMap[connectingNodeId].y, 
                                nodeMap[connectingNodeId].x, 
                                nodeMap[connectingNodeId].y
                            ]}
                            stroke="#007acc"
                            strokeWidth={3}
                            dash={[5, 5]}
                            listening={false}
                        />
                    )}
                </Layer>
            </Stage>
        )}

        <WaypointPanel 
            isGraphEditMode={isGraphEditMode} selectedIcons={selectedIcons}
            highlightedPath={displayPath} savedPathData={savedPathData} isEditing={isEditing}
            startTime={startTime} setStartTime={setStartTime} waypoints={waypoints}
            handleWaypointChange={handleWaypointChange} setSuggestionTargetIndex={setSuggestionTargetIndex}
            handleSyncTime={handleSyncTime} handleRemoveWaypoint={handleRemoveWaypoint}
            handleAddWaypoint={handleAddWaypoint} handleSavePath={handleSavePath}
            handleEditPath={handleEditPath} handleDeletePath={handleDeletePath}
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
                      const appended = waypointsToAppend.map(wp => ({ ...wp }));
                      return [...next, ...appended];
                  });
                  setIsEditing(true);
              }
              setFollowTargetInfo(null);
          }}
      />

      <NodeEditModal isOpen={!!editingNode} initialType={editingNode?.type||'pass'} initialFloor={editingNode?.connectedFloor} initialName={editingNode?.name}
        onClose={()=>setEditingNode(null)} onSave={(t,f,n)=>{if(editingNode){saveHistory();updateNode(editingNode.id,{x:editingNode.x,y:editingNode.y},{type:t,connectedFloor:f,name:n});setEditingNode(null);}}}
        onDelete={()=>{if(editingNode&&window.confirm("削除?")){removeNode(editingNode.id);setConnectingNodeId(null);}setEditingNode(null);}} />
      
      <CharacterSelectModal isOpen={isCharModalOpen} isMultiSelect={isMultiSelectMode} onClose={handleModalClose}
        onSelect={handleCharSelect} onMultiSelect={handleMultiSelect} />
    </div>
  );
};

const formatCharName = (charId: string) => {
    let name = charId.replace(/\.[^/.]+$/, ""); 
    const parts = name.split('_');
    if (parts.length > 1 && !isNaN(Number(parts[0]))) {
        parts.shift(); 
    }
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const FollowConfirmModal: React.FC<{
    info: FollowTargetInfo | null;
    onClose: () => void;
    onConfirm: (waypointsToAppend: Waypoint[]) => void;
}> = ({ info, onClose, onConfirm }) => {
    if (!info) return null;
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    useEffect(() => {
        setSelectedIndex(-1);
    }, [info]);

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
                            <span>{wp.name || wp.id} まで同行</span>
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