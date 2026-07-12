import React, { useState } from 'react';
import type { CharacterTimelineData } from '../../store';
import { formatCharName } from '../../utils/charName';
import { formatTime } from '../../utils/timeFormat';

// 相手キャラの経路上の1訪問（同一地点に複数回訪れる場合の各回）
export interface MergeOccurrence {
    pathIndex: number;
    arrival: number;      // 絶対フレーム
    departure: number;
    feasible: boolean;    // 自分の既存syncと両立できるか
    needsWait?: boolean;  // 相手が先に通り過ぎるため、相手側を待たせて合流する（sync 相互化）
}

// マージ候補のデータ型
export interface MergeCandidate {
    charId: string;
    occurrences: MergeOccurrence[];   // 訪問順
    defaultIndex: number;             // 初期選択（feasibleの中で自分の自然到達に最近接。無ければ -1）
    myAbsArrival: number;             // 表示用: 自分の自然到達（絶対フレーム）
    data: CharacterTimelineData;      // 保存用データ（正規化済み）
}

interface MergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selected: { charId: string; pathIndex: number; arrival: number; departure: number }[]) => void;
    candidates: MergeCandidate[];
    waypointName: string;
}

export const MergeModal: React.FC<MergeModalProps> = ({
    isOpen, onClose, onConfirm, candidates, waypointName
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    // 各キャラの選択中の訪問インデックス（初期値は defaultIndex）
    const [occSelection, setOccSelection] = useState<Record<string, number>>({});

    // このモーダルは常時マウントされ isOpen で表示を切り替えるだけなので、内部stateが
    // 前回の合流操作から持ち越される。開くたびにリセットしないと、別地点で訪問回数が減った
    // キャラに対して古い occSelection（範囲外インデックス）が残り、occ が undefined になって
    // 描画時にクラッシュ→画面が真っ白になる（0711 症状: sync同行地点で再度syncすると空白）。
    React.useEffect(() => {
        if (isOpen) {
            setSelectedIds([]);
            setLastSelectedId(null);
            setOccSelection({});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // 念のため範囲外に丸める（stale state や defaultIndex=-1 でも安全に）
    const occIndexOf = (c: MergeCandidate) => {
        const sel = occSelection[c.charId] ?? c.defaultIndex;
        return sel >= 0 && sel < c.occurrences.length ? sel : c.defaultIndex;
    };

    const selectableCandidates = candidates.filter(c => c.occurrences.some(o => o.feasible));
    const allSelected = selectableCandidates.length > 0 && selectedIds.length === selectableCandidates.length;
    const toggleAll = () => setSelectedIds(allSelected ? [] : selectableCandidates.map(c => c.charId));

    const handleSelect = (c: MergeCandidate, index: number, isShift: boolean) => {
        if (!c.occurrences.some(o => o.feasible)) return; // 実現不能な候補は選択不可
        const id = c.charId;
        let newSelected = [...selectedIds];

        if (isShift && lastSelectedId) {
            const lastIndex = candidates.findIndex(cc => cc.charId === lastSelectedId);
            if (lastIndex !== -1) {
                const start = Math.min(lastIndex, index);
                const end = Math.max(lastIndex, index);
                const rangeIds = candidates.slice(start, end + 1).filter(cc => cc.occurrences.some(o => o.feasible)).map(cc => cc.charId);
                rangeIds.forEach(rid => {
                    if (!newSelected.includes(rid)) newSelected.push(rid);
                });
            }
        } else {
            if (newSelected.includes(id)) {
                newSelected = newSelected.filter(sid => sid !== id);
            } else {
                newSelected.push(id);
                setLastSelectedId(id);
            }
        }
        setSelectedIds(newSelected);
    };

    const handleConfirm = () => {
        const selected = candidates
            .filter(c => selectedIds.includes(c.charId))
            .map(c => {
                const idx = occIndexOf(c);
                const occ = c.occurrences[idx];
                return { charId: c.charId, pathIndex: occ.pathIndex, arrival: occ.arrival, departure: occ.departure };
            });
        onConfirm(selected);
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div style={{
                width: '440px', backgroundColor: 'var(--surface-1, #1e1e1e)', borderRadius: '8px',
                border: '1px solid var(--border-default, #444)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ borderBottom: '1px solid var(--border-default, #333)', paddingBottom: '10px', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--focus-strong, #007acc)', border: '1px solid var(--focus-strong, #007acc)', borderRadius: '10px', padding: '1px 8px' }}>STEP 1 / 2</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #666)' }}>合流 → （次に）同行 / 待受</span>
                    </div>
                    <h3 style={{ margin: 0, color: 'var(--text-primary, #e0e0e0)', fontSize: '1.1rem' }}>
                        <span style={{ color: 'var(--gold, #fbbf24)' }}>"{waypointName}"</span> で合流する相手を選択
                    </h3>
                    <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #888)' }}>
                        選んだキャラの訪問（複数回通る場合は何回目か）を選び、到達時刻を揃えます。複数選択可（Shift+クリックで範囲選択）。
                    </p>
                </div>

                {candidates.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary, #999)', marginTop: '-5px' }}>
                        <span>合流候補 {candidates.length}人</span>
                        <button
                            onClick={toggleAll}
                            style={{ background: 'none', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                            {allSelected ? 'すべて解除' : 'すべて選択'}
                        </button>
                    </div>
                )}

                <div style={{
                    maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px',
                    border: '1px solid var(--border-default, #333)', borderRadius: '4px', padding: '5px', backgroundColor: 'var(--surface-0, #111)'
                }}>
                    {candidates.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary, #666)', padding: '10px', textAlign: 'center' }}>No other characters pass through here.</div>
                    ) : (
                        candidates.map((c, i) => {
                            const isSelected = selectedIds.includes(c.charId);
                            const hasFeasible = c.occurrences.some(o => o.feasible);
                            const idx = occIndexOf(c);
                            const occ = idx >= 0 ? c.occurrences[idx] : undefined;
                            return (
                                <div
                                    key={c.charId}
                                    onClick={(e) => handleSelect(c, i, e.shiftKey)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '8px 12px', borderRadius: '4px', cursor: hasFeasible ? 'pointer' : 'not-allowed',
                                        backgroundColor: isSelected ? 'var(--focus-strong, #007acc)' : 'var(--surface-3, #222)',
                                        color: isSelected ? '#fff' : 'var(--text-secondary, #ccc)',
                                        opacity: hasFeasible ? 1 : 0.5,
                                        userSelect: 'none'
                                    }}
                                >
                                    <img
                                        src={`./icon/${c.charId}`}
                                        alt=""
                                        style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{formatCharName(c.charId)}</div>
                                        {!hasFeasible ? (
                                            <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                                                ⚠ どの訪問にも時間を合わせられません
                                            </div>
                                        ) : c.occurrences.length === 1 && occ ? (
                                            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                                                到達 {formatTime(occ.arrival)}（あなたの自然到達 {formatTime(c.myAbsArrival)}）
                                                {occ.needsWait && <span style={{ color: 'var(--gold, #fbbf24)' }}> ・相手を待たせて合流</span>}
                                            </div>
                                        ) : (
                                            <select
                                                value={idx}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => setOccSelection(prev => ({ ...prev, [c.charId]: Number(e.target.value) }))}
                                                style={{ fontSize: '0.72rem', marginTop: 2, maxWidth: '100%' }}
                                            >
                                                {c.occurrences.map((o, oi) => (
                                                    <option key={oi} value={oi} disabled={!o.feasible}>
                                                        {oi + 1}回目 到達 {formatTime(o.arrival)}{!o.feasible ? '（間に合いません）' : o.needsWait ? '（待たせて合流）' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.length === 0}
                        style={{
                            padding: '8px 16px',
                            background: selectedIds.length > 0 ? 'var(--focus-strong, #007acc)' : 'var(--surface-4, #444)',
                            border: 'none', color: '#fff', borderRadius: '4px',
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
