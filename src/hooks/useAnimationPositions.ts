import React, { useEffect, useRef } from 'react';
import Konva from 'konva';
import { useAppStore, ICON_FILES, MapNode, CharacterTimelineData } from '../store';
import { precomputePath, PrecomputedPath, calculateRawPositionCached, getCollisionOffsets, PositionWithVelocity } from '../utils/animationUtils';

export const FLOOR_IDS = ['1F', '2F', 'B1'] as const;
export type AnimFloorId = typeof FLOOR_IDS[number];

const ICON_SIZE = 80;
const LERP_FACTOR = 0.15;
const TELEPORT_THRESHOLD = 200;
const TARGET_FPS = 60;
const LOOP_DELAY_FRAMES = 60;
// Zustand への currentTime 書き込みを 4 フレームに 1 回に絞る（全購読者通知コストを削減）
const ZUSTAND_WRITE_INTERVAL = 4;
// この差を超えたらユーザーのシーク操作とみなし内部 timeRef を同期する
const SEEK_THRESHOLD = 10;

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
    currentVisualPositions: React.MutableRefObject<Record<string, { x: number; y: number; floor: string }>>
): void => {
    const pathCacheRef   = useRef<Map<string, PathCacheEntry>>(new Map());
    const timeRef        = useRef<number>(0);
    const maxDurationRef = useRef<number>(0);
    const lastTsRef      = useRef<number | null>(null);
    const frameCountRef  = useRef<number>(0);
    const activePresetId = useAppStore(state => state.activePresetId);

    // プリセットが変わったときだけパスキャッシュ・maxDuration を再構築し、時刻をリセット
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);

        pathCacheRef.current.clear();
        timeRef.current = 0;
        lastTsRef.current = null;
        maxDurationRef.current = 0;
        useAppStore.setState({ currentTime: 0 });

        if (!activePreset) return;

        let max = 0;
        const nodesMap = nodesMapRef.current;
        const data = activePreset.data as Record<string, unknown>;

        // 全キャラの startTime 最小値を求め、先頭の「誰も動かない待機時間」を除去する。
        // 全員を同じ offset でシフトするため、Sync による相対的な時間差は保たれる。
        const charDataList: { icon: string; charData: CharacterTimelineData }[] = [];
        let minStart = Infinity;
        ICON_FILES.forEach(icon => {
            const charData = toCharacterTimelineData(data[icon]);
            if (!charData) return;
            charDataList.push({ icon, charData });
            const st = charData.startTime ?? 0;
            if (st < minStart) minStart = st;
        });
        const offset = (Number.isFinite(minStart) && minStart > 0) ? minStart : 0;

        charDataList.forEach(({ icon, charData }) => {
            const normalized: CharacterTimelineData = offset !== 0
                ? { ...charData, startTime: (charData.startTime ?? 0) - offset }
                : charData;
            pathCacheRef.current.set(icon, { charData: normalized, cached: precomputePath(normalized.path, nodesMap) });
            const end = (normalized.startTime ?? 0) + (normalized.duration ?? 0);
            if (end > max) max = end;
        });
        maxDurationRef.current = max;
    }, [activePresetId]);

    // 単一 RAF ループ（時刻進行 + 位置計算 + Konva 操作を一体化）
    useEffect(() => {
        const lastVelocities: Record<string, { vx: number; vy: number }> = {};
        ICON_FILES.forEach(icon => { lastVelocities[icon] = { vx: 0, vy: 0 }; });

        // --- フレーム間再利用バッファ（毎フレームのオブジェクト生成を排除）---
        const _activePositions: ActivePosition[] = ICON_FILES.map(icon => (
            { id: icon, x: 0, y: 0, floor: '', vx: 0, vy: 0, isFinished: false }
        ));
        let _activeCount = 0;
        const _targets: Record<string, { x: number; y: number; floor: string; isFinished: boolean }> = {};
        ICON_FILES.forEach(icon => { _targets[icon] = { x: 0, y: 0, floor: '', isFinished: false }; });

        let animId: number;

        const animate = (timestamp: number) => {
            const { isPlaying, playbackSpeed, currentTime: storeTime, presets, activePresetId: currentPresetId } = useAppStore.getState();
            const activePreset = presets.find(p => p.id === currentPresetId);
            const deadIcons: string[] = activePreset?.deadIcons ?? [];

            // シーク検出: store 側が大きく変化していたら内部時刻を同期
            if (Math.abs(timeRef.current - storeTime) > SEEK_THRESHOLD) {
                timeRef.current = storeTime;
                lastTsRef.current = null;
            }

            // 時刻進行
            if (isPlaying) {
                if (lastTsRef.current !== null) {
                    const delta = Math.min(timestamp - lastTsRef.current, 100);
                    const deltaFrames = (delta / 1000) * TARGET_FPS * (playbackSpeed || 1.0);
                    timeRef.current += deltaFrames;
                    const max = maxDurationRef.current;
                    if (max > 0 && timeRef.current > max + LOOP_DELAY_FRAMES) {
                        // ループ折り返し: Zustand も即座に 0 へ合わせてシーク誤検知を防ぐ
                        timeRef.current = 0;
                        useAppStore.setState({ currentTime: 0 });
                    }
                }
                lastTsRef.current = timestamp;
            } else {
                lastTsRef.current = null;
            }

            const currentTime = timeRef.current;

            // 1. 全キャラの目標座標を計算（プールスロット上書き、新規オブジェクト生成なし）
            // 非active icon の _targets.floor を '' にリセットして visible(false) を保証
            for (let i = 0; i < ICON_FILES.length; i++) _targets[ICON_FILES[i]].floor = '';
            _activeCount = 0;
            ICON_FILES.forEach(icon => {
                if (deadIcons.includes(icon)) return;
                const entry = pathCacheRef.current.get(icon);
                if (!entry) return;

                const pos = calculateRawPositionCached(entry.charData, currentTime, entry.cached);
                if (!pos || !pos.visible) return;

                let { vx, vy } = pos;
                const lv = lastVelocities[icon];
                if (Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001) {
                    lv.vx = vx; lv.vy = vy;
                } else {
                    vx = lv.vx; vy = lv.vy;
                }

                const slot = _activePositions[_activeCount];
                slot.id = icon;
                slot.x = pos.x;
                slot.y = pos.y;
                slot.floor = pos.floor;
                slot.vx = vx;
                slot.vy = vy;
                slot.isFinished = pos.isFinished;
                _activeCount++;
            });

            // 2. 衝突オフセット計算（count を渡して余分なスロットをスキップ）
            const offsets = getCollisionOffsets(_activePositions, ICON_SIZE, _activeCount);

            // 3. 最終目標座標を合成（インプレース更新、新規オブジェクト生成なし）
            for (let i = 0; i < _activeCount; i++) {
                const p = _activePositions[i];
                const off = offsets[p.id];
                const t = _targets[p.id];
                t.x = p.x + off.x;
                t.y = p.y + off.y;
                t.floor = p.floor;
                t.isFinished = p.isFinished;
            }

            // 4. 全 icon × 全 floorId の Konva ノードを直接操作（React 再レンダリングを経由しない）
            ICON_FILES.forEach(icon => {
                FLOOR_IDS.forEach(floorId => {
                    const node = charNodeRefs.current.get(`${icon}:${floorId}`);
                    if (!node) return;

                    const target = _targets[icon];
                    if (!target || target.floor !== floorId) {
                        node.visible(false);
                        return;
                    }

                    const prev = currentVisualPositions.current[icon];
                    const floorChanged = prev !== undefined && prev.floor !== target.floor;

                    let newX: number;
                    let newY: number;
                    if (!prev || floorChanged) {
                        newX = target.x;
                        newY = target.y;
                    } else {
                        const diffX = target.x - prev.x;
                        const diffY = target.y - prev.y;
                        const distSq = diffX * diffX + diffY * diffY;
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
                    }

                    node.x(newX);
                    node.y(newY);
                    node.visible(true);
                    currentVisualPositions.current[icon] = { x: newX, y: newY, floor: target.floor };
                });
            });

            // Zustand への currentTime 書き込みを 4 フレームに 1 回に絞る（タイムライン UI 更新用）
            frameCountRef.current++;
            if (frameCountRef.current % ZUSTAND_WRITE_INTERVAL === 0) {
                useAppStore.setState({ currentTime });
            }

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);
};
