import React from 'react';

// 広告枠。審査通過までアプリ内では AdSense を配信せず、常にハウス枠(プレースホルダ)を出す。
// 親要素（4ペインの右下セル）いっぱいに広がる。
export const AdSlot: React.FC = () => {
    const boxStyle: React.CSSProperties = {
        position: 'relative', width: '100%', height: '100%',
        border: '2px solid #333', borderRadius: 4, background: '#1a1a1a', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    };

    return (
        <div style={boxStyle}>
            <div style={{ color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 1.6, userSelect: 'none' }}>
                <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7 }}>AD</div>
                広告スペース
            </div>
        </div>
    );
};
