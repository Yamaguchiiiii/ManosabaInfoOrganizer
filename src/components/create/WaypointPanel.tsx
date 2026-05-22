import React from 'react';
import { Waypoint, SyncConstraint } from '../../store';
import { SEGMENT_COLORS } from '../../utils/mapDrawUtils';

export type { SyncConstraint };

interface WaypointPanelProps {
    isGraphEditMode: boolean;
    selectedIcons: string[];
    highlightedPath: string[];
    savedPathData: string[] | null;
    isEditing: boolean;
    startTime: number;
    setStartTime: (time: number) => void;
    waypoints: Waypoint[];
    handleWaypointChange: (index: number, field: keyof Waypoint, value: string | number) => void;
    setSuggestionTargetIndex: (index: number) => void;
    handleSyncTime: (id: string, name: string) => void;
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
    startTime, setStartTime, waypoints, handleWaypointChange, setSuggestionTargetIndex,
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid #444' }}>
                            <span style={{ fontSize: '0.8rem', color: '#ccc', width: '60px' }}>Delay:</span>
                            <input 
                            type="number" min="0" value={startTime}
                            onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '4px', borderRadius: '4px', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#888' }}>frames</span>
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
                                    style={{ flex: 1, background: '#444', border: '1px solid #555', color: 'white', padding: '4px', borderRadius: '4px', fontSize: '0.9rem' }}
                                />
                                {/* Fixed-width right zone so all rows have the same total width */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '80px', justifyContent: 'flex-end' }}>
                                    {wp.id ? (
                                        <button onClick={() => handleSyncTime(wp.id, wp.name)} title="Sync"
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
                        <button onClick={handleEditPath} style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Edit</button>
                        <button onClick={handleDeletePath} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Delete</button>
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
                            style={{ backgroundColor: highlightedPath.length > 0 ? '#007acc' : '#555', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: highlightedPath.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '0.85rem' }}
                        >
                            {selectedIcons.length > 1 ? `Save to ${selectedIcons.length}` : "Save Path"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};