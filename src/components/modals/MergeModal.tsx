import React, { useState, useCallback } from 'react';

// マージ候補のデータ型
export interface MergeCandidate {
    charId: string;
    arrivalTime: number; // 到達予定時刻 (絶対時間)
    travelTime: number;  // 移動にかかる時間 (Duration * progress)
    currentStartTime: number; // 現在設定されている開始時間
    data: any; // 保存用データ
}

interface MergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedIds: string[]) => void;
    candidates: MergeCandidate[];
    waypointName: string;
}

export const MergeModal: React.FC<MergeModalProps> = ({
    isOpen, onClose, onConfirm, candidates, waypointName
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSelect = (id: string, index: number, isShift: boolean) => {
        let newSelected = [...selectedIds];
        
        if (isShift && lastSelectedId) {
            // Shiftキーが押されている場合: 範囲選択
            const lastIndex = candidates.findIndex(c => c.charId === lastSelectedId);
            if (lastIndex !== -1) {
                const start = Math.min(lastIndex, index);
                const end = Math.max(lastIndex, index);
                const rangeIds = candidates.slice(start, end + 1).map(c => c.charId);
                
                // 範囲内のIDを追加（重複なし）
                rangeIds.forEach(rid => {
                    if (!newSelected.includes(rid)) newSelected.push(rid);
                });
            }
        } else {
            // 通常選択（トグル）
            if (newSelected.includes(id)) {
                newSelected = newSelected.filter(sid => sid !== id);
            } else {
                newSelected.push(id);
                setLastSelectedId(id); // Shift選択の基点として記憶
            }
        }
        setSelectedIds(newSelected);
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div style={{
                width: '400px', backgroundColor: '#1e1e1e', borderRadius: '8px',
                border: '1px solid #444', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }} onClick={e => e.stopPropagation()}>
                
                <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '5px' }}>
                    <h3 style={{ margin: 0, color: '#e0e0e0', fontSize: '1.1rem' }}>
                        Merge at <span style={{ color: '#fbbf24' }}>"{waypointName}"</span>
                    </h3>
                    <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: '#888' }}>
                        Select characters to synchronize arrival time. (Shift+Click for range)
                    </p>
                </div>

                <div style={{ 
                    maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px',
                    border: '1px solid #333', borderRadius: '4px', padding: '5px', backgroundColor: '#111'
                }}>
                    {candidates.length === 0 ? (
                        <div style={{ color: '#666', padding: '10px', textAlign: 'center' }}>No other characters pass through here.</div>
                    ) : (
                        candidates.map((c, i) => {
                            const isSelected = selectedIds.includes(c.charId);
                            return (
                                <div 
                                    key={c.charId}
                                    onClick={(e) => handleSelect(c.charId, i, e.shiftKey)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '8px 12px', borderRadius: '4px', cursor: 'pointer',
                                        backgroundColor: isSelected ? '#007acc' : '#222',
                                        color: isSelected ? 'white' : '#ccc',
                                        userSelect: 'none'
                                    }}
                                >
                                    <img 
                                        src={`./icon/${c.charId}`} 
                                        alt="" 
                                        style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }} 
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{c.charId}</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                            Arr: {Math.round(c.arrivalTime)} (Start: {c.currentStartTime})
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button 
                        onClick={onClose}
                        style={{ padding: '8px 16px', background: 'none', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onConfirm(selectedIds)}
                        disabled={selectedIds.length === 0}
                        style={{ 
                            padding: '8px 16px', 
                            background: selectedIds.length > 0 ? '#007acc' : '#444', 
                            border: 'none', color: 'white', borderRadius: '4px', 
                            cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold'
                        }}
                    >
                        Sync {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};