import { MapNode } from '../store';
import { CharacterTimelineData } from '../store';
import { WAIT_VIRTUAL_DISTANCE, MOVEMENT_SPEED_PX_PER_SEC, TARGET_FPS } from '../constants';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export const getDistance = (nodeA: MapNode, nodeB: MapNode) => {
    return Math.sqrt(Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2));
};

export interface PositionWithVelocity {
    id: string;
    x: number;
    y: number;
    floor: string;
    vx: number;
    vy: number;
}

// --- 衝突判定用プール（毎フレームのオブジェクト生成を排除）---
// ICON_FILES.length = 15 に対して余裕を持たせた上限
const _MAX_POSITIONS = 16;
const _unionParent = new Int32Array(_MAX_POSITIONS);
const _groupMembers: number[][] = Array.from({ length: _MAX_POSITIONS }, () => []);
const _sharedOffsets: Record<string, { x: number; y: number }> = {};

// 衝突判定とオフセット計算
export const getCollisionOffsets = (
    positions: PositionWithVelocity[],
    iconSize: number,
    count?: number
): Record<string, { x: number; y: number }> => {

    const n = count ?? positions.length;
    const BASE_THRESHOLD = iconSize * 0.45;

    // _unionParent を初期化（既存配列を再利用）
    for (let i = 0; i < n; i++) _unionParent[i] = i;

    const find = (i: number): number => {
        if (_unionParent[i] === i) return i;
        _unionParent[i] = find(_unionParent[i]);
        return _unionParent[i];
    };
    const union = (i: number, j: number) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) _unionParent[rootI] = rootJ;
    };

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (positions[i].floor !== positions[j].floor) continue;
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < BASE_THRESHOLD) union(i, j);
        }
    }

    // _groupMembers をクリアして再利用
    for (let i = 0; i < n; i++) _groupMembers[i].length = 0;
    for (let i = 0; i < n; i++) _groupMembers[find(i)].push(i);

    // _sharedOffsets を初期化（既存エントリを上書き、新規 id のみ生成）
    for (let i = 0; i < n; i++) {
        const id = positions[i].id;
        if (_sharedOffsets[id]) {
            _sharedOffsets[id].x = 0;
            _sharedOffsets[id].y = 0;
        } else {
            _sharedOffsets[id] = { x: 0, y: 0 };
        }
    }

    const stepSize = iconSize * 0.8;

    for (let i = 0; i < n; i++) {
        const members = _groupMembers[i];
        if (members.length <= 1) continue;

        members.sort((a, b) => positions[a].id.localeCompare(positions[b].id));

        let centerX = 0, centerY = 0;
        let sumVx = 0, sumVy = 0;

        for (let k = 0; k < members.length; k++) {
            const idx = members[k];
            centerX += positions[idx].x;
            centerY += positions[idx].y;
            sumVx += positions[idx].vx;
            sumVy += positions[idx].vy;
        }

        centerX /= members.length;
        centerY /= members.length;

        const count = members.length;
        let colCount = 1;
        let rowCount = 1;
        let useRowMajorFilling = false;

        const sqrt = Math.sqrt(count);
        const isSquare = Number.isInteger(sqrt) && count > 1;

        if (isSquare) {
            colCount = sqrt;
            rowCount = sqrt;
            useRowMajorFilling = true;
        } else {
            const isHorizontalMove = Math.abs(sumVx) > Math.abs(sumVy);
            if (isHorizontalMove) {
                rowCount = 2;
                colCount = Math.ceil(count / rowCount);
                useRowMajorFilling = false;
            } else {
                colCount = 2;
                rowCount = Math.ceil(count / colCount);
                useRowMajorFilling = true;
            }
        }

        const gridWidth = (colCount - 1) * stepSize;
        const gridHeight = (rowCount - 1) * stepSize;
        const startX = -gridWidth / 2;
        const startY = -gridHeight / 2;

        for (let k = 0; k < members.length; k++) {
            const originalIndex = members[k];
            let col: number, row: number;
            if (useRowMajorFilling) {
                col = k % colCount;
                row = Math.floor(k / colCount);
            } else {
                row = k % rowCount;
                col = Math.floor(k / rowCount);
            }

            const targetAbsX = centerX + startX + col * stepSize;
            const targetAbsY = centerY + startY + row * stepSize;

            // 既存オブジェクトを上書き（新規生成しない）
            _sharedOffsets[positions[originalIndex].id].x = targetAbsX - positions[originalIndex].x;
            _sharedOffsets[positions[originalIndex].id].y = targetAbsY - positions[originalIndex].y;
        }
    }

    return _sharedOffsets;
};

