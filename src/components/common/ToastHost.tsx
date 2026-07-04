import React from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, ToastItem } from '../../services/toast';

// トースト表示ホスト（画面下中央に積む）。App 直下に1つ置く。ui.md P1。
const colorFor = (type: ToastItem['type']): string => {
    if (type === 'success') return 'var(--success, #10b981)';
    if (type === 'error') return 'var(--danger, #ef4444)';
    return 'var(--focus-strong, #007acc)';
};

export const ToastHost: React.FC = () => {
    const toasts = useToastStore(s => s.toasts);
    if (toasts.length === 0) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
                zIndex: 3000, pointerEvents: 'none',
            }}
        >
            {toasts.map(t => (
                <div
                    key={t.id}
                    style={{
                        background: 'var(--surface-3, #2f2f33)',
                        color: 'var(--text-primary, #e6e6e6)',
                        borderLeft: `3px solid ${colorFor(t.type)}`,
                        borderRadius: 'var(--radius-2, 8px)',
                        padding: '10px 16px',
                        fontSize: 'var(--fs-sm, 0.85rem)',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
                        maxWidth: '80vw',
                        animation: 'toast-in 160ms ease',
                    }}
                >
                    {t.message}
                </div>
            ))}
            <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>,
        document.body
    );
};
