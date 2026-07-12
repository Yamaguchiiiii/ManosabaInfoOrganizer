import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUT_GROUPS, QUICK_START } from '../../data/shortcuts';
import { useAppStore } from '../../store';
import { exportBackup, importBackupFromText, pickBackupFile } from '../../services/backup';
import { saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, SnapshotMeta } from '../../services/snapshots';
import { toast } from '../../services/toast';
import { isWeb } from '../../services/platform';
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
                    background: 'var(--surface-1)', borderLeft: '1px solid var(--border-default)',
                    boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
                    transform: open ? 'translateX(0)' : 'translateX(105%)',
                    transition: 'transform 0.28s ease',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-default)' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '1.05rem' }}>ヘルプ＆ショートカット</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
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
                                    <div style={{ fontWeight: 'bold', color: 'var(--focus)', marginBottom: 8 }}>{card.title}</div>
                                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                                        {card.points.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                </div>
                            ))}
                            <button onClick={onStartTour} style={tourBtn}>● 初回ガイドをもう一度見る</button>
                            <ThemeSection />
                            <BackupSection />
                            <SnapshotSection />
                            {isWeb() && (
                                <div style={{ marginTop: 10, textAlign: 'center' }}>
                                    <a href="./privacy.html" target="_blank" rel="noopener"
                                       style={{ color: 'var(--text-disabled)', fontSize: '0.72rem' }}>プライバシーポリシー</a>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {SHORTCUT_GROUPS.map(group => (
                                <div key={group.page}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--focus)', marginBottom: 8, fontSize: '0.95rem' }}>{group.title}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {group.items.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ flexShrink: 0, minWidth: 132 }}><Kbd keys={item.keys} /></div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-disabled)', marginTop: 4 }}>※ Mac では Ctrl が ⌘ で表示されます。F1 / Shift+/ でいつでも開けます。</div>
                        </div>
                    )}
                </div>
            </aside>
        </>,
        document.body
    );
};

// F6: DOM UIのテーマ切替（ダーク/セピア）。Konva内の色・紙面は対象外。
const ThemeSection: React.FC = () => {
    const theme = useAppStore(s => s.theme);
    const setTheme = useAppStore(s => s.setTheme);

    return (
        <div style={cardStyle}>
            <div style={{ fontWeight: 'bold', color: 'var(--focus)', marginBottom: 6 }}>テーマ</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                画面の配色を切り替えます（マップ/ノートの紙面色は対象外です）。
            </div>
            <select
                value={theme}
                onChange={e => setTheme(e.target.value as 'dark' | 'sepia')}
                style={{ width: '100%', background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.85rem' }}
            >
                <option value="dark">ダーク</option>
                <option value="sepia">セピア</option>
            </select>
        </div>
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
            <div style={{ fontWeight: 'bold', color: 'var(--focus)', marginBottom: 6 }}>バックアップ</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                すべてのノート・経路・プリセットを1つのファイルに保存/復元します。ブラウザのデータ削除に備えて時々書き出しておくと安全です。
                保存状態が「…変更あり」のままタブを閉じると直前の編集が保存されないことがあります。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleExport} disabled={busy} style={backupBtn}>⬇ エクスポート</button>
                <button onClick={handleImport} disabled={busy} style={backupBtn}>⬆ インポート</button>
            </div>
        </div>
    );
};

// F4: 手動スナップショット。バックアップと違いファイル書き出し不要で、直近5件をIDB内に保持する。
const SnapshotSection: React.FC = () => {
    const showConfirm = useAppStore(s => s.showConfirm);
    const showAlert = useAppStore(s => s.showAlert);
    const [busy, setBusy] = useState(false);
    const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);

    const refresh = useCallback(async () => setSnapshots(await listSnapshots()), []);
    useEffect(() => { void refresh(); }, [refresh]);

    // R5 showPrompt は未実装のため、既定名(日時)で保存する。
    const defaultName = () => {
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    };

    const handleSave = async () => {
        setBusy(true);
        try {
            await saveSnapshot(defaultName());
            await refresh();
            toast.success('スナップショットを保存しました');
        } catch (e) {
            await showAlert(e instanceof Error ? e.message : 'スナップショットの保存に失敗しました');
        } finally {
            setBusy(false);
        }
    };

    const handleRestore = async (id: string, name: string) => {
        if (!(await showConfirm(`"${name}" の状態に復元します。現在のデータは上書きされます。よろしいですか？`))) return;
        setBusy(true);
        try { await restoreSnapshot(id); } // 成功時は内部で location.reload()
        catch (e) { await showAlert(e instanceof Error ? e.message : '復元に失敗しました'); setBusy(false); }
    };

    const handleDelete = async (id: string) => {
        await deleteSnapshot(id);
        await refresh();
    };

    return (
        <div style={{ ...cardStyle, marginTop: 8 }}>
            <div style={{ fontWeight: 'bold', color: 'var(--focus)', marginBottom: 6 }}>スナップショット</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                現在の状態を直近5件までこの端末内に保存できます。大きな変更を試す前の控えに便利です（ファイル書き出しはされません）。
            </div>
            <button onClick={handleSave} disabled={busy} style={{ ...backupBtn, marginBottom: snapshots.length > 0 ? 10 : 0, width: '100%' }}>＋ 現在の状態を保存</button>
            {snapshots.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {snapshots.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                {s.name}
                                <span style={{ color: 'var(--text-disabled)', marginLeft: 6 }}>{new Date(s.createdAt).toLocaleString()}</span>
                            </div>
                            <button onClick={() => handleRestore(s.id, s.name)} disabled={busy} style={smallBtn}>復元</button>
                            <button onClick={() => handleDelete(s.id)} disabled={busy} style={smallBtn}>削除</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        style={{
            flex: 1, padding: '8px 10px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '0.85rem',
            background: active ? 'var(--surface-2)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid', borderColor: active ? 'var(--border-default)' : 'transparent', borderBottom: 'none',
        }}
    >{children}</button>
);

const cardStyle: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 12,
};
const tourBtn: React.CSSProperties = {
    marginTop: 4, background: 'transparent', border: '1px solid #007acc', color: 'var(--focus)',
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
};
const backupBtn: React.CSSProperties = {
    flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)',
    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem',
};
const smallBtn: React.CSSProperties = {
    flexShrink: 0, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)',
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem',
};
