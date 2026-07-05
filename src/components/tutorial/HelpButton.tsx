import React from 'react';
import { TOUR_TARGETS } from './tourTargets';
import { useViewport } from '../../hooks/useViewport';

// いつでもヘルプ＆ショートカットを開く常設ボタン。
// デスクトップ=NavRail 最下部(左下)、モバイル=下タブバーの上(右下FAB)で重なりを回避。
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const isMobile = useViewport() === 'mobile';
    const position: React.CSSProperties = isMobile
        ? { right: 12, left: 'auto', bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)' }
        : { left: 12, bottom: 14 };
    return (
        <button
            data-tour={TOUR_TARGETS.helpButton}
            onClick={onClick}
            title="ヘルプ＆ショートカット (F1 / Shift+/)"
            style={{
                position: 'fixed', zIndex: 9500, ...position,
                width: 40, height: 40, borderRadius: '50%',
                background: '#252526', color: '#66b3ff',
                border: '1px solid #007acc', cursor: 'pointer',
                fontSize: '1.2rem', fontWeight: 'bold',
                boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >?</button>
    );
};
