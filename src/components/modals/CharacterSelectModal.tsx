import React, { useState, useEffect } from 'react';
import { ICON_FILES } from '../../store';

interface CharacterSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (icon: string) => void;      // 単一選択時のコールバック
  onMultiSelect?: (icons: string[]) => void; // 複数選択時のコールバック
  isMultiSelect?: boolean;                // モード切替フラグ
}

export const CharacterSelectModal: React.FC<CharacterSelectModalProps> = ({
  isOpen, onClose, onSelect, onMultiSelect, isMultiSelect = false
}) => {
  const [selectedIcons, setSelectedIcons] = useState<string[]>([]);

  // モーダルが開くたびに選択状態をリセット
  useEffect(() => {
    if (isOpen) setSelectedIcons([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleIconClick = (icon: string) => {
    if (isMultiSelect) {
      // ▼▼▼ 複数選択モード: 配列に追加/削除 (トグル処理) ▼▼▼
      if (selectedIcons.includes(icon)) {
        setSelectedIcons(prev => prev.filter(i => i !== icon));
      } else {
        setSelectedIcons(prev => [...prev, icon]);
      }
    } else {
      // ▼▼▼ 単一選択モード: 即座に決定して閉じる ▼▼▼
      if (onSelect) onSelect(icon);
    }
  };

  const handleConfirm = () => {
    if (onMultiSelect) {
      onMultiSelect(selectedIcons);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '500px', maxWidth: '90vw' }}
      >
        <h3 style={{ color: 'var(--text-primary, #fff)', borderBottom: '1px solid var(--border-strong, #444)', paddingBottom: '10px', marginBottom: '20px' }}>
            {isMultiSelect ? "Select Characters (Batch Save)" : "Select Character"}
        </h3>
        
        <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', 
            gap: '15px',
            marginTop: '20px',
            maxHeight: '60vh',
            overflowY: 'auto',
            padding: '5px' // スクロールバーとの干渉防止
        }}>
          {ICON_FILES.map((icon) => {
            const isSelected = selectedIcons.includes(icon);
            return (
                <div 
                    key={icon}
                    onClick={() => handleIconClick(icon)}
                    style={{
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        // 選択時は青い枠線を表示
                        border: (isMultiSelect && isSelected) ? '3px solid #007acc' : '3px solid transparent',
                        boxShadow: (isMultiSelect && isSelected) ? '0 0 10px rgba(0, 122, 204, 0.5)' : 'none',
                        transition: 'all 0.1s',
                        aspectRatio: '1',
                        transform: (isMultiSelect && isSelected) ? 'scale(0.95)' : 'scale(1)',
                    }}
                >
                    <img 
                        src={`./icon/${icon}`} 
                        alt={icon} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                    
                    {/* 複数選択モード時のチェックマーク表示 */}
                    {isMultiSelect && isSelected && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            borderRadius: '50%',
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#007acc', fontWeight: 'bold', fontSize: '2rem',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                        }}>
                            ✓
                        </div>
                    )}
                </div>
            );
          })}
        </div>

        <div className="modal-actions" style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #ccc)'}}>
                {isMultiSelect ? `${selectedIcons.length} characters selected` : ""}
            </div>
            <div style={{ display: 'flex', gap: '10px'}}>
                <button
                    className="btn-cancel"
                    onClick={onClose}
                    style={{ background: 'transparent', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Cancel
                </button>
                {isMultiSelect && (
                    <button
                        className="btn-save"
                        onClick={handleConfirm}
                        disabled={selectedIcons.length === 0}
                        style={{
                            background: selectedIcons.length === 0 ? 'var(--surface-4, #444)' : '#007acc',
                            color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px',
                            cursor: selectedIcons.length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Confirm Selection
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};