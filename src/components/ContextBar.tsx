import React from 'react';
import { useAppStore, ICON_FILES } from '../store';
import { PresetSelector } from './common/PresetSelector';
import { SaveStatusIndicator } from './common/SaveStatusIndicator';
import { NoteSearchBox } from './common/NoteSearchBox';

const NOTE_TAB_LABELS: Record<string, string> = {
  overview: '全体ノート', preset: '事件ノート', character: 'キャラクターノート', misc: 'メモ',
};

// 全ビュー共通の上部バー（ui.md P2, 旧 TopBar を吸収）。
// 左=パネル開閉+ビュー名パンくず、中央=Createのキャラ進捗チップ+プリセット、右=保存状態。
export const ContextBar: React.FC = () => {
  const mode = useAppStore(s => s.mode);
  const activeNoteTab = useAppStore(s => s.activeNoteTab);
  const collapsed = useAppStore(s => s.contextPanelCollapsed);
  const setCollapsed = useAppStore(s => s.setContextPanelCollapsed);
  const presets = useAppStore(s => s.presets);
  const activePresetId = useAppStore(s => s.activePresetId);
  const selectedIcons = useAppStore(s => s.selectedIcons);
  const selectIcon = useAppStore(s => s.selectIcon);
  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  const breadcrumb = mode === 'create' ? 'Create'
    : mode === 'animate' ? 'Animate'
    : `Note ▸ ${NOTE_TAB_LABELS[activeNoteTab] ?? ''}`;

  const deadIcons = activePreset.deadIcons || [];
  const aliveIcons = ICON_FILES.filter(icon => !deadIcons.includes(icon));
  const createdChars = aliveIcons.filter(icon => activePreset.data && activePreset.data[icon]);
  const notCreatedChars = aliveIcons.filter(icon => !activePreset.data || !activePreset.data[icon]);

  const MiniIcon = ({ icon, isSelected }: { icon: string; isSelected: boolean }) => (
    <img
      src={`./icon/${icon}`}
      alt="char"
      onClick={(e) => void selectIcon(icon, e.shiftKey)}
      style={{
        width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover',
        border: isSelected ? '2px solid var(--text-primary)' : '2px solid transparent',
        opacity: isSelected ? 1 : 0.7, cursor: 'pointer', transition: 'all 0.1s',
        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
      }}
      title={icon}
    />
  );

  return (
    <div className="context-bar">
      <div className="context-bar-left">
        {collapsed && (
          <button className="expand-btn" title="パネルを開く" onClick={() => setCollapsed(false)}>▶</button>
        )}
        <span className="context-bar-title">{breadcrumb}</span>
      </div>

      {/* 0711 #4: Note の選択中オブジェクト操作バーの portal 先。選択が無い間は空で高さに影響しない。
          Create は progress-chip(context-bar-center)と共存できないため描画しない。 */}
      {mode !== 'create' && <div id="context-bar-selection-slot" className="context-bar-selection" />}

      {mode === 'create' && (
        <div className="context-bar-center">
          {createdChars.length > 0 && (
            <div className="progress-chip done">
              <span className="chip-label">DONE</span>
              {createdChars.map(icon => <MiniIcon key={icon} icon={icon} isSelected={selectedIcons.includes(icon)} />)}
            </div>
          )}
          {notCreatedChars.length > 0 && (
            <div className="progress-chip todo">
              <span className="chip-label">TODO</span>
              {notCreatedChars.map(icon => <MiniIcon key={icon} icon={icon} isSelected={selectedIcons.includes(icon)} />)}
            </div>
          )}
          <PresetSelector />
        </div>
      )}

      <div className="context-bar-right">
        <NoteSearchBox />
        <SaveStatusIndicator />
      </div>
    </div>
  );
};
