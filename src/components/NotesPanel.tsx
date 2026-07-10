import React from 'react';
import { useAppStore } from '../store';
import { CanvasWorkspace } from './note/CanvasWorkspace';

// ▼ 修正: React.memo でラップし、親(AnimateView)からの不要な再レンダリングをブロック ▼
export const NotesPanel = React.memo(() => {
  const activePresetId = useAppStore(state => state.activePresetId);

  return (
    // ヘッダーバー(事件ノート/プリセット名)は廃止し、Canvasがセル全体を使う。
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', zIndex: 10 }}>
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
              backgroundColor: '#252526'
          }}>
              No timeline selected
          </div>
      )}
    </div>
  );
});