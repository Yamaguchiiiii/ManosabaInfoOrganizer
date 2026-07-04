import React from 'react';
import { Waypoint, SyncConstraint, StartRef } from '../../store';
import { SEGMENT_COLORS } from '../../utils/mapDrawUtils';

export type { SyncConstraint };

const selStyle: React.CSSProperties = {
    background: '#333', color: 'white', border: '1px solid #555',
    borderRadius: '4px', padding: '3px 6px', fontSize: '0.8rem', maxWidth: '120px',
};

interface WaypointPanelProps {
    isGraphEditMode: boolean;
    selectedIcons: string[];
    highlightedPath: string[];
    savedPathData: string[] | null;
    isEditing: boolean;
    // 開始条件（数値delayの代替）
    startRef: StartRef | null;
    setStartRef: (r: StartRef | null) => void;
    showBeforeStart: boolean;
    setShowBeforeStart: (v: boolean) => void;
    startRefCharOptions: { id: string; name: string }[];
    startRefNodeOptions: { nodeId: string; occurrence: number; label: string }[];
    waypoints: Waypoint[];
    // 現在地点入力のターゲット（この行を --focus で強調してターゲット迷子を防ぐ）。null=なし
    suggestionTargetIndex: number | null;
    handleWaypointChange: (index: number, field: keyof Waypoint, value: string | number) => void;
    setSuggestionTargetIndex: (index: number) => void;
    handleSyncTime: (id: string, name: string, waypointIndex?: number) => void;
    handleRemoveWaypoint: (index: number) => void;
    handleAddWaypoint: () => void;
    handleSavePath: () => void;
    handleEditPath: () => void;
    handleDeletePath: () => void;
    syncConstraints: SyncConstraint[];
    onRemoveSyncConstraint: (index: number) => void;
}

