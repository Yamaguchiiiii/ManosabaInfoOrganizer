import React, { useState } from 'react';
import { TimedEvent } from '../../hooks/usePresetEvents';
import { formatTime } from '../../utils/timeFormat';
import { formatCharName } from '../../utils/charName';

const BADGE: Record<TimedEvent['kind'], { icon: string; color: string; label: string }> = {
    'talk':      { icon: '💬', color: 'var(--talk, #5fd0d0)', label: '会話' },
    'auto-talk': { icon: '💬', color: 'var(--talk, #5fd0d0)', label: '会話' },
    'pass':      { icon: '⚇',  color: 'var(--gold, #d4a94f)', label: '遭遇' },
};

export const EventList: React.FC<{ events: TimedEvent[]; onJump: (e: TimedEvent) => void; emptyText?: string }> =
({ events, onJump, emptyText = 'イベントはありません' }) => {
    // revise3 B-16: クリックした行を一瞬ハイライトし、どこへ飛んだか気付きやすくする
    const [flashIdx, setFlashIdx] = useState(-1);
    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.length === 0 && <div style={{ color: 'var(--text-disabled, #666)', fontSize: '0.75rem', padding: '4px 8px' }}>{emptyText}</div>}
        {events.map((e, i) => (
            <div key={i} className="event-list-item"
                style={{ background: flashIdx === i ? 'rgba(102,179,255,0.18)' : undefined }}
                onClick={() => { setFlashIdx(i); setTimeout(() => setFlashIdx(-1), 1000); onJump(e); }}>
                {/* 1行目: 種別・時刻・地点 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                    <span title={BADGE[e.kind].label} style={{ color: BADGE[e.kind].color, flexShrink: 0 }}>{BADGE[e.kind].icon}</span>
                    <span style={{ color: BADGE[e.kind].color, flexShrink: 0, fontFamily: 'monospace' }}>{formatTime(Math.max(0, e.t))}</span>
                    {/* 0711_2 #4: どのフロアで起きたか一目で分かるバッジ */}
                    {e.floor && <span style={{ flexShrink: 0, fontSize: '0.68rem', border: '1px solid var(--border-strong)', borderRadius: 3, padding: '0 4px', color: 'var(--text-secondary)' }}>{e.floor}</span>}
                    <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</b>
                </div>
                {/* 2行目: 地点の下にインデントして人物（アイコン+名前・折り返し可）。0711 #3 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', paddingLeft: 22, marginTop: 3 }}>
                    {e.charIds.map(cid => (
                        <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            <img src={`./icon/${cid}`} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.72rem' }}>{formatCharName(cid)}</span>
                        </span>
                    ))}
                </div>
            </div>
        ))}
    </div>
    );
};
