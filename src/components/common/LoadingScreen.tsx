import React, { useState, useEffect } from 'react';

// リロード時（hydration 待ち）とページ遷移時に共用するローディング画面。#06/30-8
// overlay=true で既存コンテンツの上に fixed 表示（遷移中）。false で全画面（初期ロード）。
// visible=false でフェードアウトさせる（20.md #1）。マウント直後は opacity 0 で描画し、
// 次フレームで 1 にすることで初回表示もフェードインになる。
export const LoadingScreen: React.FC<{ text?: string; overlay?: boolean; visible?: boolean }> = ({
    text = 'Loading ...',
    overlay = false,
    visible = true,
}) => {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const opaque = shown && visible;

    return (
        <div
            style={{
                position: overlay ? 'fixed' : 'static',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: overlay ? undefined : '100vh',
                width: overlay ? undefined : '100vw',
                backgroundColor: 'var(--surface-1, #1e1e1e)',
                color: 'var(--text-secondary, #ccc)',
                fontFamily: 'monospace',
                gap: '24px',
                zIndex: 4000, // DialogHost(zIndex:5000) より下、コンテンツより上
                opacity: opaque ? 1 : 0,
                transition: 'opacity 180ms ease',
                pointerEvents: opaque ? 'auto' : 'none',
            }}
        >
            <div style={{ width: '400px', maxWidth: '80%' }}>
                <img src="./logo.png" alt="Logo" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div style={{ fontSize: '1.5rem' }}>{text}</div>
        </div>
    );
};
