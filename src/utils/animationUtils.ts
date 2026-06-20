import { MapNode } from '../store';
import { CharacterTimelineData } from '../store';
import { WAIT_VIRTUAL_DISTANCE } from '../constants';

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
}

export const precomputePath = (
    path: string[],
    allNodes: MapNode[] | Record<string, MapNode>
): PrecomputedPath => {
    const pathNodes = path.map(id => getNode(id, allNodes)).filter((n): n is MapNode => !!n);
    const distances: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
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
    return { pathNodes, distances, totalDistance };
};

export const calculateRawPositionCached = (
    charData: CharacterTimelineData,
    currentTime: number,
    cached: PrecomputedPath
): { x: number; y: number; floor: string; visible: boolean; vx: number; vy: number; isFinished: boolean } | null => {
    const { path, startTime, duration } = charData;
    const { pathNodes, distances, totalDistance } = cached;

    if (!path || path.length === 0 || pathNodes.length === 0) return null;

    if (currentTime < startTime) {
        const startNode = pathNodes[0];
        return { x: startNode.x, y: startNode.y, floor: startNode.floor, visible: true, vx: 0, vy: 0, isFinished: false };
    }

    if (pathNodes.length === 1) {
        const node = pathNodes[0];
        return { x: node.x, y: node.y, floor: node.floor, visible: true, vx: 0, vy: 0, isFinished: false };
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
            const nodeB = pathNodes[i + 1];
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

    // 開始前: 始点で待機
    if (currentTime < startTime) {
        const startNode = pathNodes[0];
        return { 
            x: startNode.x, 
            y: startNode.y, 
            floor: startNode.floor, 
            visible: true, 
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