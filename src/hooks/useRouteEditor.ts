import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    useAppStore, MapNode, MapEdge, Waypoint, StartRef, AnimationPreset, DialogRequest, computeDuration,
} from '../store';
import {
    calculateNodeArrivalTime, calculateArrivalTimeAtIndex, getNodeVisitOccurrences, resolveStartTimes,
    precomputePath,
} from '../utils/animationUtils';
import { MOVEMENT_SPEED_PX_PER_SEC, TARGET_FPS } from '../constants';
import { SyncConstraint } from '../components/create/WaypointPanel';
import { FollowTargetInfo, FollowWaypoint } from '../components/create/FollowConfirmModal';
import { MergeCandidate } from '../components/modals/MergeModal';
import { setNavigationGuard } from '../services/navigationGuard';
import { toast } from '../services/toast';
import { validatePresetSync } from '../utils/syncValidation';
import { formatCharName } from '../utils/charName';
import { useWaypointPath } from './useWaypointPath';

const floorOrder: Record<string, number> = { 'B1': 0, '1F': 1, '2F': 2 };
const sortNodes = (a: MapNode, b: MapNode) => {
    const orderA = floorOrder[a.floor] ?? 99;
    const orderB = floorOrder[b.floor] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '');
};

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

// sync 制約群から「アンカーにすべき制約」を選ぶ = 経路上で最も手前（pathIndex最小）のもの。
// handleEditPath / handleRemoveSyncConstraint / handleMergeConfirm の3箇所で使う共通ロジック
// （旧: 各所がバラバラに「制約先頭」を使っており、pathIndex が無いフォールバックで
// startTime がずれていた。revise2 №6）
const pickAnchorTarget = (constraints: SyncConstraint[], path: string[]): { waypointId: string; meetingTime: number; pathIndex: number } | null => {
    if (constraints.length === 0) return null;
    const idxOf = (sc: SyncConstraint) => {
        const occ = sc.occurrence ?? 0; let cnt = 0;
        for (let i = 0; i < path.length; i++) { if (path[i] === sc.waypointId) { if (cnt === occ) return i; cnt++; } }
        return path.indexOf(sc.waypointId);
    };
    let earliest = constraints[0]; let earliestIdx = idxOf(earliest);
    constraints.forEach(c => { const pi = idxOf(c); if (pi >= 0 && (earliestIdx < 0 || pi < earliestIdx)) { earliest = c; earliestIdx = pi; } });
    return { waypointId: earliest.waypointId, meetingTime: earliest.meetingTime, pathIndex: earliestIdx };
};

interface UseRouteEditorArgs {
    nodes: MapNode[];
    edges: MapEdge[];
    nodeMap: Record<string, MapNode>;
    selectedIcons: string[];
    selectIcon: (icon: string, multi: boolean) => Promise<void>;
    activePresetId: string;
    presets: AnimationPreset[];
    saveCharacterAnimation: (presetId: string, charId: string, path: string[], waypoints: Waypoint[], startTime?: number, syncConstraints?: SyncConstraint[], startRef?: StartRef | null, showBeforeStart?: boolean) => void;
    saveBatchCharacterAnimations: (presetId: string, charIds: string[], path: string[], waypoints: Waypoint[], startTime?: number, syncConstraints?: SyncConstraint[], startRef?: StartRef | null, showBeforeStart?: boolean) => void;
    deleteCharacterAnimation: (presetId: string, charId: string) => void;
    addPresetEvent: (presetId: string, ev: { id: string; kind: 'talk'; nodeId: string; nodeName: string; time: number; charIds: string[] }) => void;
    showConfirm: (message: string, title?: string) => Promise<boolean>;
    showAlert: (message: string, title?: string) => Promise<void>;
    showDialog: (req: DialogRequest) => Promise<string>;
    // handleSavePath等の保存系ハンドラは、保存後に「連結中エッジ」表示もリセットする(元CreateView.tsxの挙動を維持)。
    // connectingNodeId自体はマップグラフ編集用のためCreateView.tsx側に残る。
    setConnectingNodeId: (id: string | null) => void;
}