// ----------------------------------------------------------------------------
// Calculation Functions
// ----------------------------------------------------------------------------

/**
 * ノード検索用ヘルパー
 * 配列またはMapを受け取り、MapNodeを返す
 */
const getNode = (id: string, source: MapNode[] | Record<string, MapNode>): MapNode | undefined => {
    if (Array.isArray(source)) {
        return source.find(n => n.id === id);
    } else {
        return source[id];
    }
};

// ----------------------------------------------------------------------------
// Pre-computation (call once per preset change, not every frame)
// ----------------------------------------------------------------------------

export interface PrecomputedPath {
    pathNodes: MapNode[];
    distances: number[];
    totalDistance: number;
    cumulative: number[]; // cumulative[i] = pathNodes[i] までの累積距離（先頭=0）
}

export const precomputePath = (
    path: string[],
    allNodes: MapNode[] | Record<string, MapNode>
): PrecomputedPath => {
    const pathNodes = path.map(id => getNode(id, allNodes)).filter((n): n is MapNode => !!n);
    const distances: number[] = [];
    const cumulative: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length; i++) {
        cumulative.push(totalDistance);
        if (i >= pathNodes.length - 1) break;
        const nodeA = pathNodes[i];
        const nodeB = pathNodes[i + 1];
        let d = 0;
        if (nodeA.id === nodeB.id) {
            d = WAIT_VIRTUAL_DISTANCE;
        } else {
            const isStairJump = (nodeA.type === 'stair' && nodeB.type === 'stair');
            const isFloorChange = (nodeA.floor !== nodeB.floor);
            d = (isStairJump || isFloorChange) ? 0 : getDistance(nodeA, nodeB);
        }
        distances.push(d);
        totalDistance += d;
    }
    return { pathNodes, distances, totalDistance, cumulative };
};

// 時刻アンカー: 経路の累積距離 cumDist の地点に、絶対時刻 time に到達する。
// アンカー間は距離比例（区間ごとに速度が異なる＝複数地点の合流を満たす）。
export interface TimeAnchor { cumDist: number; time: number; }

// charData(startTime/duration/syncConstraints) と cached からアンカー列を作る。
// 合流が無ければ [start, end]（従来の一定速度）。合流があれば各合流地点を時刻アンカーにし、
// 末尾区間は通常速度。過去向き（直前のアンカーより早い）合流時刻は無効化（アンカーにしない）。
// 旧実装は prevTime+1 に丸めており、1フレームでの瞬間移動を生んでいた（0711 最重要3）。
// 無効化された制約は保存時検証(syncValidation)で error として提示する。
export const computeAnchors = (charData: CharacterTimelineData, cached: PrecomputedPath): TimeAnchor[] => {
    const startTime = charData.startTime ?? 0;
    const { cumulative, totalDistance, pathNodes } = cached;
    const anchors: TimeAnchor[] = [{ cumDist: 0, time: startTime }];

    const syncs = charData.syncConstraints;
    if (!syncs || syncs.length === 0) {
        anchors.push({ cumDist: totalDistance, time: startTime + (charData.duration ?? 0) });
        return anchors;
    }

    const mapped = syncs.map(sc => {
        const occ = (sc as { occurrence?: number }).occurrence ?? 0;
        let count = 0, idx = -1;
        for (let i = 0; i < pathNodes.length; i++) {
            if (pathNodes[i].id === sc.waypointId) {
                if (count === occ) { idx = i; break; }
                count++;
            }
        }
        if (idx === -1) idx = pathNodes.findIndex(n => n.id === sc.waypointId);
        return { idx, time: sc.meetingTime };
    }).filter(m => m.idx > 0).sort((a, b) => a.idx - b.idx);

    let prevTime = startTime;
    let prevCum = 0;
    for (const m of mapped) {
        const cum = cumulative[m.idx] ?? totalDistance;
        if (cum <= prevCum + 0.001) continue; // 同一/手前の地点は無視
        if (m.time <= prevTime) continue; // 過去向きの合流は満たせない → このアンカーを無効化（丸めない）
        anchors.push({ cumDist: cum, time: m.time });
        prevTime = m.time; prevCum = cum;
    }

    // 末尾区間は通常速度
    const speedPerFrame = MOVEMENT_SPEED_PX_PER_SEC / TARGET_FPS;
    const last = anchors[anchors.length - 1];
    if (last.cumDist < totalDistance - 0.001) {
        const remTime = (totalDistance - last.cumDist) / speedPerFrame;
        anchors.push({ cumDist: totalDistance, time: last.time + Math.max(remTime, 1) });
    }
    return anchors;
};

