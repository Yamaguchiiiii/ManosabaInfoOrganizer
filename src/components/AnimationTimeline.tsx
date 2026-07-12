import React, { useEffect, useState } from 'react';
import { useAppStore, usePlaybackStore } from '../store';
import { formatCharName } from '../utils/charName';
import { TARGET_FPS } from '../constants';
import { usePresetEvents, TimedEvent } from '../hooks/usePresetEvents';
import { usePresetSyncIssues } from '../hooks/usePresetSyncIssues';
import { formatTime } from '../utils/timeFormat';
import { TimelineGantt } from './animate/TimelineGantt';
import { EventList } from './common/EventList';
import { useViewport } from '../hooks/useViewport';
import { toast } from '../services/toast';

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];

export const AnimationTimeline: React.FC<{ onEventJump?: (e: TimedEvent) => void }> = ({ onEventJump }) => {
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
    const playbackPinned = useAppStore(state => state.playbackPinned);
    const setPlaybackPinned = useAppStore(state => state.setPlaybackPinned);
    // モバイルは常に下部固定バーで、フローティング互換モードの概念自体がないため📌は出さない
    const isMobile = useViewport() === 'mobile';

    useEffect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement;
            if (!(t instanceof HTMLCanvasElement)) return;
            // 事件ノート（.notes-section=デスクトップ / .note-body=モバイル）内の canvas では停止しない
            // （revise3 B-17: 判定が canvas 全般だったため、ノートへの書き込み/選択だけで再生が毎回止まっていた）
            if (t.closest('.notes-section, .note-body')) return;
            setIsPlaying(false);
        };
        window.addEventListener('pointerdown', handlePointerDown, true);
        return () => window.removeEventListener('pointerdown', handlePointerDown, true);
    }, [setIsPlaying]);

    // 全体尺 + イベント（⚇遭遇 / 💬会話）を一元算出（20.md #9。offset計算の重複は revise No.14 で解消）。
    const { maxDuration, events } = usePresetEvents();
    const passEvents = events.filter(e => e.kind === 'pass');
    const talkEvents = events.filter(e => e.kind !== 'pass');
    const syncIssues = usePresetSyncIssues();
    const syncErrors = syncIssues.filter(i => i.level === 'error');
    const syncWarns = syncIssues.filter(i => i.level === 'warn');

    const [showGantt, setShowGantt] = useState(false);
    const [showEvents, setShowEvents] = useState(false);

    return (
        <div style={{
            width: '100%',
            backgroundColor: 'var(--surface-2)',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '12px',
                padding: isMobile ? '8px 10px' : '10px 20px', borderBottom: '1px solid var(--border-default)',
                // 操作群(preset|speed|play|…)は1行に収める。プリセット選択が可変幅(flex)で余りを吸収するため、
                // 固定幅の小要素だけなら折り返さない。2行目のシークバー(width:100%)だけが次行へ回る。
                flexWrap: 'wrap'
            }}>
                {/* 1行目: プリセット | 速度 | Play （デスクトップはここで折り返す） */}
                <select
                    value={activePresetId}
                    onChange={(e) => setActivePresetId(e.target.value)}
                    style={{
                        background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
                        borderRadius: '4px', padding: isMobile ? '5px 6px' : '5px 10px', fontSize: isMobile ? '0.8rem' : '0.9rem',
                        cursor: 'pointer',
                        // モバイル: 唯一の可変幅要素として横幅を吸収し、他要素を1行に収める
                        ...(isMobile ? { flex: '1 1 40px', minWidth: 0, maxWidth: 'none' } : { maxWidth: '150px' })
                    }}
                >
                    {presets.map(preset => (
                        <option key={preset.id} value={preset.id}>
                            {preset.name}
                        </option>
                    ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    {/* モバイルは幅節約のため "Speed:" ラベルを省く（x1 等の選択肢で自明） */}
                    {!isMobile && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Speed:</span>}
                    <select
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                        title="再生速度"
                        style={{
                            background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)',
                            borderRadius: '4px', padding: '2px 5px', fontSize: isMobile ? '0.8rem' : '0.9rem', cursor: 'pointer'
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
                        padding: isMobile ? '5px 10px' : '5px 15px', cursor: 'pointer', fontWeight: 'bold',
                        flexShrink: 0
                    }}
                >
                    {isPlaying ? 'Pause' : 'Play'}
                </button>

                {/* 0711 #8: モバイルに ContextPanel が無いため、再生バー下に一覧を展開できるトグルボタン化 */}
                {events.length > 0 && (
                    <button
                        onClick={() => setShowEvents(v => !v)}
                        title="会話・遭遇の一覧（クリックでジャンプ）"
                        style={{
                            background: showEvents ? 'rgba(95,208,208,0.15)' : 'var(--surface-3, #333)',
                            border: '1px solid var(--talk-strong)', borderRadius: '4px', color: 'var(--talk)',
                            padding: '5px 10px', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        🗓 {events.length}
                    </button>
                )}

                {/* sync 整合性の常設警告バッジ（revise2 №12）。保存時トーストは開いたときしか見えないため */}
                {syncIssues.length > 0 && (
                    <span
                        title={[...syncErrors, ...syncWarns].map(i => i.message).join('\n')}
                        style={{
                            background: syncErrors.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                            border: `1px solid ${syncErrors.length > 0 ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)'}`,
                            color: syncErrors.length > 0 ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)',
                            borderRadius: '4px', padding: '5px 10px', fontSize: '0.85rem', cursor: 'default', flexShrink: 0,
                        }}
                    >
                        ⚠ {syncErrors.length + syncWarns.length}
                    </span>
                )}

                {/* F2: キャラ行動ガントバーのトグル */}
                <button
                    onClick={() => setShowGantt(v => !v)}
                    title="キャラ行動ガントバー"
                    style={{
                        background: showGantt ? 'rgba(102,179,255,0.2)' : 'var(--surface-3)',
                        border: '1px solid var(--border-strong)', borderRadius: '4px', color: showGantt ? '#66b3ff' : 'var(--text-secondary)',
                        padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0,
                    }}
                >
                    📊
                </button>

                {/* U2: 下部固定ドック⇔フローティングの切替。モバイルは常時固定のため出さない */}
                {!isMobile && (
                    <button
                        onClick={() => setPlaybackPinned(!playbackPinned)}
                        title={playbackPinned ? 'フローティング表示に切替' : '下部ドックに固定'}
                        style={{
                            background: playbackPinned ? 'rgba(212,169,79,0.2)' : 'var(--surface-3)',
                            border: '1px solid var(--border-strong)', borderRadius: '4px', color: playbackPinned ? 'var(--gold, #d4a94f)' : 'var(--text-secondary)',
                            padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                        }}
                    >
                        📌
                    </button>
                )}

                {/* 2行目: 現在の再生時間 | 再生バー | アニメーション全体の時間（幅100%で折り返す） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', width: '100%' }}>
                    <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: isMobile ? '0.8rem' : '1.1rem', minWidth: isMobile ? '44px' : '80px', textAlign: 'center' }}>
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
                                    background: 'var(--talk)', opacity: 0.7,
                                }}
                            />
                        ))}
                    </div>

                    <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: isMobile ? '0.8rem' : '1.1rem', minWidth: isMobile ? '44px' : '80px', textAlign: 'center' }}>
                        {formatTime(maxDuration)}
                    </div>
                </div>
            </div>

            {showGantt && <TimelineGantt />}
            {/* 0711 #8: ガントバーと同様、再生バーの下に一覧を展開（モバイルの ContextPanel 不在対策。デスクトップでも使える） */}
            {showEvents && (
                <div style={{ maxHeight: '28vh', overflowY: 'auto', borderTop: '1px solid var(--border-default, #333)' }}>
                    <EventList events={events} onJump={(ev) => {
                        setCurrentTime(Math.max(0, ev.t));
                        onEventJump?.(ev);
                        toast.info(`${formatTime(Math.max(0, ev.t))} / ${ev.label} へジャンプ`);
                    }} />
                </div>
            )}
        </div>
    );
};