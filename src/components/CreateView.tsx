import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, FloorId, MapNode, Waypoint, computeDuration } from '../store';
import { MapImage } from './common/MapElements';
import { NodeEditModal } from './modals/NodeEditModal';
import { CharacterSelectModal } from './modals/CharacterSelectModal';
import { SuggestionSidebar } from './common/SuggestionSidebar';
import { useStageZoom } from '../hooks/useStageZoom';
import { calculateNodeArrivalTime, calculateArrivalTimeAtIndex, getNodeArrivalOccurrences } from '../utils/animationUtils';

import { WaypointPanel, SyncConstraint } from './create/WaypointPanel';
import { MapObjectLayer } from './create/MapObjectLayer';
import { useWaypointPath } from '../hooks/useWaypointPath';
import { MergeModal, MergeCandidate } from './modals/MergeModal';
import { setNavigationGuard } from '../services/navigationGuard';

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
    activePresetId, presets,
    showConfirm, showAlert, showDialog,
    isSkullMode, setSkullMode
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
  
  useEffect(() => {
      setIsEditing(false);
      setWaypoints([{ id: '', name: '', stayTime: 0 }, { id: '', name: '', stayTime: 0 }]);
      setStartTime(0);
      setConnectingNodeId(null);
      setSyncTarget(null);
      setSyncConstraints([]);
      // 別キャラの編集で残った地点入力ターゲットをクリアする。
      // これにより行動未設定キャラ選択後、最初の地点クリックが空きスロット先頭(=Start)へ入る。
      setSuggestionTargetIndex(null);
  }, [primaryIcon]);
  
  const savedPathData = useMemo(() => {
    if (!savedDataRaw) return null;
      if (Array.isArray(savedDataRaw)) return savedDataRaw as string[];
      return (savedDataRaw as any).path as string[];
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

      // 保存済みのSync制約を復元し、先頭をアンカーとしてsyncTargetに設定する
      const restoredConstraints: SyncConstraint[] = currentData.syncConstraints || [];
      setSyncConstraints(restoredConstraints);
      if (restoredConstraints.length > 0) {
          setSyncTarget({ waypointId: restoredConstraints[0].waypointId, meetingTime: restoredConstraints[0].meetingTime });
      } else {
          setSyncTarget(null);
      }
      setStartTime(currentData.startTime || 0);
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
      setMyCurrentTravelTime(myTime);
      setMyCurrentSyncPathIndex(myPathIndex);

      // 自分の自然な絶対到達時刻。相手キャラのどの訪問(オカレンス)に合流するかの基準にする。
      const myAbsArrival = startTime + myTime;

      const candidates: MergeCandidate[] = [];
      Object.entries(activePreset.data).forEach(([cid, data]: [string, any]) => {
          if (selectedIcons.includes(cid)) return;
          const cData = Array.isArray(data) ? { path: data, startTime: 0, duration: computeDuration(data, nodes) } : data;
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

  const handleMergeConfirm = (selectedIds: string[]) => {
      const targets = mergeCandidates.filter(c => selectedIds.includes(c.charId));
      if (targets.length === 0) {
          setIsMergeModalOpen(false);
          return;
      }
      
      if (!isEditing) setIsEditing(true);

      const isFirstSync = syncConstraints.length === 0;
      const myAbsArrival = startTime + myCurrentTravelTime;

      let meetingTime: number;
      if (isFirstSync) {
          // 1回目: 全員の到達時刻の最大値を合流時刻とし、自分のstartTimeも調整する
          const allArrivalTimes = [myAbsArrival, ...targets.map(t => t.arrivalTime)];
          meetingTime = Math.max(...allArrivalTimes);
          setSyncTarget({ waypointId: mergeTargetWaypointId, meetingTime, pathIndex: myCurrentSyncPathIndex >= 0 ? myCurrentSyncPathIndex : undefined });
          setStartTime(meetingTime - myCurrentTravelTime);
      } else {
          // 2回目以降: startTimeは1回目のアンカーで固定。自分の自然到達時刻を合流時刻とする
          meetingTime = myAbsArrival;
      }

      setSyncConstraints(prev => {
          const newConstraint: SyncConstraint = {
              waypointId: mergeTargetWaypointId,
              waypointName: mergeTargetWaypointName,
              meetingTime,
              charIds: targets.map(t => t.charId)
          };
          const existingIdx = prev.findIndex(c => c.waypointId === mergeTargetWaypointId);
          if (existingIdx !== -1) {
              const next = [...prev];
              next[existingIdx] = newConstraint;
              return next;
          }
          return [...prev, newConstraint];
      });

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
      const targetWaypoints: Waypoint[] = followTarget.data.waypoints || [];
      const targetPath: string[] = followTarget.data.path || (Array.isArray(followTarget.data) ? followTarget.data : []);
      
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
      if (!displayPath.length || !selectedIcons.length) return;
      const validWp = waypoints.filter(wp => wp.id !== "");
      if (selectedIcons.length === 1) saveCharacterAnimation(activePresetId, selectedIcons[0], displayPath, validWp, startTime, syncConstraints);
      else saveBatchCharacterAnimations(activePresetId, selectedIcons, displayPath, validWp, startTime, syncConstraints);
      setConnectingNodeId(null); setIsEditing(false);
  };

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
          if (choice === 'save') { handleSavePath(); return true; }
          if (choice === 'discard') { return true; }
          return false; // cancel → 遷移中止
      });
      return () => setNavigationGuard(null);
  }, [hasUnsavedPath, showDialog, handleSavePath]);

  const handleDeletePath = async () => {
      if(selectedIcons.length && await showConfirm("この経路を削除しますか？")){
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
  }, [isGraphEditMode, suggestionTargetIndex, activeFloor, addNode, selectedIcons.length, onClearSelection, connectingNodeId, isSkullMode, setSkullMode]);

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