// アンカー列（sync 反映済み）から、累積距離 cum に到達する時刻を求める（区間ごとの速度差を反映）。
// anchors が2点（start/end）のみなら、duration での線形按分と一致する。
export const timeAtCumDist = (anchors: TimeAnchor[], cum: number): number => {
    if (anchors.length === 0) return 0;
    if (cum <= anchors[0].cumDist) return anchors[0].time;
    for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1];
        if (cum <= b.cumDist) {
            const t = b.cumDist > a.cumDist ? (cum - a.cumDist) / (b.cumDist - a.cumDist) : 1;
            return a.time + (b.time - a.time) * t;
        }
    }
    return anchors[anchors.length - 1].time;
};

export const calculateRawPositionCached = (
    charData: CharacterTimelineData,
    currentTime: number,
    cached: PrecomputedPath,
    anchors: TimeAnchor[]
): { x: number; y: number; floor: string; visible: boolean; vx: number; vy: number; isFinished: boolean } | null => {
    const { path } = charData;
    const { pathNodes, distances, totalDistance } = cached;

    if (!path || path.length === 0 || pathNodes.length === 0 || anchors.length === 0) return null;

    const startTime = anchors[0].time;

    if (currentTime < startTime) {
        const startNode = pathNodes[0];
        // 待機中の表示は showBeforeStart で制御（既定 true）。false なら開始まで非表示。
        const visible = charData.showBeforeStart !== false;
        return { x: startNode.x, y: startNode.y, floor: startNode.floor, visible, vx: 0, vy: 0, isFinished: false };
    }

    if (pathNodes.length === 1) {
        const node = pathNodes[0];
        return { x: node.x, y: node.y, floor: node.floor, visible: true, vx: 0, vy: 0, isFinished: false };
    }

    // アンカー列から「現在時刻に対応する累積距離」を求める（アンカー間は距離比例＝区間ごとの速度）。
    const lastAnchor = anchors[anchors.length - 1];
    const isFinished = currentTime >= lastAnchor.time;
    let targetDistance: number;
    if (isFinished) {
        targetDistance = totalDistance;
    } else {
        let ai = 0;
        while (ai < anchors.length - 1 && currentTime > anchors[ai + 1].time) ai++;
        const a = anchors[ai];
        const b = anchors[ai + 1];
        const segT = b.time > a.time ? (currentTime - a.time) / (b.time - a.time) : 1;
        targetDistance = a.cumDist + (b.cumDist - a.cumDist) * segT;
    }

    let currentDistSum = 0;
    for (let i = 0; i < distances.length; i++) {
        const segmentDist = distances[i];
        if (segmentDist === 0) continue;
        if (currentDistSum + segmentDist >= targetDistance) {
            const segmentProgress = (targetDistance - currentDistSum) / segmentDist;
            const nodeA = pathNodes[i];
            const nodeB = pathNodes[i + 1];
            const x = nodeA.x + (nodeB.x - nodeA.x) * segmentProgress;
            const y = nodeA.y + (nodeB.y - nodeA.y) * segmentProgress;
            const vx = nodeB.x - nodeA.x;
            const vy = nodeB.y - nodeA.y;
            return { x, y, floor: nodeA.floor, visible: true, vx, vy, isFinished };
        }
        currentDistSum += segmentDist;
    }

    const lastNode = pathNodes[pathNodes.length - 1];
    return { x: lastNode.x, y: lastNode.y, floor: lastNode.floor, visible: true, vx: 0, vy: 0, isFinished: true };
};

