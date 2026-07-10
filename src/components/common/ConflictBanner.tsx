import React from 'react';
import { createPortal } from 'react-dom';
import { useCoordinator, dismissExternalUpdate } from '../../services/persistCoordinator';
import { useAppBanner, hideAppBanner } from '../../services/appBanner';

const bannerStyle: React.CSSProperties = {
    position: 'fixed', left: 0, right: 0, zIndex: 6000,
    background: 'var(--warning, #f59e0b)', color: '#1a1a1a',
    padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, fontSize: '0.85rem', boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
};
const closeBtnStyle: React.CSSProperties = { background: 'transparent', color: '#1a1a1a', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 };
const actionBtnStyle: React.CSSProperties = { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' };

// 非モーダル警告バナー（smartphone.md E1 + revise No.5/No.15）。
// 1. 別タブ/インスタンスがデータを更新したときの警告（保存はブロックしないが再読み込みを促す）
// 2. 汎用バナー（appBanner。IDBブロック通知・PWA更新通知などが使う汎用の1枚）
export const ConflictBanner: React.FC = () => {
    const externalUpdate = useCoordinator(s => s.externalUpdate);
    const appBanner = useAppBanner(s => s.banner);
    if (!externalUpdate && !appBanner) return null;

    return createPortal(
        <>
            {externalUpdate && (
                <div style={{ ...bannerStyle, top: 0 }}>
                    <span>別のタブ／ウィンドウでデータが更新されました。最新の状態を見るには再読み込みしてください。</span>
                    <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => location.reload()} style={actionBtnStyle}>再読み込み</button>
                        <button onClick={dismissExternalUpdate} title="閉じる" style={closeBtnStyle}>×</button>
                    </span>
                </div>
            )}
            {appBanner && (
                <div style={{ ...bannerStyle, top: externalUpdate ? 40 : 0 }}>
                    <span>{appBanner.message}</span>
                    <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {appBanner.actionLabel && appBanner.onAction && (
                            <button onClick={appBanner.onAction} style={actionBtnStyle}>{appBanner.actionLabel}</button>
                        )}
                        <button onClick={hideAppBanner} title="閉じる" style={closeBtnStyle}>×</button>
                    </span>
                </div>
            )}
        </>,
        document.body
    );
};
