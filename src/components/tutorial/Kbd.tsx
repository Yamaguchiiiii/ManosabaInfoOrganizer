import React from 'react';
import { formatKeys } from '../../data/shortcuts';

const keyStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 22, height: 24, padding: '0 7px',
    background: '#333', color: '#e6e6e6',
    border: '1px solid #555', borderBottomWidth: 2,
    borderRadius: 6, fontSize: '0.78rem', fontFamily: 'monospace', lineHeight: 1,
    boxShadow: '0 1px 0 rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
};

// 押下キー風のチップ。'Mod' 等は OS に応じて整形して表示する。
export const Kbd: React.FC<{ keys: string[] }> = ({ keys }) => {
    const formatted = formatKeys(keys);
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {formatted.map((k, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: '#777', fontSize: '0.7rem' }}>+</span>}
                    <kbd style={keyStyle}>{k}</kbd>
                </React.Fragment>
            ))}
        </span>
    );
};