// 時刻 t における基本座標を計算
// ▼▼▼ 修正: allNodes は 配列 または Record<string, MapNode> を受け取れるように変更 ▼▼▼
export const calculateRawPosition = (
    charData: CharacterTimelineData,
    currentTime: number,
    allNodes: MapNode[] | Record<string, MapNode>
): { x: number, y: number, floor: string, visible: boolean, vx: number, vy: number, isFinished: boolean } | null => {
    
    const { path, startTime, duration } = charData;

    if (!path || path.length === 0) return null;

    // パスIDをノードオブジェクトに変換 (高速化対応)
    const pathNodes = path.map(id => getNode(id, allNodes)).filter((n): n is MapNode => !!n);
    if (pathNodes.length === 0) return null;

    // 開始前: 始点で待機（showBeforeStart=false なら非表示）
    if (currentTime < startTime) {
        const startNode = pathNodes[0];
        return {
            x: startNode.x,
            y: startNode.y,
            floor: startNode.floor,
            visible: charData.showBeforeStart !== false,
            vx: 0,
            vy: 0,
            isFinished: false
        };
    }

    // 移動なし
    if (pathNodes.length === 1) {
        const node = pathNodes[0];
        return { x: node.x, y: node.y, floor: node.floor, visible: true, vx: 0, vy: 0, isFinished: false };
    }

    // 総距離計算
    let totalDistance = 0;
    const distances: number[] = [];
    
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const nodeA = pathNodes[i];
        const nodeB = pathNodes[i+1];
        
        let d = 0;
        if (nodeA.id === nodeB.id) {
            d = WAIT_VIRTUAL_DISTANCE;
        } else {
            const isStairJump = (nodeA.type === 'stair' && nodeB.type === 'stair');
            const isFloorChange = (nodeA.floor !== nodeB.floor);
            d = (isStairJump || isFloorChange) ? 0 : getDistance(nodeA, nodeB);
        }
        
        distances.push(d);
        totalDistance += d;
    }

    const rawProgress = duration > 0 ? (currentTime - startTime) / duration : 1;
    const progress = Math.min(Math.max(rawProgress, 0), 1);

    const isFinished = rawProgress >= 1.0;

    const targetDistance = totalDistance * progress;
    let currentDistSum = 0;
    
    for (let i = 0; i < distances.length; i++) {
        const segmentDist = distances[i];
        if (segmentDist === 0) continue;
        
        if (currentDistSum + segmentDist >= targetDistance) {
            const segmentProgress = (targetDistance - currentDistSum) / segmentDist;
            const nodeA = pathNodes[i];
            const nodeB = pathNodes[i+1];
            
            const x = nodeA.x + (nodeB.x - nodeA.x) * segmentProgress;
            const y = nodeA.y + (nodeB.y - nodeA.y) * segmentProgress;
            const vx = nodeB.x - nodeA.x;
            const vy = nodeB.y - nodeA.y;

            return { x, y, floor: nodeA.floor, visible: true, vx, vy, isFinished: isFinished && progress === 1 };
        }
        currentDistSum += segmentDist;
    }

    const lastNode = pathNodes[pathNodes.length - 1];
    return { x: lastNode.x, y: lastNode.y, floor: lastNode.floor, visible: true, vx: 0, vy: 0, isFinished: true };
};

// 到達時刻計算（path 上の特定インデックス＝特定オカレンスを指定）。
// 同一地点を複数回訪れる経路でも、どの訪問の到達時刻かを正確に得られる。
// path のインデックスで距離を積算するため、id→node のフィルタによるインデックスずれも起きない。
export const calculateArrivalTimeAtIndex = (
    charData: CharacterTimelineData,
    targetIndex: number,
    allNodes: MapNode[]
): number | null => {
    const { path, startTime, duration } = charData;
    if (!path || path.length < 1) return null;
    if (targetIndex <= 0) return startTime;
    if (targetIndex >= path.length) return null;

    const nodesMap: Record<string, MapNode> = {};
    allNodes.forEach(n => { nodesMap[n.id] = n; });

    let totalDist = 0;
    let distToTarget = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const nodeA = nodesMap[path[i]];
        const nodeB = nodesMap[path[i + 1]];
        let d = 0;
        if (nodeA && nodeB) {
            if (nodeA.id === nodeB.id) {
                d = WAIT_VIRTUAL_DISTANCE;
            } else {
                const isStairJump = (nodeA.type === 'stair' && nodeB.type === 'stair');
                const isFloorChange = (nodeA.floor !== nodeB.floor);
                d = (isStairJump || isFloorChange) ? 0 : getDistance(nodeA, nodeB);
            }
        }
        totalDist += d;
        if (i < targetIndex) distToTarget += d;
    }

    if (totalDist === 0) return startTime;
    return startTime + (duration * (distToTarget / totalDist));
};

