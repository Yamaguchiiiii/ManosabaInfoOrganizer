import React, { useEffect } from 'react';
import { useAppStore } from '../../store';

// 主アクション=アクセント(紫)、破壊的=danger、既定=surface。デザイントークン参照（ui.md）。
const VARIANT_BG: Record<string, string> = {
    primary: 'var(--accent, #7c5cff)',
    danger: 'var(--danger, #ef4444)',
    default: 'var(--surface-4, #444)',
};

/**
 * window.alert / window.confirm の代替となるオーバーレイダイアログ。
 * store の `dialog` 状態を購読し、App 直下に常設マウントする。
 * Web / Tauri 双方で動作する DOM オーバーレイ実装。
 */
export const DialogHost: React.FC = () => {
    const dialog = useAppStore(s => s.dialog);
    const closeDialog = useAppStore(s => s.closeDialog);

    useEffect(() => {
        if (!dialog) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.isComposing || e.keyCode === 229) return; // IME変換中は確定/取消で奪わない
            if (e.key === 'Escape') {
                e.preventDefault();
                // キャンセル相当（cancel ボタンがあればその値、無ければ空文字）
                const cancelBtn = dialog.buttons.find(b => b.value === 'cancel');
                closeDialog(cancelBtn ? cancelBtn.value : '');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // primary ボタンを優先、無ければ最後のボタン
                const primary = dialog.buttons.find(b => b.variant === 'primary') ?? dialog.buttons[dialog.buttons.length - 1];
                if (primary) closeDialog(primary.value);
            }
        };
        window.addEventListener('keydown', handleKey, true);
        return () => window.removeEventListener('keydown', handleKey, true);
    }, [dialog, closeDialog]);

    if (!dialog) return null;

    return (
        <div
            onClick={() => closeDialog('')}
            style={{
                position: 'fixed', inset: 0, zIndex: 5000,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--surface-1, #1e1e1e)', border: '1px solid var(--border-default, #444)', borderRadius: '8px',
                    padding: '20px', minWidth: '320px', maxWidth: '90vw',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.6)', color: 'var(--text-primary, #e0e0e0)',
                }}
            >
                {dialog.title && (
                    <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: '#fff' }}>{dialog.title}</h3>
                )}
                <p style={{ margin: '0 0 20px', fontSize: '0.92rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {dialog.message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                    {dialog.buttons.map(btn => (
                        <button
                            key={btn.value}
                            onClick={() => closeDialog(btn.value)}
                            style={{
                                padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                fontWeight: btn.variant === 'primary' ? 'bold' : 'normal',
                                background: VARIANT_BG[btn.variant || 'default'],
                                color: 'white',
                            }}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
