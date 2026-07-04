import React, { useState } from 'react';
import type { CharacterTimelineData } from '../../store';
import { formatCharName } from '../../utils/charName';

// マージ候補のデータ型
export interface MergeCandidate {
    charId: string;
    arrivalTime: number; // 到達予定時刻 (絶対時間)
    travelTime: number;  // 移動にかかる時間 (Duration * progress)
    currentStartTime: number; // 現在設定されている開始時間
    data: CharacterTimelineData; // 保存用データ（正規化済み）
    pathIndex?: number; // 合流に使う「相手キャラの経路上の訪問位置」(同一地点を複数回通る場合の選択結果)
}

interface MergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedIds: string[]) => void;
    candidates: MergeCandidate[];
    waypointName: string;
}

// 合流までの所要フレームを「待つ/先着」の関係として読みやすく示す
const relationLabel = (c: MergeCandidate) => {
    const diff = Math.round(c.arrivalTime - c.currentStartTime);
    return `この地点まで約 ${diff} フレームで到達`;
};

export const MergeModal: React.FC<MergeModalProps> = ({
    isOpen, onClose, onConfirm, candidates, waypointName
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

    if (!isOpen) return null;

    const allSelected = candidates.length > 0 && selectedIds.length === candidates.length;
    const toggleAll = () => setSelectedIds(allSelected ? [] : candidates.map(c => c.charId));

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#007acc', border: '1px solid #007acc', borderRadius: '10px', padding: '1px 8px' }}>STEP 1 / 2</span>
                        <span style={{ fontSize: '0.72rem', color: '#666' }}>合流 → （次に）同行 / 待受</span>
                    </div>
                    <h3 style={{ margin: 0, color: '#e0e0e0', fontSize: '1.1rem' }}>
                        <span style={{ color: '#fbbf24' }}>"{waypointName}"</span> で合流する相手を選択
                    </h3>
                    <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: '#888' }}>
                        選んだキャラと到達時刻を揃えます。複数選択可（Shift+クリックで範囲選択）。
                    </p>
                </div>

                {candidates.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#999', marginTop: '-5px' }}>
                        <span>合流候補 {candidates.length}人</span>
                        <button
                            onClick={toggleAll}
                            style={{ background: 'none', border: '1px solid #555', color: '#ccc', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                            {allSelected ? 'すべて解除' : 'すべて選択'}
                        </button>
                    </div>
                )}

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
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{formatCharName(c.charId)}</div>
                                        <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>
                                            {relationLabel(c)}
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
                        キャンセル
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
                        合流する {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};