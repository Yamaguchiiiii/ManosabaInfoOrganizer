import React, { useEffect, useRef } from 'react';
import { getAdConfig, isWebAdsEnabled, ensureAdSenseLoaded, pushAd } from '../services/ads';

// 広告枠。Web+設定済みなら AdSense を表示し、デスクトップ/未設定時はハウス枠(プレースホルダ)を出す。
// 親要素（4ペインの右下セル）いっぱいに広がる。
export const AdSlot: React.FC = () => {
    const cfg = getAdConfig();
    const enabled = isWebAdsEnabled();
    const insRef = useRef<HTMLModElement>(null);
    const pushedRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        ensureAdSenseLoaded();
        if (pushedRef.current) return;
        // 同じ ins への二重 push を防ぐ（StrictMode の二重実行・再描画対策）。
        const el = insRef.current;
        if (el && el.getAttribute('data-adsbygoogle-status')) {
            pushedRef.current = true;
            return;
        }
        pushAd();
        pushedRef.current = true;
    }, [enabled]);

    const boxStyle: React.CSSProperties = {
        position: 'relative', width: '100%', height: '100%',
        border: '2px solid #333', borderRadius: 4, background: '#1a1a1a', overflow: 'hidden',
    };

    if (!enabled || !cfg) {
        // フォールバック: デスクトップ版 or 広告ID未設定時のハウス枠
        return (
            <div style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 1.6, userSelect: 'none' }}>
                    <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7 }}>AD</div>
                    広告スペース
                </div>
            </div>
        );
    }

    return (
        <div style={boxStyle}>
            <ins
                ref={insRef}
                className="adsbygoogle"
                style={{ display: 'block', width: '100%', height: '100%' }}
                data-ad-client={cfg.client}
                data-ad-slot={cfg.slot}
                data-ad-format="auto"
                data-full-width-responsive="true"
            />
        </div>
    );
};
