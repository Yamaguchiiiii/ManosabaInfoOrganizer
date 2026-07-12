import React from 'react';
import { usePersistStatus } from '../../services/persistStatus';
import { useAppStore } from '../../store';
import { exportBackup } from '../../services/backup';

// 保存状態インジケータ（refactoring B-3）。persist の書き込み状態を小さく表示する。
// error 時はクリックでバックアップのエクスポートを促す（データ全損の予防）。
export const SaveStatusIndicator: React.FC = () => {
    const status = usePersistStatus(s => s.status);
    const showConfirm = useAppStore(s => s.showConfirm);
    const showAlert = useAppStore(s => s.showAlert);

    if (status === 'idle') return null;

    const map = {
        pending: { text: '…変更あり', color: 'var(--text-secondary)' },
        saving: { text: '…保存中', color: 'var(--text-secondary)' },
        saved: { text: '✓ 保存済み', color: '#10b981' },
        error: { text: '⚠ 保存失敗', color: '#ef4444' },
    } as const;
    const s = map[status];

    const handleClick = async () => {
        if (status !== 'error') return;
        if (await showConfirm('保存に失敗しています。今のデータをファイルに書き出しますか？')) {
            try { await exportBackup(); }
            catch (e) { await showAlert(e instanceof Error ? e.message : 'エクスポートに失敗しました'); }
        }
    };

    return (
        <div
            onClick={handleClick}
            title={status === 'error' ? 'クリックしてバックアップを書き出す' : undefined}
            style={{
                fontSize: '0.7rem', color: s.color, padding: '2px 4px',
                cursor: status === 'error' ? 'pointer' : 'default',
                userSelect: 'none', whiteSpace: 'nowrap',
            }}
        >
            {s.text}
        </div>
    );
};
