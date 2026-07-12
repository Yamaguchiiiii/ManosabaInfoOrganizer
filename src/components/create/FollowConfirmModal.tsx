import React, { useState, useEffect } from 'react';
import { Waypoint } from '../../store';
import { formatCharName } from '../../utils/charName';

export interface FollowWaypoint extends Waypoint {
    displayLabel: string; // 「地点X（2回目）」など、同名地点の訪問回数を含む表示名
}

export interface FollowTargetInfo {
    charId: string;
    subsequentWaypoints: FollowWaypoint[];
}

export const FollowConfirmModal: React.FC<{
    info: FollowTargetInfo | null;
    onClose: () => void;
    onConfirm: (waypointsToAppend: Waypoint[]) => void;
}> = ({ info, onClose, onConfirm }) => {
    // revise No.2: フックはearly returnより前に置く（rules-of-hooks違反でクラッシュしていた）
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    useEffect(() => {
        setSelectedIndex(-1);
    }, [info]);

    if (!info) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 2000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="modal-content" style={{ backgroundColor: 'var(--surface-1, #1e1e1e)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-strong, #444)', width: '450px', maxWidth: '90vw', color: 'var(--text-secondary, #ccc)' }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-strong, #444)', paddingBottom: '10px', color: 'var(--text-primary, #fff)' }}>
                    行動を共にする (Sync & Follow)
                </h3>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                    <strong style={{ color: '#007acc' }}>{formatCharName(info.charId)}</strong> と合流しました。<br/>
                    このまま行動を共にしますか？<br/>
                    共にする場合は、どこまで同行するか選択してください。
                </p>

                <div style={{ maxHeight: '200px', overflowY: 'auto', margin: '15px 0', border: '1px solid var(--border-strong, #444)', borderRadius: '4px', padding: '10px', background: 'var(--surface-2, #252526)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border-default, #333)' }}>
                        <input
                            type="radio"
                            name="follow"
                            checked={selectedIndex === -1}
                            onChange={() => setSelectedIndex(-1)}
                            style={{ marginRight: '10px' }}
                        />
                        <span>同行しない（ここで別れる）</span>
                    </label>
                    {info.subsequentWaypoints.map((wp, i) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', borderBottom: i === info.subsequentWaypoints.length - 1 ? 'none' : '1px solid var(--border-default, #333)' }}>
                            <input
                                type="radio"
                                name="follow"
                                checked={selectedIndex === i}
                                onChange={() => setSelectedIndex(i)}
                                style={{ marginRight: '10px' }}
                            />
                            <span>{wp.displayLabel} まで同行</span>
                        </label>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ background: 'var(--surface-4, #444)', border: '1px solid var(--border-strong, #555)', color: 'white', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                        キャンセル
                    </button>
                    <button
                        onClick={() => {
                            if (selectedIndex === -1) {
                                onConfirm([]);
                            } else {
                                onConfirm(info.subsequentWaypoints.slice(0, selectedIndex + 1));
                            }
                        }}
                        style={{ background: '#007acc', border: 'none', color: 'white', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        決定
                    </button>
                </div>
            </div>
        </div>
    );
};
