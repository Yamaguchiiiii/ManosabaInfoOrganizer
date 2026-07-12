import React, { useState } from 'react';
import { MapNode, Waypoint, SyncConstraint, StartRef } from '../../store';
import { SEGMENT_COLORS } from '../../utils/mapDrawUtils';
import { formatTime } from '../../utils/timeFormat';
import { formatCharName } from '../../utils/charName';
import { NodeCandidateList } from './NodeCandidateList';

export type { SyncConstraint };

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
    // モバイル/縦1x4では floating がマップに被るため、下部の折りたたみバーに切り替える（20.md #5）。
    // dock: 0711 #7 の2ペイン化。オーバーレイをやめ通常フローの下ペインに置き、マップを常時可視にする。
    variant?: 'floating' | 'bottom' | 'dock';
    // dock 用: 地点入力の候補一覧（NodeCandidateList）を body 内に統合表示する
    matchedNodes?: MapNode[];
    otherNodes?: MapNode[];
    handleSelectSuggestion?: (n: MapNode) => void;
}

export const WaypointPanel: React.FC<WaypointPanelProps> = ({
    isGraphEditMode, selectedIcons, highlightedPath, savedPathData, isEditing,
    startRef, setStartRef, showBeforeStart, setShowBeforeStart,
    startRefCharOptions, startRefNodeOptions,
    waypoints, suggestionTargetIndex, handleWaypointChange, setSuggestionTargetIndex,
    handleSyncTime, handleRemoveWaypoint, handleAddWaypoint,
    handleSavePath, handleEditPath, handleDeletePath,
    syncConstraints, onRemoveSyncConstraint, variant = 'floating',
    matchedNodes = [], otherNodes = [], handleSelectSuggestion,
}) => {
    const [collapsed, setCollapsed] = useState(variant !== 'floating'); // bottom/dock は既定折りたたみ

    if (isGraphEditMode) return null;
    if (selectedIcons.length === 0 && highlightedPath.length === 0) return null;

    const selectedNodeId = (suggestionTargetIndex !== null && waypoints[suggestionTargetIndex]) ? (waypoints[suggestionTargetIndex].id || "") : "";

    const rootClassName = [
        'waypoint-panel',
        variant === 'bottom' && 'waypoint-panel--bottom',
        variant === 'dock' && 'waypoint-panel--dock',
        (variant === 'bottom' || variant === 'dock') && collapsed && 'is-collapsed',
        savedPathData && 'is-saved',
    ].filter(Boolean).join(' ');

    return (
        <div className={rootClassName}>
            <div className="waypoint-panel__header">
                <button className="waypoint-panel__collapse-btn" onClick={() => setCollapsed(v => !v)}
                >{collapsed ? '▸' : '▾'}</button>
                <span className="waypoint-panel__summary">
                    経路 {waypoints.filter(w => w.id).length}地点{syncConstraints.length > 0 && ` / sync ${syncConstraints.length}`}
                </span>
            </div>

            {!collapsed && (!savedPathData || isEditing) && (
                <div className="waypoint-panel__body">
                    {/* 開始条件（数値delayの代替）: 「基準キャラが地点に到達後 +N」 */}
                    <div className="waypoint-panel__start-condition">
                        <span className="waypoint-panel__start-condition-title">開始条件</span>
                        {/* sync 設定中は resolveStartTimes が startRef を無視するため無効を明示する（revise2 №10） */}
                        {syncConstraints.length > 0 && (
                            <span className="waypoint-panel__start-condition-text">sync 設定中は開始時刻が合流で決まるため使えません</span>
                        )}
                        <div className="waypoint-panel__start-condition-row">
                            <select
                                className="waypoint-panel__select"
                                disabled={syncConstraints.length > 0}
                                value={startRef?.charId ?? ''}
                                onChange={(e) => {
                                    const cid = e.target.value;
                                    if (!cid) { setStartRef(null); return; }
                                    // 既存 nodeId が無効なら未選択にして、ユーザーに地点を選ばせる
                                    setStartRef({ charId: cid, nodeId: '', occurrence: 0, phase: startRef?.phase ?? 'arrival', extraDelay: startRef?.extraDelay ?? 0 });
                                }}
                            >
                                <option value="">即時（待たない）</option>
                                {startRefCharOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {startRef && (
                                <>
                                    <span className="waypoint-panel__start-condition-text">が</span>
                                    <select
                                        className="waypoint-panel__select"
                                        disabled={syncConstraints.length > 0}
                                        value={startRef.nodeId ? `${startRef.nodeId}#${startRef.occurrence}` : ''}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) { setStartRef({ ...startRef, nodeId: '', occurrence: 0 }); return; }
                                            const [nodeId, occStr] = v.split('#');
                                            setStartRef({ ...startRef, nodeId, occurrence: parseInt(occStr, 10) || 0 });
                                        }}
                                    >
                                        <option value="">地点を選択…</option>
                                        {startRefNodeOptions.map(o => (
                                            <option key={`${o.nodeId}#${o.occurrence}`} value={`${o.nodeId}#${o.occurrence}`}>{o.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="waypoint-panel__select"
                                        disabled={syncConstraints.length > 0}
                                        value={startRef.phase ?? 'arrival'}
                                        onChange={(e) => setStartRef({ ...startRef, phase: e.target.value as 'arrival' | 'departure' })}
                                    >
                                        <option value="arrival">に到達後</option>
                                        <option value="departure">を出発後</option>
                                    </select>
                                    <input
                                        className="waypoint-panel__delay-input"
                                        type="number" min="0" value={startRef.extraDelay}
                                        disabled={syncConstraints.length > 0}
                                        onChange={(e) => setStartRef({ ...startRef, extraDelay: parseFloat(e.target.value) || 0 })}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="waypoint-panel__delay-unit">fr</span>
                                </>
                            )}
                        </div>
                        <label className="waypoint-panel__show-before-start">
                            <input type="checkbox" checked={showBeforeStart} onChange={(e) => setShowBeforeStart(e.target.checked)} />
                            待機中も開始地点にアイコンを表示する
                        </label>
                    </div>

                    {waypoints.map((wp, index) => {
                        const segmentColor = (index < waypoints.length - 1) ? SEGMENT_COLORS[index % SEGMENT_COLORS.length] : 'transparent';
                        const isIntermediate = index > 0 && index < waypoints.length - 1;
                        return (
                            <div key={index} className="waypoint-panel__row">
                                <div className="waypoint-panel__row-segment" style={{ '--seg-color': segmentColor } as React.CSSProperties}></div>
                                <span className="waypoint-panel__row-index">
                                    {index === 0 ? 'S' : (index === waypoints.length - 1 ? 'G' : index)}
                                </span>
                                <input
                                    type="text" value={wp.name}
                                    onChange={(e) => handleWaypointChange(index, 'name', e.target.value)}
                                    onFocus={() => setSuggestionTargetIndex(index)}
                                    placeholder={index === 0 ? "Start..." : (index === waypoints.length - 1 ? "Goal..." : "Via...")}
                                    className={`waypoint-panel__row-input${index === suggestionTargetIndex ? ' is-target' : ''}`}
                                />
                                {/* Fixed-width right zone so all rows have the same total width */}
                                <div className="waypoint-panel__row-actions">
                                    {wp.id ? (
                                        <button className="waypoint-panel__sync-btn" onClick={() => handleSyncTime(wp.id, wp.name, index)} title="Sync"
                                        >⏱</button>
                                    ) : (
                                        <div className="waypoint-panel__row-actions-spacer" />
                                    )}
                                    {isIntermediate ? (
                                        <input
                                            className="waypoint-panel__stay-input"
                                            type="number" min="0" value={wp.stayTime}
                                            onChange={(e) => handleWaypointChange(index, 'stayTime', parseFloat(e.target.value) || 0)}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="sec"
                                            title="Stay Duration (sec)"
                                        />
                                    ) : (
                                        <div className="waypoint-panel__row-actions-spacer waypoint-panel__row-actions-spacer--stay" />
                                    )}
                                    {isIntermediate ? (
                                        <button className="waypoint-panel__remove-btn" onClick={() => handleRemoveWaypoint(index)}
                                        >×</button>
                                    ) : (
                                        <div className="waypoint-panel__row-actions-spacer waypoint-panel__row-actions-spacer--remove" />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <button className="waypoint-panel__add-stop" onClick={handleAddWaypoint}>+ Add Stop</button>

                    {/* dock: 地点入力にフォーカスがある間、候補一覧を body 内に自動展開する（0711 #7） */}
                    {variant === 'dock' && suggestionTargetIndex !== null && handleSelectSuggestion && (
                        <div style={{ maxHeight: '30vh', overflowY: 'auto' }}>
                            <NodeCandidateList
                                matchedNodes={matchedNodes}
                                otherNodes={otherNodes}
                                selectedNodeId={selectedNodeId}
                                onSelect={handleSelectSuggestion}
                            />
                        </div>
                    )}

                    {syncConstraints.length > 0 && (
                        <div className="waypoint-panel__sync-constraints">
                            <div className="waypoint-panel__sync-constraints-title">Sync Constraints:</div>
                            {syncConstraints.map((sc, i) => {
                                const isAnchor = i === 0;
                                return (
                                    <div key={i} className={`waypoint-panel__sync-item${isAnchor ? ' is-anchor' : ''}`}>
                                        <span className="waypoint-panel__sync-icon">⏱</span>
                                        <div className="waypoint-panel__sync-info">
                                            <span className="waypoint-panel__sync-name">
                                                {sc.waypointName}
                                            </span>
                                            <span
                                                className="waypoint-panel__sync-meta"
                                                title={`${formatTime(Math.max(0, sc.meetingTime))} · ${sc.charIds.map(formatCharName).join('・')}${sc.occurrence !== undefined ? `（自分の${sc.occurrence + 1}回目の訪問）` : ''}`}
                                            >
                                                {formatTime(Math.max(0, sc.meetingTime))} · {sc.charIds.map(formatCharName).join('・')}
                                            </span>
                                        </div>
                                        {isAnchor && (
                                            <span className="waypoint-panel__sync-anchor-badge">anchor</span>
                                        )}
                                        <button
                                            className="waypoint-panel__sync-remove"
                                            onClick={() => onRemoveSyncConstraint(i)}
                                            title="Remove sync constraint"
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
                    <div className="waypoint-panel__status">Target: <strong className="waypoint-panel__status-value--saved">Saved</strong> ({selectedIcons.length} users)</div>
                    <div className="waypoint-panel__actions">
                        <div className="waypoint-panel__icons">
                            {selectedIcons.slice(0, 3).map((icon, i) => (
                                <img key={icon} src={`./icon/${icon}`} alt="" className="waypoint-panel__icon waypoint-panel__icon--saved" style={{ marginLeft: i > 0 ? '-15px' : 0 }} />
                            ))}
                        </div>
                        <button className="waypoint-panel__btn waypoint-panel__btn--edit" onClick={handleEditPath}>Edit</button>
                        <button className="waypoint-panel__btn waypoint-panel__btn--delete" onClick={handleDeletePath}>Delete</button>
                    </div>
                </>
            ) : (
                <>
                    <div className="waypoint-panel__status">
                        {highlightedPath.length > 0 ? <>Path: <strong className="waypoint-panel__status-value--path">{highlightedPath.length} steps</strong></> : <span className="waypoint-panel__status-empty">Set Waypoints</span>}
                    </div>
                    <div className="waypoint-panel__actions">
                        <div className="waypoint-panel__icons">
                            {selectedIcons.length > 0 ? selectedIcons.slice(0, 3).map((icon, i) => (
                                <img key={icon} src={`./icon/${icon}`} alt="" className="waypoint-panel__icon waypoint-panel__icon--pending" style={{ marginLeft: i > 0 ? '-10px' : 0 }} />
                            )) : <div className="waypoint-panel__icon-placeholder">?</div>}
                        </div>
                        <button className="waypoint-panel__btn waypoint-panel__btn--save" onClick={handleSavePath} disabled={highlightedPath.length === 0}
                        >
                            {selectedIcons.length > 1 ? `Save to ${selectedIcons.length}` : "Save Path"}
                        </button>
                        <button className="waypoint-panel__btn waypoint-panel__btn--delete-lg" onClick={handleDeletePath}
                        >
                            Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
