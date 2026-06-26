import React from 'react';
import { useAppStore } from '../store';
import { CanvasWorkspace } from './NoteView';

// ▼ 修正: React.memo でラップし、親(AnimateView)からの不要な再レンダリングをブロック ▼
export const NotesPanel = React.memo(() => {
  // ▼ 修正: 必要な状態だけを個別に取得 ▼
  const activePresetId = useAppStore(state => state.activePresetId);
  const presets = useAppStore(state => state.presets);
  
  const activePreset = presets.find(p => p.id === activePresetId);

  return (
    // ▼ 修正: 親コンテナの背景をキャンバスカラー（方眼紙）に合わせて一体感を持たせる ▼
    <div style={{ 
        height: '100%', display: 'flex', flexDirection: 'column',
        backgroundColor: '#ECD2B3', 
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 24 0 L 0 0 0 24' fill='none' stroke='%23C2B2A1' stroke-width='1' stroke-dasharray='3 3'/%3E%3C/svg%3E")`,
        backgroundSize: '24px 24px',
        zIndex: 10
    }}>
      <div style={{ 
          fontSize: '12px', fontWeight: 'bold', padding: '10px', color: '#888', 
          display: 'flex', justifyContent: 'space-between', 
          backgroundColor: '#252526', borderBottom: '1px solid #333',
          flexShrink: 0,
          zIndex: 20
      }}>
        <span>事件ノート</span>
        <span style={{ color: '#007acc' }}>{activePreset?.name || 'Unknown'}</span>
      </div>
      
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activePresetId ? (
            <CanvasWorkspace 
                targetType="preset" 
                targetId={activePresetId} 
                compactMode={true} 
            />
        ) : (
            <div style={{ 
                color: '#666', padding: '20px', display: 'flex', 
                justifyContent: 'center', alignItems: 'center', height: '100%',
                backgroundColor: '#252526' // 選択されていない時は暗い背景
            }}>
                No timeline selected
            </div>
        )}
      </div>
    </div>
  );
});