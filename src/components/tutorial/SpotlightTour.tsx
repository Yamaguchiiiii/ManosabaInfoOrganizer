import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store';

export interface TourStep {
    target: string;                 // data-tour 属性値（ハイライト対象）
    title: string;
    body: React.ReactNode;
    mode?: 'create' | 'animate' | 'note'; // 表示前にこのページへ切り替える
    placement?: 'auto' | 'top' | 'bottom';
}

interface Rect { top: number; left: number; width: number; height: number; }

interface SpotlightTourProps {
    open: boolean;
    steps: TourStep[];
    onClose: () => void;
}

const PAD = 8;       // ハイライトの余白
const CARD_W = 320;  // 吹き出し幅

export const SpotlightTour: React.FC<SpotlightTourProps> = ({ open, steps, onClose }) => {
    const setMode = useAppStore(s => s.setMode);
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);

    const step = steps[index];

    // 対象を計測（必要ならページ切替してから少し待って計測）。見つかれば true。
    const measure = useCallback(() => {
        if (!step) return false;
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        if (!el) { setRect(null); return false; }
        const r = el.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) { setRect(null); return false; }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return true;
    }, [step]);

    useLayoutEffect(() => {
        if (!open || !step) return;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const switching = step.mode && useAppStore.getState().mode !== step.mode;
        if (switching && step.mode) setMode(step.mode);
        // 遅延マウントする対象（操作盤やCanvas）にも追従するよう、複数回リトライ計測する。
        const delays = switching ? [380, 600, 900, 1300] : [0, 120, 400, 800];
        delays.forEach(d => timers.push(setTimeout(() => measure(), d)));
        return () => timers.forEach(clearTimeout);
    }, [open, index, step, setMode, measure]);

    useEffect(() => {
        if (!open) return;
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onResize, true);
        return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
    }, [open, measure]);

    useEffect(() => { if (open) setIndex(0); }, [open]);

    if (!open || !step) return null;

    const isLast = index === steps.length - 1;
    const next = () => { if (isLast) onClose(); else setIndex(i => Math.min(i + 1, steps.length - 1)); };
    const back = () => setIndex(i => Math.max(i - 1, 0));

    // 吹き出し位置（対象の下、入らなければ上、対象が無ければ中央）
    const vh = window.innerHeight, vw = window.innerWidth;
    let cardTop: number, cardLeft: number;
    if (rect) {
        const below = rect.top + rect.height + 14;
        const wantTop = step.placement === 'top' || (step.placement !== 'bottom' && below + 180 > vh);
        cardTop = wantTop ? Math.max(12, rect.top - 14 - 170) : below;
        cardLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 12);
    } else {
        cardTop = vh / 2 - 90; cardLeft = vw / 2 - CARD_W / 2;
    }

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000 }}>
            {/* クリックを遮るための透明ブロッカー（背後のアプリ操作を防ぐ） */}
            <div style={{ position: 'absolute', inset: 0, background: rect ? 'transparent' : 'rgba(0,0,0,0.6)' }} />

            {/* ハイライト（box-shadow でくり抜き表現） */}
            {rect && (
                <div
                    style={{
                        position: 'absolute',
                        top: rect.top - PAD, left: rect.left - PAD,
                        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
                        borderRadius: 10,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px #007acc inset',
                        pointerEvents: 'none',
                        transition: 'all 0.25s ease',
                    }}
                />
            )}

            {/* 吹き出しカード */}
            <div
                style={{
                    position: 'absolute', top: cardTop, left: cardLeft, width: CARD_W,
                    background: '#252526', color: '#e6e6e6',
                    border: '1px solid #007acc', borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.55)', padding: 16,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {steps.map((_, i) => (
                            <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === index ? '#007acc' : '#555' }} />
                        ))}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>{index + 1} / {steps.length}</span>
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: 6, color: '#fff' }}>{step.title}</div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#cfcfcf' }}>{step.body}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                    <button onClick={onClose} style={btnGhost}>スキップ</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {index > 0 && <button onClick={back} style={btnGhost}>◂ 戻る</button>}
                        <button onClick={next} style={btnPrimary}>{isLast ? '完了' : '次へ ▸'}</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const btnGhost: React.CSSProperties = {
    background: 'transparent', border: '1px solid #555', color: '#bbb',
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
};
const btnPrimary: React.CSSProperties = {
    background: '#007acc', border: 'none', color: '#fff',
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
};
