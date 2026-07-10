import React from 'react';
import { useAppStore, ICON_FILES } from '../../store';
import { BottomSheet } from './BottomSheet';

interface MobileContextSheetProps {
  open: boolean;
  onClose: () => void;
}

const NOTE_TABS: { id: 'overview' | 'preset' | 'character' | 'misc'; label: string }[] = [
  { id: 'overview', label: '全体ノート' },
  { id: 'preset', label: '事件ノート' },
  { id: 'character', label: 'キャラクターノート' },
  { id: 'misc', label: 'メモ' },
];

// モバイルの文脈シート（smartphone.md M0）。デスクトップの ContextPanel 相当を下から出す。
// Note=ノート種別、Create/Animate=キャラ一覧(+Createはどくろ/Edit Map Graph)。
export const MobileContextSheet: React.FC<MobileContextSheetProps> = ({ open, onClose }) => {
  const mode = useAppStore(s => s.mode);
  const activeNoteTab = useAppStore(s => s.activeNoteTab);
  const setActiveNoteTab = useAppStore(s => s.setActiveNoteTab);
  const presets = useAppStore(s => s.presets);
  const activePresetId = useAppStore(s => s.activePresetId);
  const toggleDeadIcon = useAppStore(s => s.toggleDeadIcon);
  const isSkullMode = useAppStore(s => s.isSkullMode);
  const setSkullMode = useAppStore(s => s.setSkullMode);
  const isGraphEditMode = useAppStore(s => s.isGraphEditMode);
  const setGraphEditMode = useAppStore(s => s.setGraphEditMode);
  const selectedIcons = useAppStore(s => s.selectedIcons);
  const selectIcon = useAppStore(s => s.selectIcon);

  const activePreset = presets.find(p => p.id === activePresetId);
  const deadIcons = activePreset?.deadIcons || [];

  const handleIcon = (icon: string) => {
    if (isSkullMode && mode === 'create') { toggleDeadIcon(icon); return; }
    if (deadIcons.includes(icon)) return;
    void selectIcon(icon, false); // モバイルは単一選択（Shift 無し）
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === 'note' ? 'ノート' : 'キャラクター'} height="half">
      {mode === 'note' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {NOTE_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveNoteTab(t.id); onClose(); }}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                background: activeNoteTab === t.id ? 'rgba(124,92,255,0.15)' : 'var(--surface-3, #2f2f33)',
                border: activeNoteTab === t.id ? '1px solid var(--accent, #7c5cff)' : '1px solid transparent',
                color: activeNoteTab === t.id ? '#fff' : '#ccc', fontSize: '0.95rem',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          {mode === 'create' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={isGraphEditMode} onChange={e => setGraphEditMode(e.target.checked)} />
                Edit Map Graph
              </label>
              <button
                onClick={() => setSkullMode(!isSkullMode)}
                style={{
                  background: isSkullMode ? 'var(--danger, #ef4444)' : 'var(--surface-3, #333)',
                  border: '1px solid #555', borderRadius: 8, color: isSkullMode ? '#fff' : '#888',
                  padding: '8px 12px', cursor: 'pointer', fontSize: '1rem',
                }}
                title="死亡設定モード"
              >💀 死亡設定</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {ICON_FILES.map(icon => {
              const isSelected = selectedIcons.includes(icon);
              const isDead = deadIcons.includes(icon);
              const isDone = !!(activePreset?.data?.[icon]);
              return (
                <div
                  key={icon}
                  onClick={() => handleIcon(icon)}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                    border: isSelected ? '2px solid var(--focus, #66b3ff)' : '2px solid transparent',
                    background: '#333', cursor: (isDead && !isSkullMode) ? 'not-allowed' : 'pointer',
                    filter: isDead ? 'grayscale(100%) brightness(45%)' : (isDone ? 'brightness(0.8)' : 'none'),
                  }}
                >
                  <img src={`./icon/${icon}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  {isDone && (
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, background: 'var(--success, #10b981)', borderRadius: '50%', fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </BottomSheet>
  );
};
