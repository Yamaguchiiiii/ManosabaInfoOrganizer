import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../../store';
import { searchNotes, NoteSearchHit } from '../../utils/noteSearch';

// F3: ノート全文検索。ContextBar(デスクトップ)/MobileAppBar(モバイル)の両方から使う共通UI。
export const NoteSearchBox: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const notes = useAppStore(s => s.notes);
    const presets = useAppStore(s => s.presets);
    const enterMode = useAppStore(s => s.enterMode);
    const setPendingNoteFocus = useAppStore(s => s.setPendingNoteFocus);

    const hits = useMemo(() => searchNotes(notes, presets, query), [notes, presets, query]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const handleSelect = (hit: NoteSearchHit) => {
        setPendingNoteFocus({ targetType: hit.targetType, targetId: hit.targetId, objId: hit.objId });
        enterMode('note');
        setOpen(false);
        setQuery('');
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(v => !v)}
                title="ノートを検索"
                aria-label="ノートを検索"
                style={{
                    background: open ? 'rgba(102,179,255,0.2)' : 'transparent', border: '1px solid #555',
                    borderRadius: '4px', color: open ? '#66b3ff' : '#ccc', padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem',
                }}
            >
                🔍
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: '280px', maxWidth: '85vw', maxHeight: '360px',
                    background: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    zIndex: 6000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="ノート内のテキストを検索..."
                        style={{ background: '#2a2a2a', border: 'none', borderBottom: '1px solid #444', color: 'white', padding: '10px 12px', fontSize: '0.85rem', outline: 'none' }}
                    />
                    {query.trim() !== '' && (
                        <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
                            {hits.length === 0 ? (
                                <div style={{ padding: '14px 12px', color: '#777', fontSize: '0.8rem', textAlign: 'center' }}>見つかりません</div>
                            ) : hits.map((hit, i) => (
                                <div
                                    key={`${hit.targetType}-${hit.targetId}-${hit.objId ?? i}`}
                                    onClick={() => handleSelect(hit)}
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                                >
                                    <div style={{ fontSize: '0.7rem', color: '#66b3ff', marginBottom: 2 }}>{hit.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.snippet}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
