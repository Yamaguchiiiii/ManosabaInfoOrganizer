import React from 'react';
import { useAppStore, FloorId, ICON_FILES } from '../store';
import { useSidebarResizer } from '../hooks/useSidebarResizer';

interface SidebarProps {
  selectedIcons: string[];
  onIconSelect: (icon: string, isShift: boolean) => void;
  onModeChange: (mode: 'create' | 'animate' | 'note') => void;
  onFloorChange: (floor: FloorId) => void;
}

// ▼ 修正: 必要な状態だけを個別に取得 ▼
export const Sidebar: React.FC<SidebarProps> = React.memo(({
    selectedIcons, onIconSelect, onModeChange
}) => {
  // onFloorChange / activeFloor は FLOOR セクション廃止により未使用（#06/28-6:04-6）
  const mode = useAppStore(state => state.mode);
  const isGraphEditMode = useAppStore(state => state.isGraphEditMode);
  const setGraphEditMode = useAppStore(state => state.setGraphEditMode);
  const sidebarWidth = useAppStore(state => state.sidebarWidth);
  const setSidebarWidth = useAppStore(state => state.setSidebarWidth);
  const presets = useAppStore(state => state.presets);
  const activePresetId = useAppStore(state => state.activePresetId);
  const toggleDeadIcon = useAppStore(state => state.toggleDeadIcon);
  const activeNoteTab = useAppStore(state => state.activeNoteTab);
  const setActiveNoteTab = useAppStore(state => state.setActiveNoteTab);
  const isSkullMode = useAppStore(state => state.isSkullMode);
  const setSkullMode = useAppStore(state => state.setSkullMode);

  const { startResizing } = useSidebarResizer(setSidebarWidth);

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const handleIconClick = (icon: string, e: React.MouseEvent) => {
      if (isSkullMode && mode === 'create') {
          toggleDeadIcon(icon);
          if (selectedIcons.includes(icon) && !deadIcons.includes(icon)) {
              onIconSelect(icon, true); 
          }
          return;
      }
      if (deadIcons.includes(icon)) {
          return;
      }
      onIconSelect(icon, e.shiftKey);
  };

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-content">
        <div style={{ marginBottom: '20px', padding: '10px', borderBottom: '1px solid #444', fontWeight: 'bold', color: '#fff', fontSize: '1.1rem' }}>
            サイト名(仮)
        </div>

        <div className="section-title" style={{ marginTop: 0 }}>PAGE</div>
        
        <div 
            className={`menu-item ${mode === 'create' ? 'active' : ''}`} 
            onClick={() => onModeChange('create')}
        >
            Create
        </div>
        
        <div 
            className={`menu-item ${mode === 'animate' ? 'active' : ''}`} 
            onClick={() => onModeChange('animate')}
        >
            Animate
        </div>
        
        <div className="menu-tree-wrapper">
            <div 
                className={`menu-item ${mode === 'note' ? 'active' : ''}`} 
                onClick={() => onModeChange('note')}
            >
                Note
            </div>

            {mode === 'note' && (
                <div className="sub-menu-container">
                    <div 
                        className={`sub-menu-item ${activeNoteTab === 'overview' ? 'active' : ''}`} 
                        onClick={(e) => { e.stopPropagation(); setActiveNoteTab('overview'); }}
                    >
                        全体ノート
                    </div>
                    <div 
                        className={`sub-menu-item ${activeNoteTab === 'preset' ? 'active' : ''}`} 
                        onClick={(e) => { e.stopPropagation(); setActiveNoteTab('preset'); }}
                    >
                        事件ノート
                    </div>
                    <div 
                        className={`sub-menu-item ${activeNoteTab === 'character' ? 'active' : ''}`} 
                        onClick={(e) => { e.stopPropagation(); setActiveNoteTab('character'); }}
                    >
                        キャラクターノート
                    </div>
                    <div 
                        className={`sub-menu-item ${activeNoteTab === 'misc' ? 'active' : ''}`} 
                        onClick={(e) => { e.stopPropagation(); setActiveNoteTab('misc'); }}
                    >
                        メモ
                    </div>
                </div>
            )}
        </div>

        {/* #06/28-6:04-6: 4ペイン表示で全フロアが同時に見えるため FLOOR セクションは廃止 */}

        {mode !== 'note' && (
            <>
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ICONS</span>
                    {mode === 'create' && (
                    <button
                        onClick={() => setSkullMode(!isSkullMode)}
                        style={{
                            background: isSkullMode ? '#ef4444' : 'transparent',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: isSkullMode ? 'white' : '#666',
                            fontSize: '1rem',
                            padding: '2px 6px',
                            lineHeight: 1,
                            transition: 'all 0.2s'
                        }}
                        title="Toggle Death Mode"
                    >
                        💀
                    </button>
                    )}
                </div>

                <div className="icon-grid">
                {ICON_FILES.map((fileName, index) => {
                    const isSelected = selectedIcons.includes(fileName);
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
                                position: 'absolute', top: 0, right: 0,
                                width: '14px', height: '14px',
                                backgroundColor: '#10b981', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '9px', color: 'white', fontWeight: 'bold',
                                border: '1px solid #1e1e1e', zIndex: 10
                            }}>✓</div>
                        )}
                        {isSelected && selectedIcons.length > 1 && (
                            <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#007acc' }} />
                        )}
                        </div>
                    );
                })}
                </div>

                {mode === 'create' && (
                  <div style={{ marginTop: '20px', padding: '10px', background: '#333', borderRadius: '4px' }}>
                    <div className="section-title" style={{ marginTop: 0, marginBottom: '10px' }}>Create Tools</div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="checkbox" checked={isGraphEditMode} onChange={(e) => setGraphEditMode(e.target.checked)} style={{ marginRight: '8px' }} />
                      Edit Map Graph
                    </label>
                    <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '5px' }}>
                        Check to add nodes/edges.<br/>Click blank: Add Node<br/>Click Node: Connect Line<br/>Right Click: Delete or Set Stair<br/>Stair Nodes switch floor on click.
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