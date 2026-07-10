import React from 'react';
import { TimedEvent } from '../../hooks/usePresetEvents';
import { formatTime } from '../../utils/timeFormat';
import { formatCharName } from '../../utils/charName';

const BADGE: Record<TimedEvent['kind'], { icon: string; color: string; label: string }> = {
    'talk':      { icon: '💬', color: '#5fd0d0', label: '会話' },
    'auto-talk': { icon: '💬', color: '#5fd0d0', label: '会話' },
    'pass':      { icon: '⚇',  color: 'var(--gold, #d4a94f)', label: '遭遇' },
};

export const EventList: React.FC<{ events: TimedEvent[]; onJump: (t: number) => void; emptyText?: string }> =
({ events, onJump, emptyText = 'イベントはありません' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.length === 0 && <div style={{ color: '#666', fontSize: '0.75rem', padding: '4px 8px' }}>{emptyText}</div>}
        {events.map((e, i) => (
            <div key={i}
                onClick={() => onJump(Math.max(0, e.t))}
                style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', color: '#ddd' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = '#2a2a2a')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                <span title={BADGE[e.kind].label} style={{ color: BADGE[e.kind].color, flexShrink: 0 }}>{BADGE[e.kind].icon}</span>
                <span style={{ color: BADGE[e.kind].color, flexShrink: 0, fontFamily: 'monospace' }}>{formatTime(Math.max(0, e.t))}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{e.label}</b>: {e.charIds.map(formatCharName).join('・')}
                </span>
            </div>
        ))}
    </div>
);
