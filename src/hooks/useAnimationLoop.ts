import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const TARGET_FPS = 60;
const LOOP_DELAY_FRAMES = 60; // 全員終了後、1秒(60フレーム)待ってからループ

export const useAnimationLoop = () => {
    // コンポーネントの再レンダリング用（isPlayingの監視）
    const isPlaying = useAppStore(state => state.isPlaying);
    
    const requestRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);

    const animate = (time: number) => {
        // ストアの状態を直接取得 (ここで最新の playbackSpeed も取れる)
        const state = useAppStore.getState();

        if (!state.isPlaying) {
            requestRef.current = null;
            lastTimeRef.current = null;
            return;
        }

        if (lastTimeRef.current !== null) {
            const deltaTime = time - lastTimeRef.current;
            const safeDelta = Math.min(deltaTime, 100); 
            
            // ▼▼▼ 修正: ここに state.playbackSpeed を掛ける ▼▼▼
            // デフォルト1.0なら変化なし、2.0なら2倍速でフレームが進む
            const speed = state.playbackSpeed || 1.0; 
            const deltaFrames = (safeDelta / 1000) * TARGET_FPS * speed;

            let nextTime = state.currentTime + deltaFrames;

            // ▼▼▼ 既存のループ判定ロジック (変更なし) ▼▼▼
            // 1. 現在のプリセットを取得
            const activePreset = state.presets.find(p => p.id === state.activePresetId);
            
            let maxDuration = 0;
            if (activePreset && activePreset.data) {
                // 2. 全キャラクターの中で最も遅く終わる時間を探す
                Object.values(activePreset.data).forEach((val: any) => {
                    // データ形式の正規化
                    const start = val.startTime || 0;
                    const dur = val.duration !== undefined ? val.duration : (Array.isArray(val) ? val.length * 30 : 0);
                    const end = start + dur;
                    if (end > maxDuration) {
                        maxDuration = end;
                    }
                });
            }

            // 3. 最大時間 + 余韻を超えたらリセット
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