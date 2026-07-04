import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUT_GROUPS, QUICK_START } from '../../data/shortcuts';
import { useAppStore } from '../../store';
import { exportBackup, importBackupFromText, pickBackupFile } from '../../services/backup';
import { toast } from '../../services/toast';
import { Kbd } from './Kbd';

interface HelpDrawerProps {
    open: boolean;
    onClose: () => void;
    onStartTour: () => void;
}

type Tab = 'quick' | 'shortcuts';

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ open, onClose, onStartTour }) => {
    const [tab, setTab] = useState<Tab>('quick');

    return createPortal(
        <>
            {/* 背景クリックで閉じる */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 99990,
                    background: open ? 'rgba(0,0,0,0.45)' : 'transparent',
                    backdropFilter: open ? 'blur(2px)' : 'none',
                    opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
                    transition: 'opacity 0.25s ease',
                }}
            />
            {/* ドロワー本体 */}
            <aside
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '92vw', zIndex: 99991,
                    background: '#1e1e1e', borderLeft: '1px solid #333',
                    boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
                    transform: open ? 'translateX(0)' : 'translateX(105%)',
                    transition: 'transform 0.28s ease',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #333' }}>
                    <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.05rem' }}>ヘルプ＆ショートカット</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>

                {/* タブ */}
                <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
                    <TabBtn active={tab === 'quick'} onClick={() => setTab('quick')}>Quick Start</TabBtn>
                    <TabBtn active={tab === 'shortcuts'} onClick={() => setTab('shortcuts')}>ショートカット</TabBtn>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                    {tab === 'quick' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {QUICK_START.map(card => (
                                <div key={card.page} style={cardStyle}>
                                    <div style={{ fontWeight: 'bold', color: '#66b3ff', marginBottom: 8 }}>{card.title}</div>
                                    <ul style={{ margin: 0, paddingLeft: 18, color: '#cfcfcf', fontSize: '0.85rem', lineHeight: 1.7 }}>
                                        {card.points.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                </div>
                            ))}
                            <button onClick={onStartTour} style={tourBtn}>● 初回ガイドをもう一度見る</button>
                            <BackupSection />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {SHORTCUT_GROUPS.map(group => (
                                <div key={group.page}>
                                    <div style={{ fontWeight: 'bold', color: '#66b3ff', marginBottom: 8, fontSize: '0.95rem' }}>{group.title}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {group.items.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ flexShrink: 0, minWidth: 132 }}><Kbd keys={item.keys} /></div>
                                                <div style={{ fontSize: '0.82rem', color: '#cfcfcf' }}>{item.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div style={{ fontSize: '0.72rem', color: '#777', marginTop: 4 }}>※ Mac では Ctrl が ⌘ で表示されます。F1 / Shift+/ でいつでも開けます。</div>
                        </div>
                    )}
                </div>
            </aside>
        </>,
        document.body
    );
};

// データのバックアップ（エクスポート/インポート）。全損対策（refactoring B-1）。
const BackupSection: React.FC = () => {
    const showConfirm = useAppStore(s => s.showConfirm);
    const showAlert = useAppStore(s => s.showAlert);
    const [busy, setBusy] = useState(false);

    const handleExport = async () => {
        setBusy(true);
        try { await exportBackup(); toast.success('バックアップを書き出しました'); }
        catch (e) { await showAlert(e instanceof Error ? e.message : 'エクスポートに失敗しました'); }
        finally { setBusy(false); }
    };

    const handleImport = async () => {
        const text = await pickBackupFile();
        if (!text) return;
        if (!(await showConfirm('現在のデータをこのバックアップで上書きします。よろしいですか？'))) return;
        setBusy(true);
        try { await importBackupFromText(text); } // 成功時は内部で location.reload()
        catch (e) { await showAlert(e instanceof Error ? e.message : 'インポートに失敗しました'); setBusy(false); }
    };

    return (
        <div style={{ ...cardStyle, marginTop: 8 }}>
            <div style={{ fontWeight: 'bold', color: '#66b3ff', marginBottom: 6 }}>バックアップ</div>
            <div style={{ fontSize: '0.78rem', color: '#aaa', lineHeight: 1.6, marginBottom: 10 }}>
                すべてのノート・経路・プリセットを1つのファイルに保存/復元します。ブラウザのデータ削除に備えて時々書き出しておくと安全です。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleExport} disabled={busy} style={backupBtn}>⬇ エクスポート</button>
                <button onClick={handleImport} disabled={busy} style={backupBtn}>⬆ インポート</button>
            </div>
        </div>
    );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        style={{
            flex: 1, padding: '8px 10px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '0.85rem',
            background: active ? '#252526' : 'transparent',
            color: active ? '#fff' : '#999',
            border: '1px solid', borderColor: active ? '#333' : 'transparent', borderBottom: 'none',
        }}
    >{children}</button>
);

const cardStyle: React.CSSProperties = {
    background: '#252526', border: '1px solid #333', borderRadius: 10, padding: 12,
};
const tourBtn: React.CSSProperties = {
    marginTop: 4, background: 'transparent', border: '1px solid #007acc', color: '#66b3ff',
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
};
const backupBtn: React.CSSProperties = {
    flex: 1, background: '#333', border: '1px solid #555', color: '#ddd',
    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem',
};