// Create画面の「経路データ」の状態管理一式（waypoints/開始条件/sync/保存/編集/削除）。
// マップ上のクリック処理（handleStageClick/handleNodeClick）はCreateView側に残り、
// このフックが返す setWaypoints 等を呼び出す形で連携する。
export const useRouteEditor = ({
    nodes, edges, nodeMap, selectedIcons, selectIcon, activePresetId, presets,
    saveCharacterAnimation, saveBatchCharacterAnimations, deleteCharacterAnimation, addPresetEvent,
    showConfirm, showAlert, showDialog, setConnectingNodeId,
}: UseRouteEditorArgs) => {
    const pendingSaveResolveRef = useRef<((ok: boolean) => void) | null>(null);
    // 最重要3: 自分の既存 sync 制約から求めた「今回の地点で許される合流時刻の範囲」。
    // handleSyncTime で計算し、handleMergeConfirm の最終検証で使う。
    const lowerBoundRef = useRef<number>(-Infinity);
    const upperBoundRef = useRef<number>(Infinity);

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

    // ▼ 同期した地点と時間を保持し、パスが伸びても時間がズレないように追従させるためのステート
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
    }, [primaryIcon, setConnectingNodeId]);

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
                    segments.push([savedPathData[i], savedPathData[i + 1]]);
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
            if (prev.length <= 2) return prev;
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
        // 地点を入力したら、次の空ボックスへターゲットを自動で移動する
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

        // 保存済みのSync制約を復元し、経路上で最も手前の制約をアンカーとしてsyncTargetに設定する
        const restoredConstraints: SyncConstraint[] = currentData.syncConstraints || [];
        setSyncConstraints(restoredConstraints);
        const restoredPath = currentData.path || [];
        const anchor = pickAnchorTarget(restoredConstraints, restoredPath);
        setSyncTarget(anchor ? { waypointId: anchor.waypointId, meetingTime: anchor.meetingTime, pathIndex: anchor.pathIndex >= 0 ? anchor.pathIndex : undefined } : null);
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
        //
        // ただし resolveStartTimes が見るのは保存済みの activePreset.data のため、未保存の
        // 編集中経路（今 sync しようとしている自分）は反映されない。その結果、自分を startRef で
        // 参照する相手キャラの解決開始時刻が古いままになり、この地点での相手の到達/出発帯（feasible
        // 判定）がズレて「その場では sync できないが、一度保存すると同じ地点で sync できる」不具合に
        // なる。編集中の自分を保存後と同じ状態で重ねてから解決する。
        const liveData: Record<string, unknown> = { ...activePreset.data };
        if (selectedIcons.length > 0) {
            const myLiveEntry = {
                path: displayPath,
                startTime,
                duration: computeDuration(displayPath, nodes),
                waypoints,
                syncConstraints,
                startRef: startRef ?? undefined,
                showBeforeStart,
            };
            selectedIcons.forEach(cid => { liveData[cid] = myLiveEntry; });
        }
        const resolvedStarts = resolveStartTimes(liveData, nodes);

        // 自分の既存 sync 制約から、今回の地点(myPathIndex)で許される合流時刻の範囲を求める。
        // 手前の制約: その時刻 + 通常速度での移動時間より早くは着けない（下限）
        // 後の制約:   そこへ通常速度で間に合う時刻まで（上限）
        // 最初の sync（既存制約なし）は startTime 側が自由に動くため無制限。0711 最重要3
        const spf = MOVEMENT_SPEED_PX_PER_SEC / TARGET_FPS;
        const cached = precomputePath(displayPath, nodes);
        const idxOfConstraint = (sc: SyncConstraint): number => {
            const occ = sc.occurrence ?? 0; let cnt = 0;
            for (let i = 0; i < displayPath.length; i++) {
                if (displayPath[i] === sc.waypointId) { if (cnt === occ) return i; cnt++; }
            }
            return displayPath.indexOf(sc.waypointId);
        };
        let lowerBound = -Infinity, upperBound = Infinity;
        if (myPathIndex >= 0) {
            syncConstraints.forEach(sc => {
                const i = idxOfConstraint(sc);
                if (i < 0 || i === myPathIndex) return;
                const dist = Math.abs((cached.cumulative[myPathIndex] ?? 0) - (cached.cumulative[i] ?? 0));
                if (i < myPathIndex) lowerBound = Math.max(lowerBound, sc.meetingTime + dist / spf);
                else upperBound = Math.min(upperBound, sc.meetingTime - dist / spf);
            });
        }
        lowerBoundRef.current = lowerBound;
        upperBoundRef.current = upperBound;

        const deadIcons = activePreset.deadIcons || [];
        const candidates: MergeCandidate[] = [];
        Object.entries(activePreset.data).forEach(([cid, data]) => {
            if (selectedIcons.includes(cid)) return;
            if (deadIcons.includes(cid)) return; // 死亡キャラは合流候補に出さない（revise2 №9）
            const resolvedStart = resolvedStarts[cid] ?? (data.startTime || 0);
            const cData = { ...data, startTime: resolvedStart };
            // 相手キャラがこの地点を通る「全ての訪問」を列挙し、自分の既存syncと両立できるか(feasible)を
            // 判定した上でユーザーに選ばせる（旧: 最近接1件を自動選択していたため、実現不能な合流
            // 「訪問はt=0の1回だけなのに自動選択され破綻」に気づけなかった。0711 症状5・最重要3）。
            const visits = getNodeVisitOccurrences(cData, waypointId, nodes);
            if (visits.length === 0) return;
            const occurrences = visits.map(v => ({
                ...v,
                // 合流時刻 t は「P が着ける最早 = max(lowerBound, 相手到達)」以上。相手は必要なら W で
                // 待てる（sync 相互化）ので、その t が P の上限（次の合流予定）以内なら合流可能。
                // 相手が P より速く先に立ち去るケース（旧: 実現不能で弾いていた）も、相手側に「W で
                // 待つ」制約を作って成立させる。相手が P の上限より後にしか来ない場合だけ不可。
                feasible: Math.max(lowerBound, v.arrival) <= upperBound + 0.5,
                // 相手が P の最早到達より前に立ち去る＝相手を待たせる必要がある訪問（UI 表示用）
                needsWait: v.departure < lowerBound - 0.5,
            }));
            let defaultIndex = -1, bestDiff = Infinity;
            occurrences.forEach((o, i) => {
                if (!o.feasible) return;
                const d = Math.abs(o.arrival - myAbsArrival);
                if (d < bestDiff) { bestDiff = d; defaultIndex = i; }
            });
            candidates.push({ charId: cid, occurrences, defaultIndex, myAbsArrival, data: cData });
        });

        if (!candidates.length) { showAlert(`「${waypointName}」を通る他のキャラクターが見つかりませんでした。`); return; }

        setMergeCandidates(candidates);
        setMergeTargetWaypointName(waypointName);
        setMergeTargetWaypointId(waypointId);
        setIsMergeModalOpen(true);
    };

    const handleMergeConfirm = async (selected: { charId: string; pathIndex: number; arrival: number; departure: number }[]) => {
        if (selected.length === 0) {
            setIsMergeModalOpen(false);
            return;
        }

        // 全員が揃っていられる合流時刻 = 「各選択訪問の到達」と「自分が通常速度で着ける下限」の最大
        let meetingTime = Math.max(...selected.map(s => s.arrival));
        if (Number.isFinite(lowerBoundRef.current)) meetingTime = Math.max(meetingTime, lowerBoundRef.current);

        // P 自身が後の合流予定に間に合わなくなる場合だけ不可（上限）。
        if (meetingTime > upperBoundRef.current + 0.5) {
            await showAlert('この地点での合流時刻が、あなたの後の合流予定に間に合いません。訪問の選択を見直してください。', 'sync エラー');
            return;
        }

        // sync 相互化: meetingTime に W へ居られない相手（P より先に立ち去る相手）には、相手側にも
        // 「W で meetingTime まで待つ」合流制約を作って合流を成立させる。従来は「相手が先に通り過ぎる」
        // ケースを実現不能として弾き、ユーザーが相手側を手動で時間合わせするまで sync できなかった。
        // ただし相手が W より後に別の合流予定を持ち、待たせるとそれに間に合わなくなる場合は中断する
        // （相手の既存予定は壊さない）。相手側の検証を全員通してから保存する（片側だけ保存を防止）。
        const spf = MOVEMENT_SPEED_PX_PER_SEC / TARGET_FPS;
        const reciprocalSaves: (() => void)[] = [];
        for (const s of selected) {
            if (meetingTime <= s.departure + 0.5) continue; // 相手は自然に居る → 待たせ不要
            const qRaw = mergeCandidates.find(c => c.charId === s.charId)?.data;
            if (!qRaw || !qRaw.path || qRaw.path.length === 0) continue;
            const qPath = qRaw.path;
            const qWaypoints = qRaw.waypoints || [];
            const qCached = precomputePath(qPath, nodes);
            const qOccurrence = qPath.slice(0, s.pathIndex).filter(id => id === mergeTargetWaypointId).length;
            const existing = qRaw.syncConstraints || [];
            const idxOfQ = (sc: SyncConstraint): number => {
                const occ = sc.occurrence ?? 0; let cnt = 0;
                for (let i = 0; i < qPath.length; i++) { if (qPath[i] === sc.waypointId) { if (cnt === occ) return i; cnt++; } }
                return qPath.indexOf(sc.waypointId);
            };
            // 相手の「W より後」の既存合流に、W で待たせても通常速度で間に合うか
            const blocked = existing.some(sc => {
                const li = idxOfQ(sc);
                if (li <= s.pathIndex) return false;
                const dist = Math.abs((qCached.cumulative[li] ?? 0) - (qCached.cumulative[s.pathIndex] ?? 0));
                return meetingTime + dist / spf > sc.meetingTime + 0.5;
            });
            if (blocked) {
                await showAlert(`${formatCharName(s.charId)} はこの後に別の合流予定があり、ここで待たせると間に合いません。別の訪問を選ぶか、先に ${formatCharName(s.charId)} 側の予定を調整してください。`, 'sync エラー');
                return;
            }
            const qConstraint: SyncConstraint = {
                waypointId: mergeTargetWaypointId,
                waypointName: mergeTargetWaypointName,
                meetingTime,
                charIds: [...selectedIcons],
                occurrence: qOccurrence,
            };
            const ei = existing.findIndex(c => c.waypointId === mergeTargetWaypointId && (c.occurrence ?? 0) === qOccurrence);
            const qConstraints = ei !== -1 ? existing.map((c, i) => i === ei ? qConstraint : c) : [...existing, qConstraint];
            // 相手の開始時刻を「最も手前のアンカー」から解決し直す（P と同じ方式）
            const qAnchor = pickAnchorTarget(qConstraints, qPath);
            let qStartTime = qRaw.startTime ?? 0;
            if (qAnchor) {
                const tempQ = { path: qPath, startTime: 0, duration: computeDuration(qPath, nodes), waypoints: qWaypoints };
                const tt = qAnchor.pathIndex >= 0
                    ? calculateArrivalTimeAtIndex(tempQ, qAnchor.pathIndex, nodes)
                    : calculateNodeArrivalTime(tempQ, qAnchor.waypointId, nodes);
                if (tt !== null) qStartTime = qAnchor.meetingTime - tt;
            }
            const qValidWp = qWaypoints.filter(w => w.id !== '');
            reciprocalSaves.push(() => saveCharacterAnimation(activePresetId, s.charId, qPath, qValidWp, qStartTime, qConstraints, qRaw.startRef ?? null, qRaw.showBeforeStart ?? true));
        }
        reciprocalSaves.forEach(fn => fn());

        if (!isEditing) setIsEditing(true);

        // この合流が自経路の waypoint の何回目の訪問か（複数地点sync の時刻アンカー解決に使う）
        const myOccurrence = displayPath
            .slice(0, myCurrentSyncPathIndex >= 0 ? myCurrentSyncPathIndex : displayPath.length)
            .filter(id => id === mergeTargetWaypointId).length;

        const newConstraint: SyncConstraint = {
            waypointId: mergeTargetWaypointId,
            waypointName: mergeTargetWaypointName,
            meetingTime,
            charIds: selected.map(s => s.charId),
            occurrence: myOccurrence,
        };
        const existingIdx = syncConstraints.findIndex(c => c.waypointId === mergeTargetWaypointId && (c.occurrence ?? 0) === myOccurrence);
        const nextConstraints = existingIdx !== -1
            ? syncConstraints.map((c, i) => i === existingIdx ? newConstraint : c)
            : [...syncConstraints, newConstraint];
        setSyncConstraints(nextConstraints);

        // 複数地点sync: 開始時刻は「最も手前の合流地点」に揃える（最初の区間は通常速度）。
        // それ以降の区間は Animate 側がアンカー間で速度を変えて各合流時刻を満たす。
        const anchor = pickAnchorTarget(nextConstraints, displayPath);
        setSyncTarget(anchor ? { waypointId: anchor.waypointId, meetingTime: anchor.meetingTime, pathIndex: anchor.pathIndex >= 0 ? anchor.pathIndex : undefined } : null);

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
                charIds: [...selectedIcons, ...selected.map(s => s.charId)],
            });
        }

        const followTarget = selected[0];
        const followData = mergeCandidates.find(c => c.charId === followTarget.charId)?.data;
        const targetWaypoints: Waypoint[] = followData?.waypoints || [];
        const targetPath: string[] = followData?.path || [];

        // 合流地点は handleSyncTime/MergeModal で選んだ訪問（オカレンス）に揃える。
        // これにより「同行できる以降の経由地」も正しい訪問以降だけが対象になる。
        const targetPathIndex = followTarget.pathIndex;

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
            // アンカーは経路上最も手前の制約（pickAnchorTarget, revise2 №6）
            const anchor = pickAnchorTarget(next, displayPath);
            if (anchor) {
                setSyncTarget({ waypointId: anchor.waypointId, meetingTime: anchor.meetingTime, pathIndex: anchor.pathIndex >= 0 ? anchor.pathIndex : undefined });
            } else {
                setSyncTarget(null);
                // sync が無くなったのに startTime が残ると「謎の待機」になる（revise2 №7）
                setStartTime(0);
            }
            return next;
        });
    };

    const handleSavePath = () => {
        if (!displayPath.length) return;
        // キャラ未選択でSave Pathされたら、保存先キャラを選ぶフローティングウィンドウを開く
        if (!selectedIcons.length) { setIsMultiSelectMode(false); setIsCharModalOpen(true); return; }
        const validWp = waypoints.filter(wp => wp.id !== "");
        if (selectedIcons.length === 1) saveCharacterAnimation(activePresetId, selectedIcons[0], displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
        else saveBatchCharacterAnimations(activePresetId, selectedIcons, displayPath, validWp, startTime, syncConstraints, startRef, showBeforeStart);
        setConnectingNodeId(null); setIsEditing(false);

        // 保存後の sync 整合性チェック（B-5）。矛盾は無警告フォールバックされるため人間に提示する。
        // 直前の save*Animation の反映を確実に読むため、React state ではなく getState() で最新値を取る。
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

    // 保存を要求し、完了したら true を解決する。
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
    }, [displayPath, selectedIcons, waypoints, activePresetId, startTime, syncConstraints, startRef, showBeforeStart, saveCharacterAnimation, saveBatchCharacterAnimations, setConnectingNodeId]);

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
            // 「保存」選択時、キャラ未選択ならモーダルでの選択完了を待ってから遷移を許可する。
            if (choice === 'save') { return await requestSaveOrPrompt(); }
            if (choice === 'discard') { return true; }
            return false; // cancel → 遷移中止
        });
        return () => setNavigationGuard(null);
    }, [hasUnsavedPath, showDialog, requestSaveOrPrompt]);

    const handleDeletePath = async () => {
        if (selectedIcons.length && await showConfirm("この経路を削除しますか？")) {
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

    const handleCharSelect = (icon: string) => {
        void selectIcon(icon, false); setIsCharModalOpen(false); setIsMultiSelectMode(false);
        saveCharacterAnimation(activePresetId, icon, displayPath, waypoints.filter(w => w.id), startTime, syncConstraints, startRef, showBeforeStart);
        setConnectingNodeId(null); setIsEditing(false); resolvePendingSave();
    };
    const handleMultiSelect = (icons: string[]) => {
        setIsCharModalOpen(false); setIsMultiSelectMode(false);
        if (icons.length) saveBatchCharacterAnimations(activePresetId, icons, displayPath, waypoints.filter(w => w.id), startTime, syncConstraints, startRef, showBeforeStart);
        setConnectingNodeId(null); setIsEditing(false); resolvePendingSave();
    };

    return {
        isCharModalOpen, setIsCharModalOpen,
        isMultiSelectMode, setIsMultiSelectMode,
        isEditing, setIsEditing,
        startRef, setStartRef,
        showBeforeStart, setShowBeforeStart,
        suggestionTargetIndex, setSuggestionTargetIndex,
        isMergeModalOpen, setIsMergeModalOpen, mergeCandidates, mergeTargetWaypointName, mergeTargetWaypointId,
        followTargetInfo, setFollowTargetInfo,
        syncConstraints,
        waypoints, setWaypoints,
        displayPath, displaySegments,
        namedNodes, matchedNodes, otherNodes,
        savedPathData, startRefCharOptions, startRefNodeOptions,
        handleWaypointChange, handleAddWaypoint, handleRemoveWaypoint, handleSelectSuggestion,
        handleEditPath, handleSyncTime, handleMergeConfirm, handleRemoveSyncConstraint,
        handleSavePath, requestSaveOrPrompt, handleDeletePath, handleModalClose,
        handleCharSelect, handleMultiSelect,
    };
};
