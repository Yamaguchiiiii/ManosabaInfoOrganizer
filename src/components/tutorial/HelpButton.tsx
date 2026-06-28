import React from 'react';

// いつでもヘルプ＆ショートカットを開く常設ボタン（サイドバーの右下）。
// 位置は --sidebar-width（.app-container 上の CSS 変数）に追従させ、サイドバー幅が変わっても右下に揃う。
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        data-tour="help-button"
        onClick={onClick}
        title="ヘルプ＆ショートカット (F1 / Shift+/)"
        style={{
            position: 'fixed', left: 'calc(var(--sidebar-width, 250px) - 52px)', bottom: 14, zIndex: 9500,
            width: 40, height: 40, borderRadius: '50%',
            background: '#252526', color: '#66b3ff',
            border: '1px solid #007acc', cursor: 'pointer',
            fontSize: '1.2rem', fontWeight: 'bold',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
    >?</button>
);
