import { useEffect, useRef } from 'react';
import { useAppStore, CharacterTimelineData } from '../store';

const TARGET_FPS = 60;
const LOOP_DELAY_FRAMES = 60; // 全員終了後、1秒(60フレーム)待ってからループ

export const useAnimationLoop = () => {
    const isPlaying = useAppStore(state => state.isPlaying);
    const activePresetId = useAppStore(state => state.activePresetId);

    const requestRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const maxDurationRef = useRef<number>(0);

    // プリセットが変わったときだけ maxDuration を再計算（毎フレームではない）
    useEffect(() => {
        const { presets } = useAppStore.getState();
        const activePreset = presets.find(p => p.id === activePresetId);
        if (!activePreset?.data) {
            maxDurationRef.current = 0;
            return;
        }
        let max = 0;
        Object.values(activePreset.data as Record<string, unknown>).forEach((val) => {
            let start = 0;
            let dur = 0;
            if (Array.isArray(val) && val.length > 0) {
                dur = val.length * 30;
            } else if (val !== null && typeof val === 'object' && !Array.isArray(val) && 'path' in val) {
                const typedVal = val as CharacterTimelineData;
                start = typedVal.startTime ?? 0;
                dur = typedVal.duration ?? 0;
            }
            const end = start + dur;
            if (end > max) max = end;
        });
        maxDurationRef.current = max;
    }, [activePresetId]);

    const animate = (time: number) => {
        const state = useAppStore.getState();

        if (!state.isPlaying) {
            requestRef.current = null;
            lastTimeRef.current = null;
            return;
        }

        if (lastTimeRef.current !== null) {
            const deltaTime = time - lastTimeRef.current;
            const safeDelta = Math.min(deltaTime, 100);
            const speed = state.playbackSpeed || 1.0;
            const deltaFrames = (safeDelta / 1000) * TARGET_FPS * speed;
            let nextTime = state.currentTime + deltaFrames;

            // maxDuration はプリセット変更時に useEffect で事前計算済み
            const maxDuration = maxDurationRef.current;
            if (maxDuration > 0 && nextTime > maxDuration + LOOP_DELAY_FRAMES) {
                nextTime = 0;
            }

            useAppStore.setState({ currentTime: nextTime });
        }
        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        if (isPlaying) {
            lastTimeRef.current = performance.now();
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = null;
            }
            lastTimeRef.current = null;
        }

        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = null;
            }
        };
    }, [isPlaying]);
};
