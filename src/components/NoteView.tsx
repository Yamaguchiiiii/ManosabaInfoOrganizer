import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ICON_FILES } from '../store';
import { NOTE_CANVAS } from '../constants';
import { TOUR_TARGETS } from './tutorial/tourTargets';
import { useViewport } from '../hooks/useViewport';
import { formatCharName } from '../utils/charName';
import { getImageSizeFromUrl } from '../utils/imageUtils';
import { CanvasWorkspace } from './note/CanvasWorkspace';
import '../styles/NoteView.scss';

export const NoteView: React.FC = React.memo(() => {
    const activeNoteTab = useAppStore(state => state.activeNoteTab);
    const notes = useAppStore(state => state.notes);
    const presets = useAppStore(state => state.presets);
    const activePresetId = useAppStore(state => state.activePresetId);
    const addMiscPage = useAppStore(state => state.addMiscPage);
    const renameMiscPage = useAppStore(state => state.renameMiscPage);
    const deleteMiscPage = useAppStore(state => state.deleteMiscPage);
    const showConfirm = useAppStore(state => state.showConfirm);
    const setMobileSheetOpen = useAppStore(state => state.setMobileSheetOpen);
    const isMobile = useViewport() === 'mobile';

    const [displayTab, setDisplayTab] = useState(activeNoteTab);
    const [opacity, setOpacity] = useState(1);

    const actualCharIndex = useAppStore(state => state.noteCharIndex);
    const setActualCharIndex = useAppStore(state => state.setNoteCharIndex);
    const [actualMiscPageId, setActualMiscPageId] = useState<string | null>(null);
    const [actualPresetId, setActualPresetId] = useState<string | null>(null);
    const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
    const [renameInputValue, setRenameInputValue] = useState('');

    useEffect(() => {
        if (activeNoteTab !== displayTab) {
            setOpacity(0);
            const timer = setTimeout(() => {
                setDisplayTab(activeNoteTab);
                setTimeout(() => setOpacity(1), 50);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [activeNoteTab, displayTab]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
            if (activeNoteTab === 'character' && e.target === document.body) {
                if (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') {
                    setActualCharIndex((actualCharIndex - 1 + ICON_FILES.length) % ICON_FILES.length);
                }
                if (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') {
                    setActualCharIndex((actualCharIndex + 1) % ICON_FILES.length);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeNoteTab, actualCharIndex, setActualCharIndex]);

    useEffect(() => {
        if (!actualPresetId && activePresetId) {
            setActualPresetId(activePresetId);
        }
    }, [activePresetId, actualPresetId]);

    useEffect(() => {
        if (activeNoteTab === 'misc' && !actualMiscPageId && notes.miscPages?.length > 0) {
            setActualMiscPageId(notes.miscPages[0].id);
        }
    }, [activeNoteTab, notes.miscPages, actualMiscPageId]);

    const selectedChar = ICON_FILES[Math.min(actualCharIndex, ICON_FILES.length - 1)];
    const initializedCharsRef = useRef<Set<string>>(new Set());

    const addNoteAsset = useAppStore(state => state.addNoteAsset);
    const addNoteObject = useAppStore(state => state.addNoteObject);
    const updateNoteObject = useAppStore(state => state.updateNoteObject);

    useEffect(() => {
        if (activeNoteTab !== 'character') return;
        if (initializedCharsRef.current.has(selectedChar)) return;

        const charData = useAppStore.getState().notes.characters?.[selectedChar];
        if (charData && charData.objects.length > 0) {
            initializedCharsRef.current.add(selectedChar);
            // 旧データ移行: ./icon/ を使っている初期キャラ画像を ./character/ に更新
            const oldIconSrc = `./icon/${selectedChar}`;
            const newCharSrc = `./character/${selectedChar}`;
            charData.objects.forEach(obj => {
                if (obj.content === oldIconSrc) {
                    updateNoteObject('character', selectedChar, obj.id, { content: newCharSrc }, true);
                }
            });
            return;
        }

        // 非同期処理開始前にマーク（ループ防止の核心）
        initializedCharsRef.current.add(selectedChar);

        const defaultImgSrc = `./character/${selectedChar}`;
        addNoteAsset('character', selectedChar, defaultImgSrc);
        getImageSizeFromUrl(defaultImgSrc, 800).then(size => {
            // キャンバス論理高さを基準に左下に上半身が見える位置（下半分がキャンバス外）
            const canvasLogicalHeight = NOTE_CANVAS.CHAR_LOGICAL_H;
            addNoteObject('character', selectedChar, {
                id: `default_char_${Date.now()}`,
                type: 'image',
                x: 0,
                y: canvasLogicalHeight - size.height / 2,
                width: size.width, height: size.height,
                content: defaultImgSrc,
                rotation: 0, scaleX: 1, scaleY: 1,
                keepRatio: true,
                canvasIndex: 0
            });
        });
    }, [selectedChar, activeNoteTab, addNoteAsset, addNoteObject, updateNoteObject]);

    return (
        <div className="note-view-container">
            <div className="note-content" style={{ opacity: opacity, transition: 'opacity 0.2s ease-in-out' }}>
                {displayTab === 'overview' && (
                    <CanvasWorkspace
                        targetType="overview"
                        targetId="overview"
                        compactMode={isMobile}
                    />
                )}

                {displayTab === 'preset' && actualPresetId && (
                    // トップバー廃止。プリセット選択だけを Tools 上 (sidebarHeader) に移動。#06/28-3:58-3
                    <CanvasWorkspace
                        targetType="preset"
                        targetId={actualPresetId}
                        compactMode={isMobile}
                        headerBar={isMobile ? (
                            <select value={actualPresetId} onChange={e => setActualPresetId(e.target.value)} style={{ background: '#333', color: 'white', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', minWidth: '160px' }}>
                                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        ) : undefined}
                        sidebarHeader={
                            <select value={actualPresetId} onChange={e => setActualPresetId(e.target.value)} style={{ background: '#333', color: 'white', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', width: '100%' }}>
                                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        }
                    />
                )}

                {displayTab === 'character' && (
                    // トップバー廃止。キャラ選択アイコンを Tools 上 (sidebarHeader) に移動（AnimateのICONS風）。#06/28-3:58-5
                    <CanvasWorkspace
                        targetType="character"
                        targetId={selectedChar}
                        sidebarHeaderDivider={false}
                        compactMode={isMobile}
                        headerBar={isMobile ? (
                            // モバイル: 見切れていた横スクロール15個をやめ、現在キャラ+名前+変更ボタンに（20.md #07/04-7）
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <img src={`./icon/${selectedChar}`} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--focus, #66b3ff)' }} />
                                <span style={{ color: '#ddd', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{formatCharName(selectedChar)}</span>
                                <button onClick={() => setMobileSheetOpen(true)}
                                    style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 36 }}>
                                    変更
                                </button>
                            </div>
                        ) : undefined}
                        sidebarHeader={
                            // h3 にすることで .char-sidebar h3 の太字+border-bottom が適用され、
                            // 境界線が「Character の文字」と「アイコン」の間に入る（#06/30-3）
                            <div data-tour={TOUR_TARGETS.noteCharacterPicker}>
                                <h3 style={{ marginTop: 0 }}>Character</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: '5px' }}>
                                    {ICON_FILES.map((icon, idx) => (
                                        <div
                                            key={icon}
                                            onClick={() => setActualCharIndex(idx)}
                                            title={icon}
                                            style={{
                                                width: '100%', aspectRatio: '1', overflow: 'hidden',
                                                cursor: 'pointer', boxSizing: 'border-box',
                                                border: actualCharIndex === idx ? '2px solid #66b3ff' : '2px solid transparent',
                                                opacity: actualCharIndex === idx ? 1 : 0.55,
                                                boxShadow: actualCharIndex === idx ? '0 0 8px rgba(0,122,204,0.5)' : 'none',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <img src={`./icon/${icon}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        }
                    />
                )}

                {displayTab === 'misc' && (
                    // トップバー廃止。メモのプリセット選択/追加/改名/削除を Tools 上 (sidebarHeader) に移動。#06/28-3:58-4
                    (actualMiscPageId && notes.miscPages?.some(p => p.id === actualMiscPageId)) ? (
                        <CanvasWorkspace
                            targetType="misc"
                            targetId={actualMiscPageId}
                            compactMode={isMobile}
                            headerBar={isMobile ? (
                                // モバイル: メモ選択+追加+改名+削除（20.md #07/04-6）
                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                    {renamingPageId === actualMiscPageId ? (
                                        <input
                                            autoFocus
                                            value={renameInputValue}
                                            onChange={e => setRenameInputValue(e.target.value)}
                                            onBlur={() => {
                                                if (renamingPageId && renameInputValue.trim()) renameMiscPage(renamingPageId, renameInputValue.trim());
                                                setRenamingPageId(null);
                                            }}
                                            onKeyDown={e => {
                                                if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME変換中は確定で奪わない
                                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                if (e.key === 'Escape') setRenamingPageId(null);
                                            }}
                                            style={{ minWidth: '150px', background: '#333', color: 'white', border: '1px solid var(--focus-strong, #007acc)', padding: '6px 8px', borderRadius: '4px' }}
                                        />
                                    ) : (
                                        <select
                                            value={actualMiscPageId || ''}
                                            onChange={e => setActualMiscPageId(e.target.value)}
                                            style={{ minWidth: '150px', background: '#333', color: 'white', border: '1px solid #555', padding: '6px 8px', borderRadius: '4px' }}
                                        >
                                            {notes.miscPages!.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                                        </select>
                                    )}
                                    <button onClick={() => addMiscPage("New Page")} title="メモを追加"
                                        style={{ background: 'var(--accent, #7c5cff)', border: 'none', color: 'white', padding: '5px 11px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, minHeight: 40 }}>+</button>
                                    <button title="名前を変更" onClick={() => {
                                            const page = notes.miscPages?.find(p => p.id === actualMiscPageId);
                                            if (page) { setRenamingPageId(page.id); setRenameInputValue(page.title); }
                                        }}
                                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '5px 11px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, minHeight: 40 }}>✏️</button>
                                    <button title="削除" onClick={async () => {
                                            if (await showConfirm("このノートを削除しますか？")) {
                                                deleteMiscPage(actualMiscPageId as string);
                                                setActualMiscPageId(null);
                                            }
                                        }}
                                        style={{ background: 'var(--danger, #ef4444)', border: 'none', color: 'white', padding: '5px 11px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, minHeight: 40 }}>🗑️</button>
                                </div>
                            ) : undefined}
                            sidebarHeader={
                                <>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <select
                                            value={actualMiscPageId || ''}
                                            onChange={e => setActualMiscPageId(e.target.value)}
                                            style={{ flex: 1, minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', padding: '6px 8px', borderRadius: '4px' }}
                                        >
                                            {notes.miscPages!.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                                        </select>
                                        <button
                                            onClick={() => addMiscPage("New Page")}
                                            style={{ background: 'var(--accent, #7c5cff)', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                                            title="メモを追加"
                                        >+</button>
                                    </div>
                                    {renamingPageId === actualMiscPageId ? (
                                        <input
                                            autoFocus
                                            value={renameInputValue}
                                            onChange={e => setRenameInputValue(e.target.value)}
                                            onBlur={() => {
                                                const id = renamingPageId;
                                                if (id && renameInputValue.trim()) renameMiscPage(id, renameInputValue.trim());
                                                setRenamingPageId(null);
                                            }}
                                            onKeyDown={e => {
                                                if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME変換中は確定で奪わない
                                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                if (e.key === 'Escape') setRenamingPageId(null);
                                            }}
                                            style={{ background: '#333', color: 'white', border: '1px solid #007acc', padding: '5px 8px', borderRadius: '4px', width: '100%', boxSizing: 'border-box' }}
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button
                                                onClick={() => {
                                                    const page = notes.miscPages?.find(p => p.id === actualMiscPageId);
                                                    if (page) { setRenamingPageId(page.id); setRenameInputValue(page.title); }
                                                }}
                                                style={{ flex: 1, background: '#444', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                title="名前を変更"
                                            >✏️ Rename</button>
                                            <button
                                                onClick={async () => {
                                                    if (await showConfirm("このノートを削除しますか？")) {
                                                        deleteMiscPage(actualMiscPageId as string);
                                                        setActualMiscPageId(null);
                                                    }
                                                }}
                                                style={{ flex: 1, background: '#ef4444', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                title="削除"
                                            >🗑️ Delete</button>
                                        </div>
                                    )}
                                </>
                            }
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
                            <div style={{ color: '#666', fontSize: '1.2rem' }}>No misc notes available.</div>
                            <button
                                onClick={() => addMiscPage("New Page")}
                                style={{ background: 'var(--accent, #7c5cff)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                            >
                                Create New Note
                            </button>
                        </div>
                    )
                )}
            </div>
        </div>
    );
});
