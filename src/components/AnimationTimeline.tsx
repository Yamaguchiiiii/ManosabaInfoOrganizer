import React, { useMemo, useEffect, useState } from 'react';
import { useAppStore, usePlaybackStore } from '../store';
import { resolveStartTimes, normalizeTimelineData, precomputePath, computeAnchors } from '../utils/animationUtils';
import { detectEncounters, Encounter } from '../utils/encounterDetection';
import { formatCharName } from '../utils/charName';
import { TARGET_FPS } from '../constants';

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
    const nodes = useAppStore(state => state.nodes);

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

    // 全体尺 + sync マーカー + 遭遇（同室）を同時に算出する（オフセット補正済み）。
    const { maxDuration, syncMarkers, encounters } = useMemo(() => {
        const empty = { maxDuration: 300, syncMarkers: [] as { t: number; label: string }[], encounters: [] as Encounter[] };
        if (!activePreset || !activePreset.data) return empty;

        // Animate と同じく、開始条件(startRef)解決＋合流アンカーで各キャラの開始/終了時刻を求める。
        const resolvedStarts = resolveStartTimes(activePreset.data, nodes);
        const spans: { start: number; end: number }[] = [];
        const rawMarkers: { time: number; label: string }[] = [];
        Object.entries(activePreset.data).forEach(([id, raw]) => {
            const base = normalizeTimelineData(raw);
            if (!base) return;
            const charData = { ...base, startTime: resolvedStarts[id] ?? base.startTime ?? 0 };
            const cached = precomputePath(charData.path, nodes);
            const anchors = computeAnchors(charData, cached);
            if (anchors.length === 0) return;
            spans.push({ start: anchors[0].time, end: anchors[anchors.length - 1].time });
            (base.syncConstraints || []).forEach(sc => rawMarkers.push({ time: sc.meetingTime, label: sc.waypointName }));
        });
        if (spans.length === 0) return empty;

        const minStart = Math.min(...spans.map(s => s.start));
        const offset = (Number.isFinite(minStart) && minStart > 0) ? minStart : 0;
        const max = Math.max(...spans.map(s => s.end - offset));
        const maxDur = Math.max(max + 60, 300);

        const markers = rawMarkers
            .map(m => ({ t: m.time - offset, label: m.label }))
            .filter(m => m.t >= 0 && m.t <= maxDur)
            .sort((a, b) => a.t - b.t);

        // 遭遇（同室）: オフセット補正して尺内のものだけ
        const enc = detectEncounters(activePreset.data, nodes, resolvedStarts)
            .map(e => ({ ...e, start: e.start - offset, end: e.end - offset }))
            .filter(e => e.end >= 0 && e.start <= maxDur);

        return { maxDuration: maxDur, syncMarkers: markers, encounters: enc };
    }, [activePreset, nodes]);

    const [showEncounters, setShowEncounters] = useState(false);

    const formatTime = (frames: number) => {
        const seconds = Math.floor(frames / TARGET_FPS);
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = (seconds % 60).toString().padStart(2, '0');
        const ff = Math.floor(frames % TARGET_FPS).toString().padStart(2, '0');
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

                {/* 遭遇（同室）ログのトグル。件数を表示し、クリックで一覧を開く。B-6 */}
                {encounters.length > 0 && (
                    <button
                        onClick={() => setShowEncounters(v => !v)}
                        title="同じ部屋に居合わせた組み合わせ"
                        style={{
                            background: showEncounters ? 'rgba(20,180,180,0.25)' : '#333',
                            border: '1px solid #178c8c', borderRadius: '4px', color: '#5fd0d0',
                            padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                        }}
                    >
                        ⚇ 遭遇 {encounters.length}
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
                        {/* sync マーカー: 合流/すれ違い時刻に金色の目盛りを重ねる（クリックは奪わない） */}
                        {syncMarkers.map((m, i) => (
                            <div
                                key={i}
                                title={`${m.label} で合流`}
                                style={{
                                    position: 'absolute', left: `${(m.t / maxDuration) * 100}%`,
                                    top: 0, bottom: 0, width: 2, transform: 'translateX(-1px)',
                                    background: 'var(--gold, #d4a94f)', borderRadius: 1, pointerEvents: 'none',
                                }}
                            />
                        ))}
                        {/* 遭遇（同室）帯: バー下端にシアンのティック（クリックは奪わない・一覧から時刻へジャンプ） */}
                        {encounters.map((e, i) => (
                            <div
                                key={i}
                                title={`${e.nodeName}: ${e.charIds.map(formatCharName).join('・')}`}
                                style={{
                                    position: 'absolute', left: `${(Math.max(0, e.start) / maxDuration) * 100}%`,
                                    bottom: -2, height: 4, borderRadius: 2, pointerEvents: 'none',
                                    width: `${Math.max(2, ((Math.min(e.end, maxDuration) - Math.max(0, e.start)) / maxDuration) * 100)}%`,
                                    background: '#2fd0d0', opacity: 0.7,
                                }}
                            />
                        ))}

                        {/* 遭遇ログ一覧（トグル）。クリックでその時刻へジャンプ。 */}
                        {showEncounters && (
                            <div style={{
                                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
                                maxHeight: '160px', overflowY: 'auto', background: '#1c1c1c',
                                border: '1px solid #178c8c', borderRadius: '6px', padding: '6px', zIndex: 50,
                                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                            }}>
                                {encounters.map((e, i) => (
                                    <div
                                        key={i}
                                        onClick={() => { setCurrentTime(Math.max(0, e.start)); setShowEncounters(false); }}
                                        style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', color: '#ddd' }}
                                        onMouseEnter={ev => (ev.currentTarget.style.background = '#2a2a2a')}
                                        onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                                    >
                                        <span style={{ color: '#5fd0d0', flexShrink: 0 }}>{formatTime(Math.max(0, e.start))}</span>
                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <b>{e.nodeName}</b>: {e.charIds.map(formatCharName).join('・')}
                                        </span>
                                    </div>
                                ))}
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