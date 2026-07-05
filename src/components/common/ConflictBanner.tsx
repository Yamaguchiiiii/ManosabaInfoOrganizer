import React from 'react';
import { createPortal } from 'react-dom';
import { useCoordinator, dismissExternalUpdate } from '../../services/persistCoordinator';

// 別タブ/インスタンスがデータを更新したときの非モーダル警告バナー（smartphone.md E1）。
// 保存はブロックしないが、古い状態のまま上書きして相手の変更を失わないよう再読み込みを促す。
export const ConflictBanner: React.FC = () => {
    const externalUpdate = useCoordinator(s => s.externalUpdate);
    if (!externalUpdate) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 6000,
                background: 'var(--warning, #f59e0b)', color: '#1a1a1a',
                padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, fontSize: '0.85rem', boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            }}
        >
            <span>別のタブ／ウィンドウでデータが更新されました。最新の状態を見るには再読み込みしてください。</span>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                    onClick={() => location.reload()}
                    style={{ background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
                >再読み込み</button>
                <button
                    onClick={dismissExternalUpdate}
                    title="閉じる"
                    style={{ background: 'transparent', color: '#1a1a1a', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                >×</button>
            </span>
        </div>,
        document.body
    );
};
