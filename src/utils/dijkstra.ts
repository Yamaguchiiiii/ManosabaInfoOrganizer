import { MapNode, MapEdge } from '../store';

// 2点間の距離（ピクセル）を計算
const getDistance = (nodeA: MapNode, nodeB: MapNode) => {
  return Math.sqrt(Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2));
};

export const findShortestPath = (
  allNodes: MapNode[],     // 全フロアのノード
  allEdges: MapEdge[],     // 全フロアのエッジ
  startNodeId: string,
  endNodeId: string
): string[] | null => {
  // 1. グラフの構築 (隣接リスト)
  const adjacencyList: Record<string, string[]> = {};
  
  // 初期化
  allNodes.forEach(node => {
    adjacencyList[node.id] = [];
  });

  // A. 通常のエッジ（同じ階層内の移動）を追加
  allEdges.forEach(edge => {
    if (adjacencyList[edge.nodeA]) adjacencyList[edge.nodeA].push(edge.nodeB);
    if (adjacencyList[edge.nodeB]) adjacencyList[edge.nodeB].push(edge.nodeA);
  });

  // ▼▼▼ B. 階段間の仮想エッジを追加 (階層間の移動) ▼▼▼
  const stairNodes = allNodes.filter(n => n.type === 'stair' && n.connectedFloor);
  
  stairNodes.forEach(sourceStair => {
    const targetFloor = sourceStair.connectedFloor;
    
    // 移動先フロアにある階段を探す
    // (簡易的に、移動先フロアにあり、かつ「こちらのフロア」に戻れる階段と接続する)
    const targetStairs = stairNodes.filter(target => 
      target.floor === targetFloor && 
      target.connectedFloor === sourceStair.floor
    );

    targetStairs.forEach(targetStair => {
      // 双方向に接続
      adjacencyList[sourceStair.id].push(targetStair.id);
      adjacencyList[targetStair.id].push(sourceStair.id);
    });
  });

  // 2. ダイクストラ法 (以下は前回とほぼ同じですが、探索空間が全フロアになっています)
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  allNodes.forEach(node => {
    distances[node.id] = Infinity;
    previous[node.id] = null;
    unvisited.add(node.id);
  });

  // スタート地点が見つからない場合のガード
  if (distances[startNodeId] === undefined) return null;

  distances[startNodeId] = 0;

  while (unvisited.size > 0) {
    let currentNodeId: string | null = null;
    let minDistance = Infinity;

    for (const nodeId of unvisited) {
      if (distances[nodeId] < minDistance) {
        minDistance = distances[nodeId];
        currentNodeId = nodeId;
      }
    }

    if (currentNodeId === null || currentNodeId === endNodeId) {
      break; 
    }

    unvisited.delete(currentNodeId);

    const neighbors = adjacencyList[currentNodeId] || [];
    for (const neighborId of neighbors) {
      if (!unvisited.has(neighborId)) continue;

      const currentNode = allNodes.find(n => n.id === currentNodeId);
      const neighborNode = allNodes.find(n => n.id === neighborId);

      if (currentNode && neighborNode) {
        // 距離計算: フロアが違う(階段移動)なら距離は0(または微小コスト)とする
        let dist = 0;
        if (currentNode.floor === neighborNode.floor) {
             dist = getDistance(currentNode, neighborNode);
        } else {
             dist = 0; // 階段移動コスト
        }

        const newDist = distances[currentNodeId] + dist;

        if (newDist < distances[neighborId]) {
          distances[neighborId] = newDist;
          previous[neighborId] = currentNodeId;
        }
      }
    }
  }

  // 3. 経路の復元
  const path: string[] = [];
  let current: string | null = endNodeId;

  if (distances[endNodeId] === Infinity) return null;

  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  return path;
};