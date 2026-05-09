import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ICON_FILES } from '../store';
import '../styles/NoteView.scss';

// 画像縮小用ヘルパー
const resizeImage = (file: File, maxWidth = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // JPEG圧縮
            };
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export const NoteView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'overview' | 'character' | 'misc'>('overview');
    const [selectedChar, setSelectedChar] = useState<string>(ICON_FILES[0]);
    const [selectedMiscPageId, setSelectedMiscPageId] = useState<string | null>(null);
    
    // ▼▼▼ 追加: プリセットメモ選択用ステート ▼▼▼
    const [selectedPresetIdForNote, setSelectedPresetIdForNote] = useState<string | null>(null);

    const { 
        notes, updateOverview, 
        updateCharacterMemo, addCharacterImage, removeCharacterImage,
        addMiscPage, updateMiscPage, renameMiscPage, deleteMiscPage,
        presets, updatePresetNote, activePresetId
    } = useAppStore();

    // 初期表示時に、Create/Animate画面で選択中のプリセットを自動選択する
    useEffect(() => {
        if (!selectedPresetIdForNote && activePresetId) {
            setSelectedPresetIdForNote(activePresetId);
        }
    }, [activePresetId, selectedPresetIdForNote]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await resizeImage(e.target.files[0]);
                addCharacterImage(selectedChar, base64);
            } catch (err) {
                console.error("Image upload failed", err);
                alert("画像のアップロードに失敗しました");
            }
        }
    };

    const handleAddMiscPage = () => {
        addMiscPage("New Page");
        setTimeout(() => {
            const newPages = useAppStore.getState().notes.miscPages;
            if (newPages.length > 0) setSelectedMiscPageId(newPages[newPages.length - 1].id);
        }, 100);
    };

    const handleDeleteMisc = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm("このページを削除しますか？")) {
            deleteMiscPage(id);
            if (selectedMiscPageId === id) setSelectedMiscPageId(null);
        }
    };

    const currentPresetNote = presets.find(p => p.id === selectedPresetIdForNote);

    return (
        <div className="note-view-container">
            {/* Tab Navigation */}
            <div className="note-tabs">
                <div className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>統括 (Overview)</div>
                <div className={`tab-item ${activeTab === 'character' ? 'active' : ''}`} onClick={() => setActiveTab('character')}>キャラクター (Characters)</div>
                <div className={`tab-item ${activeTab === 'misc' ? 'active' : ''}`} onClick={() => setActiveTab('misc')}>雑多 (Misc)</div>
            </div>

            {/* Content Area */}
            <div className="note-content">
                
                {/* 1. Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="overview-section" style={{ display: 'flex', flexDirection: 'row', gap: '20px' }}>
                        {/* 左側: 全体統括メモ */}
                        <div className="overview-main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h2>Overall Reasoning / Summary</h2>
                            <textarea 
                                value={notes.overview}
                                onChange={(e) => updateOverview(e.target.value)}
                                placeholder="ここにゲーム全体の推理やあらすじ、気になったポイントを自由に記述してください..."
                                style={{ flex: 1 }}
                            />
                        </div>

                        {/* 右側: プリセット別メモ (Create/Animateと連動) */}
                        <div className="overview-timeline" style={{ width: '350px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #444', paddingLeft: '20px' }}>
                            <div className="timeline-header" style={{ marginBottom: '10px' }}>
                                <h2 style={{ fontSize: '1rem', color: '#888' }}>Timeline Notes</h2>
                                <select 
                                    value={selectedPresetIdForNote || ''} 
                                    onChange={(e) => setSelectedPresetIdForNote(e.target.value)}
                                    style={{ width: '100%', padding: '5px', background: '#333', color: 'white', border: '1px solid #555' }}
                                >
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <textarea 
                                value={currentPresetNote?.note || ''}
                                onChange={(e) => selectedPresetIdForNote && updatePresetNote(selectedPresetIdForNote, e.target.value)}
                                placeholder={`メモ: ${currentPresetNote?.name || '選択してください'}\n(この内容はAnimate画面のNotesPanelと同期されます)`}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                )}

                {/* 2. Character Tab */}
                {activeTab === 'character' && (
                    <div className="character-section">
                        <div className="char-list">
                            {ICON_FILES.map(icon => (
                                <div 
                                    key={icon} 
                                    className={`char-item ${selectedChar === icon ? 'active' : ''}`}
                                    onClick={() => setSelectedChar(icon)}
                                >
                                    <img src={`./icon/${icon}`} alt="" />
                                    <span>{icon.replace('.png', '').replace(/^\d+_/, '')}</span>
                                </div>
                            ))}
                        </div>
                        <div className="char-detail">
                            <div className="char-header">
                                <img src={`./icon/${selectedChar}`} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #555' }} />
                                <h2>{selectedChar.replace('.png', '').replace(/^\d+_/, '')}</h2>
                            </div>
                            <div className="char-body">
                                <div className="image-area">
                                    <div className="official-image">
                                        <img src={`./icon/${selectedChar}`} alt="Official" />
                                    </div>
                                    <div className="gallery">
                                        {notes.characters[selectedChar]?.customImages?.map((img, idx) => (
                                            <div key={idx} className="gallery-item">
                                                <img src={img} alt={`custom-${idx}`} />
                                                <button className="delete-btn" onClick={() => removeCharacterImage(selectedChar, idx)}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                                        + Add Image
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            style={{ display: 'none' }} 
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                        />
                                    </div>
                                </div>
                                <div className="memo-area">
                                    <h4>Notes / Profiles</h4>
                                    <textarea 
                                        value={notes.characters[selectedChar]?.memo || ''}
                                        onChange={(e) => updateCharacterMemo(selectedChar, e.target.value)}
                                        placeholder={`${selectedChar.replace('.png', '').replace(/^\d+_/, '')} についてのメモ...`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Misc Tab */}
                {activeTab === 'misc' && (
                    <div className="misc-section">
                        <div className="misc-list">
                            <div className="misc-list-header">
                                <span>Pages</span>
                                <button onClick={handleAddMiscPage}>+</button>
                            </div>
                            <div className="misc-items">
                                {notes.miscPages.map(page => (
                                    <div 
                                        key={page.id} 
                                        className={`misc-item ${selectedMiscPageId === page.id ? 'active' : ''}`}
                                        onClick={() => setSelectedMiscPageId(page.id)}
                                    >
                                        <span>{page.title}</span>
                                        <span className="delete-page" onClick={(e) => handleDeleteMisc(e, page.id)}>×</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="misc-editor">
                            {selectedMiscPageId && notes.miscPages.some(p => p.id === selectedMiscPageId) ? (
                                <>
                                    <input 
                                        type="text" 
                                        value={notes.miscPages.find(p => p.id === selectedMiscPageId)?.title || ''} 
                                        onChange={(e) => renameMiscPage(selectedMiscPageId, e.target.value)}
                                        placeholder="Title..."
                                    />
                                    <textarea 
                                        value={notes.misc[selectedMiscPageId] || ''}
                                        onChange={(e) => updateMiscPage(selectedMiscPageId, e.target.value)}
                                        placeholder="Free text..."
                                    />
                                </>
                            ) : (
                                <div style={{ color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    Select or create a page from the left list.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};