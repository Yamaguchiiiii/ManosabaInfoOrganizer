import React, { useEffect, useRef } from 'react';
import Konva from 'konva';
import { useAppStore, usePlaybackStore, ICON_FILES, MapNode, CharacterTimelineData } from '../store';
import { precomputePath, PrecomputedPath, calculateRawPositionCached, getCollisionOffsets, PositionWithVelocity, resolveStartTimes } from '../utils/animationUtils';

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
    // 自分が store.currentTime に最後に書き込んだ値。外部シーク(スライダー/リセット)だけを
    // 検出し、自分の throttled 書き込み遅延を誤シーク扱いして巻き戻すのを防ぐために使う。
    const lastWrittenTimeRef = useRef<number>(0);
    const activePresetId = useAppStore(state => state.activePresetId);

    // プリセットが変わったときだけパスキャッシュ・maxDuration を再構築し、時刻をリセット
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);

        pathCacheRef.current.clear();
        timeRef.current = 0;
        lastTsRef.current = null;
        maxDurationRef.current = 0;
        lastWrittenTimeRef.current = 0;
        usePlaybackStore.setState({ currentTime: 0 });

        if (!activePreset) return;

        let max = 0;
        const nodesMap = nodesMapRef.current;
        const data = activePreset.data as Record<string, unknown>;

        // 開始条件(startRef)を持つキャラの開始時刻を動的に解決（循環は0にフォールバック）。
        const allNodes = Object.values(nodesMap);
        const resolvedStarts = resolveStartTimes(data, allNodes);

        // 全キャラの startTime 最小値を求め、先頭の「誰も動かない待機時間」を除去する。
        // 全員を同じ offset でシフトするため、Sync/開始条件 による相対的な時間差は保たれる。
        const charDataList: { icon: string; charData: CharacterTimelineData }[] = [];
        let minStart = Infinity;
        ICON_FILES.forEach(icon => {
            const base = toCharacterTimelineData(data[icon]);
            if (!base) return;
            const startTime = resolvedStarts[icon] ?? base.startTime ?? 0;
            const charData: CharacterTimelineData = { ...base, startTime };
            charDataList.push({ icon, charData });
            if (startTime < minStart) minStart = startTime;
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
            const { presets, activePresetId: currentPresetId } = useAppStore.getState();
            const { isPlaying, playbackSpeed, currentTime: storeTime } = usePlaybackStore.getState();
            const activePreset = presets.find(p => p.id === currentPresetId);
            const deadIcons: string[] = activePreset?.deadIcons ?? [];

            // シーク検出: 「自分が最後に書いた値」と storeTime のズレだけを外部シークとみなす。
            // 旧実装は timeRef と storeTime を比較していたが、currentTime を 4 フレームに 1 回しか
            // 書かないため、低fps時に自分の書き込み遅延を誤シーク扱いして timeRef を巻き戻し、
            // キャラが「前進→巻き戻り」を繰り返す原因になっていた。
            if (Math.abs(storeTime - lastWrittenTimeRef.current) > SEEK_THRESHOLD) {
                timeRef.current = storeTime;
                lastWrittenTimeRef.current = storeTime;
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
                        usePlaybackStore.setState({ currentTime: 0 });
                        lastWrittenTimeRef.current = 0;
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
            //    値が変わったノードだけ setter を呼ぶ。Konva は属性 set のたびに該当レイヤーの
            //    再描画をスケジュールするため、同値 set を避けることで「動いていないフロア」の
            //    レイヤー全再描画を止める。特に各 icon は常に2フロア分のノードが非表示で、
            //    旧実装はそれらに毎フレーム visible(false) を呼んで3レイヤーを毎フレーム dirty に
            //    していた（＝低fps・カクツキの主因）。
            ICON_FILES.forEach(icon => {
                FLOOR_IDS.forEach(floorId => {
                    const node = charNodeRefs.current.get(`${icon}:${floorId}`);
                    if (!node) return;

                    const target = _targets[icon];
                    if (!target || target.floor !== floorId) {
                        if (node.visible()) node.visible(false);
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

                    // 変化したものだけ set（同値 set による無駄な再描画を抑止）
                    if (node.x() !== newX) node.x(newX);
                    if (node.y() !== newY) node.y(newY);
                    if (!node.visible()) node.visible(true);

                    // currentVisualPositions はインプレース更新（毎フレームのオブジェクト生成を排除）
                    if (prev) {
                        prev.x = newX;
                        prev.y = newY;
                        prev.floor = target.floor;
                    } else {
                        currentVisualPositions.current[icon] = { x: newX, y: newY, floor: target.floor };
                    }
                });
            });

            // Zustand への currentTime 書き込みを 4 フレームに 1 回に絞る（タイムライン UI 更新用）
            frameCountRef.current++;
            if (frameCountRef.current % ZUSTAND_WRITE_INTERVAL === 0) {
                usePlaybackStore.setState({ currentTime });
                lastWrittenTimeRef.current = currentTime;
            }

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);
};
