import React from 'react';
import { useAppStore, usePlaybackStore, ICON_FILES } from '../store';
import { useSidebarResizer } from '../hooks/useSidebarResizer';
import { TOUR_TARGETS } from './tutorial/tourTargets';
import { usePresetEvents } from '../hooks/usePresetEvents';
import { EventList } from './common/EventList';
import { formatCharName } from '../utils/charName';

interface ContextPanelProps {
  selectedIcons: string[];
  onIconSelect: (icon: string, isShift: boolean) => void;
}

const NOTE_TABS: { id: 'overview' | 'preset' | 'character' | 'misc'; label: string }[] = [
  { id: 'overview', label: '全体ノート' },
  { id: 'preset', label: '事件ノート' },
  { id: 'character', label: 'キャラクターノート' },
  { id: 'misc', label: 'メモ' },
];

// 文脈パネル（旧サイドバー本体）。ui.md P2。ページ切替は NavRail へ移設し、ここは
// 「そのページで扱う対象」を出す: Create/Animate=キャラ一覧(ICONS)、Note=ノート種別。
export const ContextPanel: React.FC<ContextPanelProps> = React.memo(({ selectedIcons, onIconSelect }) => {
  const mode = useAppStore(s => s.mode);
  const isGraphEditMode = useAppStore(s => s.isGraphEditMode);
  const setGraphEditMode = useAppStore(s => s.setGraphEditMode);
  const sidebarWidth = useAppStore(s => s.sidebarWidth);
  const setSidebarWidth = useAppStore(s => s.setSidebarWidth);
  const presets = useAppStore(s => s.presets);
  const activePresetId = useAppStore(s => s.activePresetId);
  const toggleDeadIcon = useAppStore(s => s.toggleDeadIcon);
  const activeNoteTab = useAppStore(s => s.activeNoteTab);
  const setActiveNoteTab = useAppStore(s => s.setActiveNoteTab);
  const isSkullMode = useAppStore(s => s.isSkullMode);
  const setSkullMode = useAppStore(s => s.setSkullMode);
  const setContextPanelCollapsed = useAppStore(s => s.setContextPanelCollapsed);
  const eventFilterChar = useAppStore(s => s.eventFilterChar);
  const setEventFilterChar = useAppStore(s => s.setEventFilterChar);
  // Animate 以外でも呼んで害はないが未使用時はメモコストのみ
  const { events } = usePresetEvents();

  const { startResizing } = useSidebarResizer(setSidebarWidth);

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const handleIconClick = (icon: string, e: React.MouseEvent) => {
    if (mode === 'animate') {
      setEventFilterChar(eventFilterChar === icon ? null : icon);   // 再タップで解除
      return;
    }
    if (isSkullMode && mode === 'create') {
      toggleDeadIcon(icon);
      if (selectedIcons.includes(icon) && !deadIcons.includes(icon)) {
        onIconSelect(icon, true);
      }
      return;
    }
    if (deadIcons.includes(icon)) return;
    onIconSelect(icon, e.shiftKey);
  };

  return (
    <div className="context-panel" style={{ width: sidebarWidth }}>
      <div className="context-panel-content">
        <div className="context-panel-header">
          <span className="context-panel-title">{mode === 'note' ? 'ノート' : 'キャラクター'}</span>
          <button className="collapse-btn" title="パネルを閉じる" onClick={() => setContextPanelCollapsed(true)}>◀</button>
        </div>

        {mode === 'note' ? (
          <div data-tour={TOUR_TARGETS.noteTabs}>
            {NOTE_TABS.map(t => (
              <div
                key={t.id}
                className={`menu-item ${activeNoteTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveNoteTab(t.id)}
              >
                {t.label}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0 }}>
              <span>ICONS</span>
              {mode === 'create' && (
                <button
                  onClick={() => setSkullMode(!isSkullMode)}
                  style={{
                    background: isSkullMode ? 'var(--danger, #ef4444)' : 'transparent',
                    border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
                    color: isSkullMode ? 'white' : '#666', fontSize: '1rem',
                    padding: '2px 6px', lineHeight: 1, transition: 'all 0.2s'
                  }}
                  title="Toggle Death Mode"
                >💀</button>
              )}
            </div>

            <div className="icon-grid" data-tour={TOUR_TARGETS.sidebarIcons}>
              {ICON_FILES.map((fileName, index) => {
                const isSelected = mode === 'animate' ? eventFilterChar === fileName : selectedIcons.includes(fileName);
                const isDead = deadIcons.includes(fileName);
                const isDone = !!(activePreset?.data?.[fileName]);
                return (
                  <div
                    key={index}
                    className={`icon-item ${isSelected ? 'selected' : ''}`}
                    onClick={(e) => handleIconClick(fileName, e)}
                    style={{
                      filter: isDead ? 'grayscale(100%) brightness(40%)' : (isDone ? 'brightness(0.75)' : 'none'),
                      opacity: isDead && (!isSkullMode || mode === 'animate') ? 0.6 : 1,
                      cursor: (isDead && !isSkullMode) ? 'not-allowed' : 'pointer',
                      transition: 'filter 0.3s ease'
                    }}
                  >
                    <img
                      src={`./icon/${fileName}`}
                      alt={fileName}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {isDone && (
                      <div style={{
                        position: 'absolute', top: 0, right: 0, width: '14px', height: '14px',
                        backgroundColor: 'var(--success, #10b981)', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', color: 'white', fontWeight: 'bold',
                        border: '1px solid #1e1e1e', zIndex: 10
                      }}>✓</div>
                    )}
                    {isSelected && selectedIcons.length > 1 && (
                      <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--focus-strong, #007acc)' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {mode === 'animate' && (
              <>
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>イベント</span>
                  {eventFilterChar && (
                    <button onClick={() => setEventFilterChar(null)} title="フィルタ解除"
                      style={{ background: 'transparent', border: '1px solid #555', borderRadius: 4, color: '#aaa',
                               cursor: 'pointer', fontSize: '0.7rem', padding: '2px 8px', lineHeight: 1 }}>
                      × 解除
                    </button>
                  )}
                </div>
                {eventFilterChar && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: '0.72rem', color: '#aaa' }}>
                    <img src={`./icon/${eventFilterChar}`} style={{ width: 18, height: 18, borderRadius: '50%' }} alt="" />
                    {formatCharName(eventFilterChar)} のイベントのみ表示中
                  </div>
                )}
                <div style={{ maxHeight: '32vh', overflowY: 'auto' }}>
                  <EventList
                    events={eventFilterChar ? events.filter(e => e.charIds.includes(eventFilterChar)) : events}
                    onJump={(t) => usePlaybackStore.getState().setCurrentTime(t)}
                  />
                </div>
              </>
            )}

            {mode === 'create' && (
              <div style={{ marginTop: '20px', padding: '10px', background: '#333', borderRadius: '4px' }}>
                <div className="section-title" style={{ marginTop: 0, marginBottom: '10px' }}>Create Tools</div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={isGraphEditMode} onChange={(e) => setGraphEditMode(e.target.checked)} style={{ marginRight: '8px' }} />
                  Edit Map Graph
                </label>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '5px' }}>
                  Check to add nodes/edges.<br />Click blank: Add Node<br />Click Node: Connect Line<br />Right Click: Delete or Set Stair<br />Stair Nodes switch floor on click.
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="resizer" onMouseDown={startResizing} />
    </div>
  );
});
