import React, { useEffect, useState } from 'react';
import { useAppStore, usePlaybackStore } from '../store';
import { formatCharName } from '../utils/charName';
import { TARGET_FPS } from '../constants';
import { usePresetEvents } from '../hooks/usePresetEvents';
import { EventList } from './common/EventList';
import { formatTime } from '../utils/timeFormat';

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];

export const AnimationTimeline: React.FC = () => {
    // ▼ 修正: 再生中のシークバー更新頻度を「1秒ごと」に制限
    // 再生の一時状態は永続化しない usePlaybackStore から取得する
    const displayTime = usePlaybackStore(state => {
        if (!state.isPlaying) return state.currentTime; // 停止・ドラッグ中はリアルタイム
        return Math.floor(state.currentTime / TARGET_FPS) * TARGET_FPS; // 再生中は再レンダリングをブロック
    });

    const setCurrentTime = usePlaybackStore(state => state.setCurrentTime);
    const isPlaying = usePlaybackStore(state => state.isPlaying);
    const setIsPlaying = usePlaybackStore(state => state.setIsPlaying);
    const playbackSpeed = usePlaybackStore(state => state.playbackSpeed);
    const setPlaybackSpeed = usePlaybackStore(state => state.setPlaybackSpeed);
    const presets = useAppStore(state => state.presets);
    const activePresetId = useAppStore(state => state.activePresetId);
    const setActivePresetId = useAppStore(state => state.setActivePresetId);

    useEffect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            if (e.target instanceof HTMLCanvasElement) {
                setIsPlaying(false);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown, true);
        return () => window.removeEventListener('pointerdown', handlePointerDown, true);
    }, [setIsPlaying]);

    // 全体尺 + イベント（⚇遭遇 / 💬会話）を一元算出（20.md #9。offset計算の重複は revise No.14 で解消）。
    const { maxDuration, events } = usePresetEvents();
    const passEvents = events.filter(e => e.kind === 'pass');
    const talkEvents = events.filter(e => e.kind !== 'pass');

    const [showEvents, setShowEvents] = useState(false);

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

                {/* イベント（⚇遭遇/💬会話）ログのトグル。件数を表示し、クリックで一覧を開く。20.md #9 */}
                {events.length > 0 && (
                    <button
                        onClick={() => setShowEvents(v => !v)}
                        title="会話・遭遇の一覧"
                        style={{
                            background: showEvents ? 'rgba(20,180,180,0.25)' : '#333',
                            border: '1px solid #178c8c', borderRadius: '4px', color: '#5fd0d0',
                            padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                        }}
                    >
                        🗓 イベント {events.length}
                    </button>
                )}

                {/* 2行目: 現在の再生時間 | 再生バー | アニメーション全体の時間（幅100%で折り返す） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: '1.1rem', minWidth: '80px', textAlign: 'center' }}>
                        {formatTime(displayTime)}
                    </div>

                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                            type="range"
                            min="0"
                            max={maxDuration}
                            value={displayTime}
                            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                            style={{ width: '100%', cursor: 'pointer' }}
                        />
                        {/* ⚇ 遭遇（syncすれ違い/合流）: 金色の目盛りを重ねる（クリックは奪わない） */}
                        {passEvents.map((m, i) => (
                            <div
                                key={i}
                                title={`${m.label} で遭遇`}
                                style={{
                                    position: 'absolute', left: `${(m.t / maxDuration) * 100}%`,
                                    top: 0, bottom: 0, width: 2, transform: 'translateX(-1px)',
                                    background: 'var(--gold, #d4a94f)', borderRadius: 1, pointerEvents: 'none',
                                }}
                            />
                        ))}
                        {/* 💬 会話（同室自動検出+明示記録）: バー下端にシアンのティック（tEndが無い明示会話は点） */}
                        {talkEvents.map((e, i) => (
                            <div
                                key={i}
                                title={`${e.label}: ${e.charIds.map(formatCharName).join('・')}`}
                                style={{
                                    position: 'absolute', left: `${(Math.max(0, e.t) / maxDuration) * 100}%`,
                                    bottom: -2, height: 4, borderRadius: 2, pointerEvents: 'none',
                                    ...(e.tEnd !== undefined
                                        ? { width: `${Math.max(2, ((Math.min(e.tEnd, maxDuration) - Math.max(0, e.t)) / maxDuration) * 100)}%` }
                                        : { width: '4px' }),
                                    background: '#2fd0d0', opacity: 0.7,
                                }}
                            />
                        ))}

                        {/* イベント一覧（トグル）。クリックでその時刻へジャンプ。 */}
                        {showEvents && (
                            <div style={{
                                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
                                maxHeight: '160px', overflowY: 'auto', background: '#1c1c1c',
                                border: '1px solid #178c8c', borderRadius: '6px', padding: '6px', zIndex: 50,
                                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                            }}>
                                <EventList events={events} onJump={(t) => { setCurrentTime(t); setShowEvents(false); }} />
                            </div>
                        )}
                    </div>

                    <div style={{ color: '#888', fontFamily: 'monospace', fontSize: '1.1rem', minWidth: '80px', textAlign: 'center' }}>
                        {formatTime(maxDuration)}
                    </div>
                </div>
            </div>
        </div>
    );
};