import React from 'react';
import { useAppStore, ICON_FILES } from '../store';
import { PresetSelector } from './common/PresetSelector';

interface TopBarProps {
  selectedIcons: string[]; // 配列
  onIconSelect: (icon: string, isShift: boolean) => void; // Shift対応
}

export const TopBar: React.FC<TopBarProps> = ({ 
    selectedIcons, onIconSelect 
}) => {
  const { presets, activePresetId } = useAppStore();

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  const deadIcons = activePreset.deadIcons || [];
  const aliveIcons = ICON_FILES.filter(icon => !deadIcons.includes(icon));

  const createdChars = aliveIcons.filter(icon => activePreset.data && activePreset.data[icon]);
  const notCreatedChars = aliveIcons.filter(icon => !activePreset.data || !activePreset.data[icon]);

  const MiniIcon = ({ icon, isSelected }: { icon: string, isSelected: boolean }) => (
    <img 
        src={`./icon/${icon}`} 
        alt="char"
        // ▼▼▼ 修正: Shiftキー判定 ▼▼▼
        onClick={(e) => onIconSelect(icon, e.shiftKey)}
        style={{ 
            width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover',
            border: isSelected ? '2px solid rgba(255,255,255,0.75)' : '2px solid transparent',
            opacity: isSelected ? 1 : 0.7,
            cursor: 'pointer',
            transition: 'all 0.1s',
            // 複数選択時は少し大きくしたり枠を太くしたり
            transform: isSelected ? 'scale(1.1)' : 'scale(1)'
        }}
        title={icon}
    />
  );

  return (
    <div className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {createdChars.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#1e3a2f', padding: '2px 8px', borderRadius: '15px', border: '1px solid #10b981' }}>
                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>DONE</span>
                    {createdChars.map(icon => (
                        <MiniIcon key={icon} icon={icon} isSelected={selectedIcons.includes(icon)} />
                    ))}
                </div>
            )}
            {notCreatedChars.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#333', padding: '2px 8px', borderRadius: '15px', border: '1px solid #555' }}>
                    <span style={{ fontSize: '0.7rem', color: '#888' }}>TODO</span>
                    {notCreatedChars.map(icon => (
                        <MiniIcon key={icon} icon={icon} isSelected={selectedIcons.includes(icon)} />
                    ))}
                </div>
            )}
        </div>
      </div>

      <PresetSelector />
    </div>
  );
};