// 到達時刻計算（node id 指定）。最初の出現（indexOf）を対象とする従来挙動。
export const calculateNodeArrivalTime = (
    charData: CharacterTimelineData,
    targetNodeId: string,
    allNodes: MapNode[]
): number | null => {
    const { path } = charData;
    if (!path || path.length < 1) return null;
    const targetIndex = path.indexOf(targetNodeId);
    if (targetIndex === -1) return null;
    return calculateArrivalTimeAtIndex(charData, targetIndex, allNodes);
};

// 指定ノードへの「訪問」ごとに (path上のブロック先頭index, 到達時刻, 出発時刻) を返す。
// 滞在（pathの連続重複）は1訪問に集約する。旧 getNodeArrivalOccurrences は集約しておらず、
// 滞在フレーム数ぶん同じ地点が重複列挙されていた（0711 #5 / revise2 №5）ため、この関数に統合した。
// duration の線形按分（sync 未反映）で計算する。sync を反映した時刻が要る場合は
// getNodeVisitTimesAnchored を使うこと（同室検出・ガントバー・startRef 解決など）。
export const getNodeVisitOccurrences = (
    charData: CharacterTimelineData,
    targetNodeId: string,
    allNodes: MapNode[]
): { pathIndex: number; arrival: number; departure: number }[] => {
    const { path, startTime, duration } = charData;
    if (!path || path.length === 0) return [];

    const nodesMap: Record<string, MapNode> = {};
    allNodes.forEach(n => { nodesMap[n.id] = n; });

    const segDist: number[] = [];
    let totalDist = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const a = nodesMap[path[i]];
        const b = nodesMap[path[i + 1]];
        let d = 0;
        if (a && b) {
            if (a.id === b.id) {
                d = WAIT_VIRTUAL_DISTANCE;
            } else {
                const isStairJump = (a.type === 'stair' && b.type === 'stair');
                const isFloorChange = (a.floor !== b.floor);
                d = (isStairJump || isFloorChange) ? 0 : getDistance(a, b);
            }
        }
        segDist.push(d);
        totalDist += d;
    }

    const cumAt: number[] = [];
    let cum = 0;
    for (let i = 0; i < path.length; i++) {
        cumAt.push(cum);
        if (i < segDist.length) cum += segDist[i];
    }
    const timeAt = (c: number) => (totalDist === 0) ? startTime : startTime + duration * (c / totalDist);

    const visits: { pathIndex: number; arrival: number; departure: number }[] = [];
    let i = 0;
    while (i < path.length) {
        if (path[i] === targetNodeId) {
            const startIdx = i;
            let endIdx = i;
            while (endIdx + 1 < path.length && path[endIdx + 1] === targetNodeId) endIdx++;
            visits.push({ pathIndex: startIdx, arrival: timeAt(cumAt[startIdx]), departure: timeAt(cumAt[endIdx]) });
            i = endIdx + 1;
        } else {
            i++;
        }
    }
    return visits;
};

// 指定ノードへの「訪問（visit）」ごとに到達時刻と出発時刻を返す（pathIndex を落とした簡易版）。
// 滞在(stayTime)は path 上の連続重複ノードで表現されるため、連続重複は1訪問に集約し、
// arrival=ブロック先頭の時刻、departure=ブロック末尾の時刻（＝滞在後に動き出す時刻）とする。
export const getNodeVisitTimes = (
    charData: CharacterTimelineData,
    targetNodeId: string,
    allNodes: MapNode[]
): { arrival: number; departure: number }[] =>
    getNodeVisitOccurrences(charData, targetNodeId, allNodes).map(({ arrival, departure }) => ({ arrival, departure }));

