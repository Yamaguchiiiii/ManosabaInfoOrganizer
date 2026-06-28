import React from 'react';

// いつでもヘルプ＆ショートカットを開く常設ボタン（右下）。
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        data-tour="help-button"
        onClick={onClick}
        title="ヘルプ＆ショートカット (F1 / Shift+/)"
        style={{
            position: 'fixed', right: 14, bottom: 14, zIndex: 9500,
            width: 40, height: 40, borderRadius: '50%',
            background: '#252526', color: '#66b3ff',
            border: '1px solid #007acc', cursor: 'pointer',
            fontSize: '1.2rem', fontWeight: 'bold',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
    >?</button>
);
