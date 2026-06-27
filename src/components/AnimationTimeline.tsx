import React, { useMemo, useEffect } from 'react';
import { useAppStore, usePlaybackStore } from '../store';

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];

export const AnimationTimeline: React.FC = () => {
    // ▼ 修正: 再生中のシークバー更新頻度を「1秒(30フレーム)ごと」に制限
    // 再生の一時状態は永続化しない usePlaybackStore から取得する
    const displayTime = usePlaybackStore(state => {
        if (!state.isPlaying) return state.currentTime; // 停止・ドラッグ中はリアルタイム
        return Math.floor(state.currentTime / 30) * 30; // 再生中は再レンダリングをブロック
    });

    const setCurrentTime = usePlaybackStore(state => state.setCurrentTime);
    const isPlaying = usePlaybackStore(state => state.isPlaying);
    const setIsPlaying = usePlaybackStore(state => state.setIsPlaying);
    const playbackSpeed = usePlaybackStore(state => state.playbackSpeed);
    const setPlaybackSpeed = usePlaybackStore(state => state.setPlaybackSpeed);
    const presets = useAppStore(state => state.presets);
    const activePresetId = useAppStore(state => state.activePresetId);
    const setActivePresetId = useAppStore(state => state.setActivePresetId);

    const activePreset = presets.find(p => p.id === activePresetId);

    useEffect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            if (e.target instanceof HTMLCanvasElement) {
                setIsPlaying(false);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown, true);
        return () => window.removeEventListener('pointerdown', handlePointerDown, true);
    }, [setIsPlaying]);

    const maxDuration = useMemo(() => {
        if (!activePreset || !activePreset.data) return 300;

        const vals = Object.values(activePreset.data) as any[];

        // useAnimationPositions と同じく startTime 最小値を offset として除去し、
        // タイムラインの長さを正規化後のアニメーションと一致させる
        let minStart = Infinity;
        vals.forEach((val) => {
            const start = (val && val.startTime) || 0;
            if (start < minStart) minStart = start;
        });
        const offset = (Number.isFinite(minStart) && minStart > 0) ? minStart : 0;

        let max = 0;
        vals.forEach((val) => {
            const start = ((val && val.startTime) || 0) - offset;
            const dur = val.duration !== undefined ? val.duration : (Array.isArray(val) ? val.length * 30 : 0);
            const end = start + dur;
            if (end > max) {
                max = end;
            }
        });

        return Math.max(max + 60, 300);
    }, [activePreset]);

    const formatTime = (frames: number) => {
        const seconds = Math.floor(frames / 30);
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = (seconds % 60).toString().padStart(2, '0');
        const ff = Math.floor(frames % 30).toString().padStart(2, '0');
        return `${mm}:${ss}:${ff}`;
    };

    return (
        <div style={{
            width: '100%',
            backgroundColor: '#222',
            borderTop: '1px solid #444',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 20px', borderBottom: '1px solid #333',
                flexWrap: 'wrap'
            }}>
                {/* 1行目: プリセット | 速度 | Play （ここで折り返す） */}
                <select
                    value={activePresetId}
                    onChange={(e) => setActivePresetId(e.target.value)}
                    style={{
                        background: '#333', color: 'white', border: '1px solid #555',
                        borderRadius: '4px', padding: '5px 10px', fontSize: '0.9rem',
                        cursor: 'pointer', maxWidth: '150px'
                    }}
                >
                    {presets.map(preset => (
                        <option key={preset.id} value={preset.id}>
                            {preset.name}
                        </option>
                    ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ color: '#888', fontSize: '0.8rem' }}>Speed:</span>
                    <select
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                        style={{
                            background: '#333', color: 'white', border: '1px solid #555',
                            borderRadius: '4px', padding: '2px 5px', fontSize: '0.9rem', cursor: 'pointer'
                        }}
                    >
                        {SPEED_OPTIONS.map(speed => (
                            <option key={speed} value={speed}>x{speed}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                        background: isPlaying ? '#ef4444' : '#10b981',
                        border: 'none', borderRadius: '4px', color: 'white',
                        padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    {isPlaying ? 'Pause' : 'Play'}
                </button>

                {/* 2行目: 現在の再生時間 | 再生バー | アニメーション全体の時間（幅100%で折り返す） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: '1.1rem', minWidth: '80px', textAlign: 'center' }}>
                        {formatTime(displayTime)}
                    </div>

                    <input
                        type="range"
                        min="0"
                        max={maxDuration}
                        value={displayTime}
                        onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                        style={{ flex: 1, cursor: 'pointer' }}
                    />

                    <div style={{ color: '#888', fontFamily: 'monospace', fontSize: '1.1rem', minWidth: '80px', textAlign: 'center' }}>
                        {formatTime(maxDuration)}
                    </div>
                </div>
            </div>
        </div>
    );
};