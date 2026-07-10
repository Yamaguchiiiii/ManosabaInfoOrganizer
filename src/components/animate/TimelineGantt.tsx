import React, { useMemo } from 'react';
import { useAppStore, usePlaybackStore } from '../../store';
import { formatCharName } from '../../utils/charName';
import { TARGET_FPS } from '../../constants';
import { usePresetEvents } from '../../hooks/usePresetEvents';
import { resolveStartTimes, normalizeTimelineData, precomputePath, computeAnchors, getNodeVisitTimes } from '../../utils/animationUtils';

// F2: キャラ行動ガントバー。1キャラ=1行、帯=移動、濃帯=滞在、ドット=イベント（⚇遭遇/💬会話）。
interface GanttRow {
    charId: string;
    spanStart: number;
    spanEnd: number;
    stays: { start: number; end: number }[];
    isDead: boolean;
}

const ROW_HEIGHT = 22;

export const TimelineGantt: React.FC = () => {
    const presets = useAppStore(s => s.presets);
    const activePresetId = useAppStore(s => s.activePresetId);
    const nodes = useAppStore(s => s.nodes);
    const eventFilterChar = useAppStore(s => s.eventFilterChar);
    const setEventFilterChar = useAppStore(s => s.setEventFilterChar);
    const setCurrentTime = usePlaybackStore(s => s.setCurrentTime);
    // シークバーと同様、再生中は1秒間引きで縦線を更新する（15キャラ同時でも60fps維持）
    const displayTime = usePlaybackStore(state => {
        if (!state.isPlaying) return state.currentTime;
        return Math.floor(state.currentTime / TARGET_FPS) * TARGET_FPS;
    });

    const { offset, maxDuration, events } = usePresetEvents();
    const activePreset = presets.find(p => p.id === activePresetId);

    const rows = useMemo<GanttRow[]>(() => {
        if (!activePreset?.data) return [];
        const resolvedStarts = resolveStartTimes(activePreset.data, nodes);
        const deadIcons = activePreset.deadIcons || [];
        return Object.entries(activePreset.data)
            .map(([charId, raw]) => {
                const base = normalizeTimelineData(raw);
                if (!base) return null;
                // startRef を使うキャラも動的解決後の絶対開始時刻で計算する（presetTiming.tsと同じパターン）
                const charData = { ...base, startTime: resolvedStarts[charId] ?? base.startTime ?? 0 };
                const cached = precomputePath(charData.path, nodes);
                const anchors = computeAnchors(charData, cached);
                if (anchors.length === 0) return null;
                const spanStart = anchors[0].time - offset;
                const spanEnd = anchors[anchors.length - 1].time - offset;

                // 滞在(stayTime)は path 上の連続重複ノードなので、ユニーク地点ごとに訪問区間を集める
                const uniqueNodeIds = Array.from(new Set(charData.path));
                const stays: { start: number; end: number }[] = [];
                uniqueNodeIds.forEach(nodeId => {
                    getNodeVisitTimes(charData, nodeId, nodes).forEach(v => {
                        if (v.departure > v.arrival) stays.push({ start: v.arrival - offset, end: v.departure - offset });
                    });
                });

                return { charId, spanStart, spanEnd, stays, isDead: deadIcons.includes(charId) };
            })
            .filter((r): r is GanttRow => r !== null)
            .sort((a, b) => a.spanStart - b.spanStart);
    }, [activePreset, nodes, offset]);

    if (rows.length === 0) return null;

    const pct = (t: number) => `${(Math.min(maxDuration, Math.max(0, t)) / maxDuration) * 100}%`;

    return (
        <div style={{ maxHeight: '35vh', overflowY: 'auto', borderTop: '1px solid #333', background: '#1a1a1a' }}>
            {rows.map(row => {
                const rowEvents = events.filter(e => e.charIds.includes(row.charId));
                const isFiltered = eventFilterChar === row.charId;
                return (
                    <div
                        key={row.charId}
                        onClick={() => setEventFilterChar(isFiltered ? null : row.charId)}
                        title="クリックでイベント一覧をこのキャラで絞り込み"
                        style={{
                            display: 'flex', alignItems: 'center', height: ROW_HEIGHT, cursor: 'pointer',
                            opacity: row.isDead ? 0.4 : 1,
                            background: isFiltered ? 'rgba(102,179,255,0.1)' : 'transparent',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 110, flexShrink: 0, padding: '0 6px', overflow: 'hidden' }}>
                            <img src={`./icon/${row.charId}`} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            <span style={{
                                fontSize: '0.7rem', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                textDecoration: row.isDead ? 'line-through' : 'none',
                            }}>
                                {formatCharName(row.charId)}
                            </span>
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                            {/* 移動帯 */}
                            <div
                                onClick={(e) => { e.stopPropagation(); setCurrentTime(Math.max(0, row.spanStart)); }}
                                title={`${formatCharName(row.charId)}: ${Math.round(row.spanStart)}〜${Math.round(row.spanEnd)}fr`}
                                style={{
                                    position: 'absolute', top: '35%', height: '30%',
                                    left: pct(row.spanStart),
                                    width: `max(2px, calc(${pct(row.spanEnd)} - ${pct(row.spanStart)}))`,
                                    background: 'var(--focus, #66b3ff)', opacity: 0.35, borderRadius: 2,
                                }}
                            />
                            {/* 滞在帯（濃い帯） */}
                            {row.stays.map((s, i) => (
                                <div
                                    key={i}
                                    onClick={(e) => { e.stopPropagation(); setCurrentTime(Math.max(0, s.start)); }}
                                    title={`滞在: ${Math.round(s.start)}〜${Math.round(s.end)}fr`}
                                    style={{
                                        position: 'absolute', top: '20%', height: '60%',
                                        left: pct(s.start),
                                        width: `max(2px, calc(${pct(s.end)} - ${pct(s.start)}))`,
                                        background: 'var(--gold, #d4a94f)', opacity: 0.4, borderRadius: 2,
                                    }}
                                />
                            ))}
                            {/* イベントドット（⚇遭遇=金 / 💬会話=シアン） */}
                            {rowEvents.map((e, i) => (
                                <div
                                    key={i}
                                    onClick={(ev) => { ev.stopPropagation(); setCurrentTime(Math.max(0, e.t)); }}
                                    title={`${e.kind === 'pass' ? '⚇ 遭遇' : '💬 会話'}: ${e.label}`}
                                    style={{
                                        position: 'absolute', top: '50%', width: 8, height: 8, borderRadius: '50%',
                                        left: pct(e.t), transform: 'translate(-50%, -50%)',
                                        background: e.kind === 'pass' ? 'var(--gold, #d4a94f)' : '#2fd0d0',
                                        border: '1px solid rgba(0,0,0,0.4)',
                                    }}
                                />
                            ))}
                            {/* 現在時刻の縦線 */}
                            <div
                                style={{
                                    position: 'absolute', top: 0, bottom: 0, width: 1,
                                    left: pct(displayTime),
                                    background: 'rgba(255,255,255,0.5)', pointerEvents: 'none',
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
