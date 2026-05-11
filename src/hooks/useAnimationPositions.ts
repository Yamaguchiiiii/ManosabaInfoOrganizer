import React, { useEffect, useRef } from 'react';
import Konva from 'konva';
import { useAppStore, ICON_FILES, MapNode, CharacterTimelineData } from '../store';
import { precomputePath, PrecomputedPath, calculateRawPositionCached, getCollisionOffsets, PositionWithVelocity } from '../utils/animationUtils';

export const FLOOR_IDS = ['1F', '2F', 'B1'] as const;
export type AnimFloorId = typeof FLOOR_IDS[number];

const ICON_SIZE = 80;
const LERP_FACTOR = 0.15;
const TELEPORT_THRESHOLD = 200;

function toCharacterTimelineData(raw: unknown): CharacterTimelineData | null {
    if (Array.isArray(raw) && raw.length > 0) {
        return { path: raw as string[], startTime: 0, duration: raw.length * 30 };
    }
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'path' in raw) {
        return raw as CharacterTimelineData;
    }
    return null;
}

type ActivePosition = PositionWithVelocity & { isFinished: boolean };

type PathCacheEntry = { charData: CharacterTimelineData; cached: PrecomputedPath };

// charNodeRefs のキーは "${icon}:${floorId}" の形式（例: "1_sakuraba_ema.png:1F"）
export const useAnimationPositions = (
    nodesMapRef: React.MutableRefObject<Record<string, MapNode>>,
    charNodeRefs: React.MutableRefObject<Map<string, Konva.Group>>,
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number }>>
): void => {
    const pathCacheRef = useRef<Map<string, PathCacheEntry>>(new Map());
    const activePresetId = useAppStore(state => state.activePresetId);

    // プリセットが変わったときだけパスキャッシュを再構築（毎フレームではない）
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);
        if (!activePreset) {
            pathCacheRef.current.clear();
            return;
        }
        const nodesMap = nodesMapRef.current;
        const newCache = new Map<string, PathCacheEntry>();
        const data = activePreset.data as Record<string, unknown>;
        ICON_FILES.forEach(icon => {
            const charData = toCharacterTimelineData(data[icon]);
            if (charData) {
                newCache.set(icon, { charData, cached: precomputePath(charData.path, nodesMap) });
            }
        });
        pathCacheRef.current = newCache;
    }, [activePresetId]);

    useEffect(() => {
        const lastVelocities: Record<string, { vx: number; vy: number }> = {};
        let animId: number;

        const animate = () => {
            const { currentTime, presets, activePresetId: currentPresetId } = useAppStore.getState();
            const activePreset = presets.find(p => p.id === currentPresetId);
            const deadIcons: string[] = activePreset?.deadIcons ?? [];

            // 1. 全キャラの目標座標を計算（キャッシュ済みパスを使用、毎フレーム配列生成なし）
            const activePositions: ActivePosition[] = [];
            ICON_FILES.forEach(icon => {
                if (deadIcons.includes(icon)) return;
                const entry = pathCacheRef.current.get(icon);
                if (!entry) return;

                const pos = calculateRawPositionCached(entry.charData, currentTime, entry.cached);
                if (!pos || !pos.visible) return;

                let { vx, vy } = pos;
                if (Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001) {
                    lastVelocities[icon] = { vx, vy };
                } else {
                    const last = lastVelocities[icon];
                    if (last) { vx = last.vx; vy = last.vy; }
                }

                activePositions.push({ id: icon, x: pos.x, y: pos.y, floor: pos.floor, vx, vy, isFinished: pos.isFinished });
            });

            // 2. 衝突オフセット計算
            const offsets = getCollisionOffsets(activePositions, ICON_SIZE);

            // 3. 目標座標マップ
            const targets: Record<string, { x: number; y: number; floor: string; isFinished: boolean }> = {};
            activePositions.forEach(p => {
                const offset = offsets[p.id] ?? { x: 0, y: 0 };
                targets[p.id] = { x: p.x + offset.x, y: p.y + offset.y, floor: p.floor, isFinished: p.isFinished };
            });

            // 4. 全 icon × 全 floorId の Konva ノードを直接操作（React 再レンダリングを経由しない）
            ICON_FILES.forEach(icon => {
                FLOOR_IDS.forEach(floorId => {
                    const node = charNodeRefs.current.get(`${icon}:${floorId}`);
                    if (!node) return;

                    const target = targets[icon];
                    if (!target || target.floor !== floorId) {
                        node.visible(false);
                        return;
                    }

                    const prev = currentVisualPositions.current[icon] ?? { x: target.x, y: target.y };
                    const diffX = target.x - prev.x;
                    const diffY = target.y - prev.y;
                    const distSq = diffX * diffX + diffY * diffY;

                    let newX: number;
                    let newY: number;
                    if (target.isFinished || distSq > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
                        newX = target.x;
                        newY = target.y;
                    } else if (Math.abs(diffX) < 0.1 && Math.abs(diffY) < 0.1) {
                        newX = target.x;
                        newY = target.y;
                    } else {
                        newX = prev.x + diffX * LERP_FACTOR;
                        newY = prev.y + diffY * LERP_FACTOR;
                    }

                    node.x(newX);
                    node.y(newY);
                    node.visible(true);
                    currentVisualPositions.current[icon] = { x: newX, y: newY };
                });
            });

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);
};
