import React, { useState } from 'react';
import { MapNode, Waypoint, StartRef, useAppStore } from '../../store';
import { SyncConstraint } from './WaypointPanel';
import { NodeCandidateList } from './NodeCandidateList';
import { SEGMENT_COLORS } from '../../utils/mapDrawUtils';
import { formatTime } from '../../utils/timeFormat';
import { formatCharName } from '../../utils/charName';
import { usePresetSyncIssues } from '../../hooks/usePresetSyncIssues';

interface RouteDockProps {
    isGraphEditMode: boolean;
    selectedIcons: string[];
    highlightedPath: string[];
    savedPathData: string[] | null;
    isEditing: boolean;
    startRef: StartRef | null;
    setStartRef: (r: StartRef | null) => void;
    showBeforeStart: boolean;
    setShowBeforeStart: (v: boolean) => void;
    startRefCharOptions: { id: string; name: string }[];
    startRefNodeOptions: { nodeId: string; occurrence: number; label: string }[];
    waypoints: Waypoint[];
    suggestionTargetIndex: number | null;
    handleWaypointChange: (index: number, field: keyof Waypoint, value: string | number) => void;
    setSuggestionTargetIndex: (index: number | null) => void;
    handleSyncTime: (id: string, name: string, waypointIndex?: number) => void;
    handleRemoveWaypoint: (index: number) => void;
    handleAddWaypoint: () => void;
    handleSavePath: () => void;
    handleEditPath: () => void;
    handleDeletePath: () => void;
    syncConstraints: SyncConstraint[];
    onRemoveSyncConstraint: (index: number) => void;
    // NodeCandidateList（旧 SuggestionSidebar）を統合表示するためのデータ
    matchedNodes: MapNode[];
    otherNodes: MapNode[];
    handleSelectSuggestion: (node: MapNode) => void;
}