export const WaypointPanel: React.FC<WaypointPanelProps> = ({
    isGraphEditMode, selectedIcons, highlightedPath, savedPathData, isEditing,
    startRef, setStartRef, showBeforeStart, setShowBeforeStart,
    startRefCharOptions, startRefNodeOptions,
    waypoints, suggestionTargetIndex, handleWaypointChange, setSuggestionTargetIndex,
    handleSyncTime, handleRemoveWaypoint, handleAddWaypoint,
    handleSavePath, handleEditPath, handleDeletePath,
    syncConstraints, onRemoveSyncConstraint
}) => {
    if (isGraphEditMode) return null;
    if (selectedIcons.length === 0 && highlightedPath.length === 0) return null;

    return (
        <div style={{
            position: 'absolute', bottom: '30px', right: '30px', left: 'auto', transform: 'none',
            backgroundColor: 'rgba(30, 30, 30, 0.95)', padding: '15px', borderRadius: '8px',
            border: savedPathData ? '1px solid #10b981' : '1px solid #007acc',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', zIndex: 100, minWidth: '240px', maxWidth: '300px'
        }}>
            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>

            {(!savedPathData || isEditing) && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                    {/* 開始条件（数値delayの代替）: 「基準キャラが地点に到達後 +N」 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid #444' }}>
                        <span style={{ fontSize: '0.75rem', color: '#aaa' }}>開始条件</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            <select
                                value={startRef?.charId ?? ''}
                                onChange={(e) => {
                                    const cid = e.target.value;
                                    if (!cid) { setStartRef(null); return; }
                                    // 既存 nodeId が無効なら未選択にして、ユーザーに地点を選ばせる
                                    setStartRef({ charId: cid, nodeId: '', occurrence: 0, phase: startRef?.phase ?? 'arrival', extraDelay: startRef?.extraDelay ?? 0 });
                                }}
                                style={selStyle}
                            >
                                <option value="">即時（待たない）</option>
                                {startRefCharOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {startRef && (
                                <>
                                    <span style={{ fontSize: '0.75rem', color: '#ccc' }}>が</span>
                                    <select
                                        value={startRef.nodeId ? `${startRef.nodeId}#${startRef.occurrence}` : ''}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) { setStartRef({ ...startRef, nodeId: '', occurrence: 0 }); return; }
                                            const [nodeId, occStr] = v.split('#');
                                            setStartRef({ ...startRef, nodeId, occurrence: parseInt(occStr, 10) || 0 });
                                        }}
                                        style={selStyle}
                                    >
                                        <option value="">地点を選択…</option>
                                        {startRefNodeOptions.map(o => (
                                            <option key={`${o.nodeId}#${o.occurrence}`} value={`${o.nodeId}#${o.occurrence}`}>{o.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={startRef.phase ?? 'arrival'}
                                        onChange={(e) => setStartRef({ ...startRef, phase: e.target.value as 'arrival' | 'departure' })}
                                        style={selStyle}
                                    >
                                        <option value="arrival">に到達後</option>
                                        <option value="departure">を出発後</option>
                                    </select>
                                    <input
                                        type="number" min="0" value={startRef.extraDelay}
                                        onChange={(e) => setStartRef({ ...startRef, extraDelay: parseFloat(e.target.value) || 0 })}
                                        onFocus={(e) => e.target.select()}
                                        style={{ width: '52px', background: '#222', border: '1px solid #444', color: 'white', padding: '4px', borderRadius: '4px', textAlign: 'right' }}
                                    />
                                    <span style={{ fontSize: '0.7rem', color: '#888' }}>fr</span>
                                </>
                            )}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#ccc', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showBeforeStart} onChange={(e) => setShowBeforeStart(e.target.checked)} />
                            待機中も開始地点にアイコンを表示する
                        </label>
                    </div>

                    {waypoints.map((wp, index) => {
                        const segmentColor = (index < waypoints.length - 1) ? SEGMENT_COLORS[index % SEGMENT_COLORS.length] : 'transparent';
                        const isIntermediate = index > 0 && index < waypoints.length - 1;
                        return (
                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <div style={{ width: '4px', height: '24px', borderRadius: '2px', backgroundColor: segmentColor, marginRight: '2px' }}></div>
                                <span style={{ fontSize: '0.8rem', color: '#888', width: '20px', textAlign: 'center' }}>
                                    {index === 0 ? 'S' : (index === waypoints.length - 1 ? 'G' : index)}
                                </span>
                                <input
                                    type="text" value={wp.name}
                                    onChange={(e) => handleWaypointChange(index, 'name', e.target.value)}
                                    onFocus={() => setSuggestionTargetIndex(index)}
                                    placeholder={index === 0 ? "Start..." : (index === waypoints.length - 1 ? "Goal..." : "Via...")}
                                    style={{
                                        flex: 1, background: '#444', color: 'white', padding: '4px', borderRadius: '4px', fontSize: '0.9rem',
                                        // ターゲット中の行を強調（地点をクリックするとこの行に入る）
                                        border: index === suggestionTargetIndex ? '1px solid var(--focus, #66b3ff)' : '1px solid #555',
                                        boxShadow: index === suggestionTargetIndex ? '0 0 0 2px rgba(102,179,255,0.25)' : 'none',
                                    }}
                                />
                                {/* Fixed-width right zone so all rows have the same total width */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '80px', justifyContent: 'flex-end' }}>
                                    {wp.id ? (
                                        <button onClick={() => handleSyncTime(wp.id, wp.name, index)} title="Sync"
                                            style={{ background: '#333', border: '1px solid #555', color: '#fbbf24', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}
                                        >⏱</button>
                                    ) : (
                                        <div style={{ width: '24px' }} />
                                    )}
                                    {isIntermediate ? (
                                        <input
                                            type="number" min="0" value={wp.stayTime}
                                            onChange={(e) => handleWaypointChange(index, 'stayTime', parseFloat(e.target.value) || 0)}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="sec"
                                            style={{ width: '30px', background: '#333', border: '1px solid #555', color: '#88ff88', padding: '4px', borderRadius: '4px', fontSize: '0.8rem', textAlign: 'right' }}
                                            title="Stay Duration (sec)"
                                        />
                                    ) : (
                                        <div style={{ width: '30px' }} />
                                    )}
                                    {isIntermediate ? (
                                        <button onClick={() => handleRemoveWaypoint(index)}
                                            style={{ background: '#555', border: 'none', color: '#aaa', width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}
                                        >×</button>
                                    ) : (
                                        <div style={{ width: '20px' }} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <button onClick={handleAddWaypoint} style={{ marginTop: '5px', background: 'none', border: '1px dashed #555', color: '#aaa', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Stop</button>

                    {syncConstraints.length > 0 && (
                        <div style={{ borderTop: '1px solid #444', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '2px' }}>Sync Constraints:</div>
                            {syncConstraints.map((sc, i) => {
                                const isAnchor = i === 0;
                                return (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '3px 6px', borderRadius: '4px',
                                        background: isAnchor ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
                                        border: isAnchor ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent'
                                    }}>
                                        <span style={{ color: '#fbbf24', fontSize: '0.85rem' }}>⏱</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ color: '#ccc', fontSize: '0.78rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {sc.waypointName}
                                            </span>
                                            <span style={{ color: '#888', fontSize: '0.68rem' }}>
                                                {Math.round(sc.meetingTime)}fr{sc.charIds.length > 0 && ` · ${sc.charIds.length}char`}
                                            </span>
                                        </div>
                                        {isAnchor && (
                                            <span style={{ fontSize: '0.62rem', color: '#007acc', whiteSpace: 'nowrap' }}>anchor</span>
                                        )}
                                        <button
                                            onClick={() => onRemoveSyncConstraint(i)}
                                            title="Remove sync constraint"
                                            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem', lineHeight: '1', padding: '0 2px', flexShrink: 0 }}
                                        >×</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            
            {savedPathData && !isEditing ? (
                <>
                    <div style={{ color: '#e0e0e0', fontSize: '0.9rem', textAlign: 'center' }}>Target: <strong style={{ color: '#10b981' }}>Saved</strong> ({selectedIcons.length} users)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex' }}>
                            {selectedIcons.slice(0, 3).map((icon, i) => (
                                <img key={icon} src={`./icon/${icon}`} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #10b981', objectFit: 'cover', marginLeft: i > 0 ? '-15px' : 0 }} />
                            ))}
                        </div>
                        <button onClick={handleEditPath} style={{ backgroundColor: 'var(--warning, #f59e0b)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Edit</button>
                        <button onClick={handleDeletePath} style={{ backgroundColor: 'var(--danger, #ef4444)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Delete</button>
                    </div>
                </>
            ) : (
                <>
                    <div style={{ color: '#e0e0e0', fontSize: '0.9rem', textAlign: 'center' }}>
                        {highlightedPath.length > 0 ? <>Path: <strong style={{ color: '#fff' }}>{highlightedPath.length} steps</strong></> : <span style={{ color: '#888' }}>Set Waypoints</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex' }}>
                            {selectedIcons.length > 0 ? selectedIcons.slice(0, 3).map((icon, i) => (
                                <img key={icon} src={`./icon/${icon}`} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #007acc', objectFit: 'cover', marginLeft: i > 0 ? '-10px' : 0 }} />
                            )) : <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px dashed #888', display:'flex', alignItems:'center', justifyContent:'center', color:'#888' }}>?</div>}
                        </div>
                        <button onClick={handleSavePath} disabled={highlightedPath.length === 0}
                            style={{ backgroundColor: highlightedPath.length > 0 ? 'var(--accent, #7c5cff)' : 'var(--surface-4, #555)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: highlightedPath.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '0.85rem' }}
                        >
                            {selectedIcons.length > 1 ? `Save to ${selectedIcons.length}` : "Save Path"}
                        </button>
                        <button onClick={handleDeletePath}
                            style={{ backgroundColor: 'var(--danger, #ef4444)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                        >
                            Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};