// 指定ノードへの「訪問」ごとの到達/出発時刻を、sync（アンカー）を反映して返す。
// getNodeVisitTimes は duration の線形按分（sync 未反映）のため、sync ありキャラでは
// 実際の移動（アンカー間で速度が変わる）と滞在帯・同室検出・開始条件の基準時刻がズレていた
// （0711に近い領域の実バグ・revise2 №1/№2/№3）。
export const getNodeVisitTimesAnchored = (
    charData: CharacterTimelineData,
    targetNodeId: string,
    allNodes: MapNode[] | Record<string, MapNode>
): { arrival: number; departure: number }[] => {
    if (!charData.path || charData.path.length === 0) return [];
    const cached = precomputePath(charData.path, allNodes);
    const anchors = computeAnchors(charData, cached);
    const { pathNodes, cumulative } = cached;

    const visits: { arrival: number; departure: number }[] = [];
    let i = 0;
    while (i < pathNodes.length) {
        if (pathNodes[i].id === targetNodeId) {
            const startIdx = i;
            let endIdx = i;
            while (endIdx + 1 < pathNodes.length && pathNodes[endIdx + 1].id === targetNodeId) endIdx++;
            visits.push({
                arrival: timeAtCumDist(anchors, cumulative[startIdx]),
                departure: timeAtCumDist(anchors, cumulative[endIdx]),
            });
            i = endIdx + 1;
        } else {
            i++;
        }
    }
    return visits;
};

// プリセット data の1エントリを CharacterTimelineData に正規化（旧 string[] 形式にも対応）。
export const normalizeTimelineData = (raw: unknown): CharacterTimelineData | null => {
    if (Array.isArray(raw) && raw.length > 0) {
        return { path: raw as string[], startTime: 0, duration: (raw as string[]).length * 30 };
    }
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'path' in raw) {
        return raw as CharacterTimelineData;
    }
    return null;
};

// 各キャラの「開始時刻（絶対フレーム）」を解決する。
// startRef を持つキャラは「基準キャラが地点に occurrence 回目に到達した時刻 + extraDelay」で開始。
// 基準キャラ自身も startRef を持つ場合は再帰解決し、循環は検出して 0 にフォールバックする。
export const resolveStartTimes = (
    rawData: Record<string, unknown>,
    allNodes: MapNode[]
): Record<string, number> => {
    const data: Record<string, CharacterTimelineData> = {};
    Object.entries(rawData).forEach(([id, v]) => {
        const n = normalizeTimelineData(v);
        if (n) data[id] = n;
    });

    const resolved: Record<string, number> = {};
    const visiting = new Set<string>();

    const resolve = (charId: string): number => {
        if (charId in resolved) return resolved[charId];
        if (visiting.has(charId)) return 0; // 循環 → 0 にフォールバック
        const cd = data[charId];
        if (!cd) return 0;
        const ref = cd.startRef;
        // sync 制約があるキャラは sync が開始時刻を決める（startRef より優先）。
        const hasSync = Array.isArray(cd.syncConstraints) && cd.syncConstraints.length > 0;
        if (!ref || hasSync) { resolved[charId] = cd.startTime ?? 0; return resolved[charId]; }

        visiting.add(charId);
        let start: number;
        const refData = data[ref.charId];
        if (refData && ref.charId !== charId) {
            const refStart = resolve(ref.charId);
            // 基準キャラが sync で速度の変わる区間を持つ場合、その実際の到達/出発時刻で解決する
            // （duration の線形按分だと sync ありキャラの開始条件がズレていた。revise2 №3）
            const visits = getNodeVisitTimesAnchored({ ...refData, startTime: refStart }, ref.nodeId, allNodes);
            if (visits.length > 0) {
                const idx = Math.min(Math.max(ref.occurrence || 0, 0), visits.length - 1);
                const base = ref.phase === 'departure' ? visits[idx].departure : visits[idx].arrival;
                start = base + (ref.extraDelay || 0);
            } else {
                start = cd.startTime ?? 0; // 基準キャラがその地点を通らない → 旧値にフォールバック
            }
        } else {
            start = cd.startTime ?? 0; // 基準キャラが存在しない/自己参照 → フォールバック
        }
        visiting.delete(charId);
        resolved[charId] = start;
        return start;
    };

    Object.keys(data).forEach(resolve);
    return resolved;
};