// U1: Create画面の経路編集を1本の右ドックに統合する（旧: フローティングWaypointPanel + 右スライドSuggestionSidebar）。
// 折りたたみ時は幅24pxの縦タブになり、マップ領域を最大化できる。デスクトップ専用（モバイルは20.md #5のbottom variantを継続）。
export const RouteDock: React.FC<RouteDockProps> = ({
    isGraphEditMode, selectedIcons, highlightedPath, savedPathData, isEditing,
    startRef, setStartRef, showBeforeStart, setShowBeforeStart,
    startRefCharOptions, startRefNodeOptions,
    waypoints, suggestionTargetIndex, handleWaypointChange, setSuggestionTargetIndex,
    handleSyncTime, handleRemoveWaypoint, handleAddWaypoint,
    handleSavePath, handleEditPath, handleDeletePath,
    syncConstraints, onRemoveSyncConstraint,
    matchedNodes, otherNodes, handleSelectSuggestion,
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const showAlert = useAppStore(s => s.showAlert);
    const syncIssues = usePresetSyncIssues();

    if (isGraphEditMode) return null;
    if (selectedIcons.length === 0 && highlightedPath.length === 0) return null;

    if (collapsed) {
        return (
            <div className="route-dock route-dock--collapsed">
                <button className="route-dock__expand-btn" onClick={() => setCollapsed(false)} title="経路パネルを開く">◂</button>
            </div>
        );
    }

    const selectedNodeId = (suggestionTargetIndex !== null && waypoints[suggestionTargetIndex]) ? (waypoints[suggestionTargetIndex].id || "") : "";

    return (
        <div className={`route-dock${savedPathData ? ' is-saved' : ''}`}>
            <div className="route-dock__header">
                <span className="route-dock__title">
                    経路 {waypoints.filter(w => w.id).length}地点{syncConstraints.length > 0 && ` / sync ${syncConstraints.length}`}
                </span>
                {/* sync 整合性の常設警告バッジ（revise2 №12） */}
                {syncIssues.length > 0 && (
                    <span
                        onClick={() => showAlert(syncIssues.map(i => '• ' + i.message).join('\n'), 'sync 警告')}
                        title="クリックで詳細を表示"
                        style={{
                            color: syncIssues.some(i => i.level === 'error') ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)',
                            cursor: 'pointer', fontSize: '0.8rem', marginLeft: 6,
                        }}
                    >
                        ⚠ {syncIssues.length}
                    </span>
                )}
                <button className="route-dock__collapse-btn" onClick={() => setCollapsed(true)} title="経路パネルを閉じる">▸</button>
            </div>

            <div className="route-dock__body">
                {(!savedPathData || isEditing) && (
                    <>
                        {/* 開始条件（数値delayの代替）: 「基準キャラが地点に到達後 +N」 */}
                        <div className="route-dock__section">
                            <span className="route-dock__section-title">開始条件</span>
                            {/* sync 設定中は resolveStartTimes が startRef を無視するため、操作しても無言で無視される。
                                無効を明示する（revise2 №10） */}
                            {syncConstraints.length > 0 && (
                                <span className="route-dock__start-condition-text">sync 設定中は開始時刻が合流で決まるため使えません</span>
                            )}
                            <div className="route-dock__start-condition-row">
                                <select
                                    className="route-dock__select"
                                    disabled={syncConstraints.length > 0}
                                    value={startRef?.charId ?? ''}
                                    onChange={(e) => {
                                        const cid = e.target.value;
                                        if (!cid) { setStartRef(null); return; }
                                        setStartRef({ charId: cid, nodeId: '', occurrence: 0, phase: startRef?.phase ?? 'arrival', extraDelay: startRef?.extraDelay ?? 0 });
                                    }}
                                >
                                    <option value="">即時（待たない）</option>
                                    {startRefCharOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                {startRef && (
                                    <>
                                        <span className="route-dock__start-condition-text">が</span>
                                        <select
                                            className="route-dock__select"
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
                                            className="route-dock__select"
                                            disabled={syncConstraints.length > 0}
                                            value={startRef.phase ?? 'arrival'}
                                            onChange={(e) => setStartRef({ ...startRef, phase: e.target.value as 'arrival' | 'departure' })}
                                        >
                                            <option value="arrival">に到達後</option>
                                            <option value="departure">を出発後</option>
                                        </select>
                                        <input
                                            className="route-dock__delay-input"
                                            type="number" min="0" value={startRef.extraDelay}
                                            disabled={syncConstraints.length > 0}
                                            onChange={(e) => setStartRef({ ...startRef, extraDelay: parseFloat(e.target.value) || 0 })}
                                            onFocus={(e) => e.target.select()}
                                        />
                                        <span className="route-dock__delay-unit">fr</span>
                                    </>
                                )}
                            </div>
                            <label className="route-dock__show-before-start">
                                <input type="checkbox" checked={showBeforeStart} onChange={(e) => setShowBeforeStart(e.target.checked)} />
                                待機中も開始地点にアイコンを表示する
                            </label>
                        </div>

                        {/* RouteStepper: S→Via→G の地点リスト */}
                        <div className="route-dock__section">
                            {waypoints.map((wp, index) => {
                                const segmentColor = (index < waypoints.length - 1) ? SEGMENT_COLORS[index % SEGMENT_COLORS.length] : 'transparent';
                                const isIntermediate = index > 0 && index < waypoints.length - 1;
                                return (
                                    <div key={index} className="route-dock__row">
                                        <div className="route-dock__row-segment" style={{ '--seg-color': segmentColor } as React.CSSProperties}></div>
                                        <span className="route-dock__row-index">
                                            {index === 0 ? 'S' : (index === waypoints.length - 1 ? 'G' : index)}
                                        </span>
                                        <input
                                            type="text" value={wp.name}
                                            onChange={(e) => handleWaypointChange(index, 'name', e.target.value)}
                                            onFocus={() => setSuggestionTargetIndex(index)}
                                            placeholder={index === 0 ? "Start..." : (index === waypoints.length - 1 ? "Goal..." : "Via...")}
                                            className={`route-dock__row-input${index === suggestionTargetIndex ? ' is-target' : ''}`}
                                        />
                                        <div className="route-dock__row-actions">
                                            {wp.id ? (
                                                <button className="route-dock__sync-btn" onClick={() => handleSyncTime(wp.id, wp.name, index)} title="Sync"
                                                >⏱</button>
                                            ) : (
                                                <div className="route-dock__row-actions-spacer" />
                                            )}
                                            {isIntermediate ? (
                                                <input
                                                    className="route-dock__stay-input"
                                                    type="number" min="0" value={wp.stayTime}
                                                    onChange={(e) => handleWaypointChange(index, 'stayTime', parseFloat(e.target.value) || 0)}
                                                    onFocus={(e) => e.target.select()}
                                                    placeholder="sec"
                                                    title="Stay Duration (sec)"
                                                />
                                            ) : (
                                                <div className="route-dock__row-actions-spacer route-dock__row-actions-spacer--stay" />
                                            )}
                                            {isIntermediate ? (
                                                <button className="route-dock__remove-btn" onClick={() => handleRemoveWaypoint(index)}
                                                >×</button>
                                            ) : (
                                                <div className="route-dock__row-actions-spacer route-dock__row-actions-spacer--remove" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <button className="route-dock__add-stop" onClick={handleAddWaypoint}>+ Add Stop</button>
                        </div>

                        {/* NodeCandidateList: 地点入力にフォーカスがある間だけ、候補一覧をこの位置に自動展開する */}
                        {suggestionTargetIndex !== null && (
                            <div className="route-dock__section route-dock__candidates">
                                <div className="route-dock__section-title-row">
                                    <span className="route-dock__section-title">
                                        {suggestionTargetIndex === 0 ? 'Select Start' : suggestionTargetIndex === waypoints.length - 1 ? 'Select End' : 'Select Via'}
                                    </span>
                                    <button className="route-dock__candidates-close" onClick={() => setSuggestionTargetIndex(null)} title="閉じる">×</button>
                                </div>
                                <NodeCandidateList
                                    matchedNodes={matchedNodes}
                                    otherNodes={otherNodes}
                                    selectedNodeId={selectedNodeId}
                                    onSelect={handleSelectSuggestion}
                                />
                            </div>
                        )}

                        {syncConstraints.length > 0 && (
                            <div className="route-dock__section">
                                <div className="route-dock__section-title">Sync Constraints:</div>
                                {syncConstraints.map((sc, i) => {
                                    const isAnchor = i === 0;
                                    return (
                                        <div key={i} className={`route-dock__sync-item${isAnchor ? ' is-anchor' : ''}`}>
                                            <span className="route-dock__sync-icon">⏱</span>
                                            <div className="route-dock__sync-info">
                                                <span className="route-dock__sync-name">{sc.waypointName}</span>
                                                <span
                                                    className="route-dock__sync-meta"
                                                    title={`${formatTime(Math.max(0, sc.meetingTime))} · ${sc.charIds.map(formatCharName).join('・')}${sc.occurrence !== undefined ? `（自分の${sc.occurrence + 1}回目の訪問）` : ''}`}
                                                >
                                                    {formatTime(Math.max(0, sc.meetingTime))} · {sc.charIds.map(formatCharName).join('・')}
                                                </span>
                                            </div>
                                            {isAnchor && <span className="route-dock__sync-anchor-badge">anchor</span>}
                                            <button className="route-dock__sync-remove" onClick={() => onRemoveSyncConstraint(i)} title="Remove sync constraint">×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* DockFooter: Save/Edit/Delete。常時可視（本文が長くてもスクロールで隠れない） */}
            <div className="route-dock__footer">
                {savedPathData && !isEditing ? (
                    <>
                        <div className="route-dock__status">Target: <strong className="route-dock__status-value--saved">Saved</strong> ({selectedIcons.length} users)</div>
                        <div className="route-dock__actions">
                            <div className="route-dock__icons">
                                {selectedIcons.slice(0, 3).map((icon, i) => (
                                    <img key={icon} src={`./icon/${icon}`} alt="" className="route-dock__icon route-dock__icon--saved" style={{ marginLeft: i > 0 ? '-15px' : 0 }} />
                                ))}
                            </div>
                            <button className="route-dock__btn route-dock__btn--edit" onClick={handleEditPath}>Edit</button>
                            <button className="route-dock__btn route-dock__btn--delete" onClick={handleDeletePath}>Delete</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="route-dock__status">
                            {highlightedPath.length > 0 ? <>Path: <strong className="route-dock__status-value--path">{highlightedPath.length} steps</strong></> : <span className="route-dock__status-empty">Set Waypoints</span>}
                        </div>
                        <div className="route-dock__actions">
                            <div className="route-dock__icons">
                                {selectedIcons.length > 0 ? selectedIcons.slice(0, 3).map((icon, i) => (
                                    <img key={icon} src={`./icon/${icon}`} alt="" className="route-dock__icon route-dock__icon--pending" style={{ marginLeft: i > 0 ? '-10px' : 0 }} />
                                )) : <div className="route-dock__icon-placeholder">?</div>}
                            </div>
                            <button className="route-dock__btn route-dock__btn--save" onClick={handleSavePath} disabled={highlightedPath.length === 0}>
                                {selectedIcons.length > 1 ? `Save to ${selectedIcons.length}` : "Save Path"}
                            </button>
                            <button className="route-dock__btn route-dock__btn--delete-lg" onClick={handleDeletePath}>Delete</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
