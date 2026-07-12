import React from 'react';

// revise3 B-13: スマホの重い OS カラーピッカーを開かずに定番色へ即座に切り替えられるようにする。
const SWATCH_COLORS = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#7c5cff', '#ffffff', '#8b5e3c'];

export const ColorSwatches: React.FC<{ value: string | null; onPick: (c: string) => void }> = ({ value, onPick }) => (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {SWATCH_COLORS.map(c => (
            <button key={c} onClick={() => onPick(c)} title={c}
                style={{ width: 18, height: 18, minWidth: 18, borderRadius: 4, cursor: 'pointer', padding: 0,
                         background: c, border: value?.toLowerCase() === c ? '2px solid var(--focus, #66b3ff)' : '1px solid #555' }} />
        ))}
    </div>
);
