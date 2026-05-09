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

// 衝突判定とオフセット計算 (変更なし)
export const getCollisionOffsets = (
    positions: PositionWithVelocity[],
    iconSize: number
): Record<string, { x: number, y: number }> => {
    
    const n = positions.length;
    const BASE_THRESHOLD = iconSize * 0.45; 
    
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (i: number, j: number) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
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

    const groups: Record<number, number[]> = {};
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!groups[root]) groups[root] = [];
        groups[root].push(i);
    }

    const offsets: Record<string, { x: number, y: number }> = {};
    positions.forEach(p => offsets[p.id] = { x: 0, y: 0 });

    const stepSize = iconSize * 0.8; 

    Object.values(groups).forEach(members => {
        if (members.length <= 1) return;

        members.sort((a, b) => positions[a].id.localeCompare(positions[b].id));

        let centerX = 0, centerY = 0;
        let sumVx = 0, sumVy = 0;
        
        members.forEach(idx => {
            centerX += positions[idx].x;
            centerY += positions[idx].y;
            sumVx += positions[idx].vx;
            sumVy += positions[idx].vy;
        });
        
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

        members.forEach((originalIndex, k) => {
            let col, row;
            if (useRowMajorFilling) {
                col = k % colCount;
                row = Math.floor(k / colCount);
            } else {
                row = k % rowCount;
                col = Math.floor(k / rowCount);
            }

            const targetRelX = startX + col * stepSize;
            const targetRelY = startY + row * stepSize;
            const targetAbsX = centerX + targetRelX;
            const targetAbsY = centerY + targetRelY;

            offsets[positions[originalIndex].id] = {
                x: targetAbsX - positions[originalIndex].x,
                y: targetAbsY - positions[originalIndex].y
            };
        });
    });

    return offsets;
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

// 到達時刻計算 (こちらは頻繁に呼ばれないので配列のままでも可だが、一応getNode使用)
export const calculateNodeArrivalTime = (
    charData: CharacterTimelineData,
    targetNodeId: string,
    allNodes: MapNode[]
): number | null => {
    // 既存ロジック維持 (getNodeを使っても良いがMapNode[]を受け取る前提)
    const { path, startTime, duration } = charData;
    if (!path || path.length < 1) return null;

    const targetIndex = path.indexOf(targetNodeId);
    if (targetIndex === -1) return null;

    const pathNodes = path.map(id => allNodes.find(n => n.id === id)).filter((n): n is MapNode => !!n);
    if (pathNodes.length < 2) return startTime;

    let totalDist = 0;
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
        totalDist += d;
    }

    let distToTarget = 0;
    for (let i = 0; i < targetIndex; i++) {
        if (i < distances.length) {
            distToTarget += distances[i];
        }
    }

    if (totalDist === 0) return startTime;
    const progress = distToTarget / totalDist;
    return startTime + (duration * progress);
};