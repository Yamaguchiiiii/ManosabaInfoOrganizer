import React, { useState } from 'react';
import { useAppStore } from '../../store';

export const PresetSelector: React.FC = () => {
  const {
    presets, activePresetId,
    setActivePresetId, addPreset, updatePresetName, deletePreset,
    showConfirm
  } = useAppStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  const handleRenameStart = () => {
    setEditName(activePreset.name);
    setIsEditing(true);
  };

  const handleRenameSave = () => {
    if (editName.trim()) {
      updatePresetName(activePresetId, editName);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (await showConfirm(`"${activePreset.name}" を削除してもよろしいですか？`)) {
      deletePreset(activePresetId);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '0.85rem', color: '#888' }}>Timeline:</span>
      
      {isEditing ? (
        <input 
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRenameSave}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') handleRenameSave(); }}
          style={{ 
            background: '#222', border: '1px solid #007acc', color: 'white', 
            padding: '4px 8px', borderRadius: '4px', outline: 'none', fontSize: '0.9rem'
          }}
        />
      ) : (
        <select 
          value={activePresetId} 
          onChange={(e) => {
              if (e.target.value === '__NEW__') {
                  addPreset();
              } else {
                  setActivePresetId(e.target.value);
              }
          }}
          style={{
              background: '#333',
              color: 'white',
              border: '1px solid #555',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none',
              minWidth: '100px'
          }}
        >
          {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option disabled>──────────</option>
          <option value="__NEW__">+ New Episode...</option>
        </select>
      )}

      {!isEditing && (
          <div style={{ display: 'flex', gap: '2px' }}>
              <button 
                  onClick={handleRenameStart}
                  title="Rename"
                  style={{
                      background: 'transparent', border: 'none', color: '#aaa', 
                      cursor: 'pointer', padding: '4px', fontSize: '1rem'
                  }}
              >
                  ✎
              </button>
              {presets.length > 1 && (
                  <button 
                      onClick={handleDelete}
                      title="Delete"
                      style={{
                          background: 'transparent', border: 'none', color: '#aaa', 
                          cursor: 'pointer', padding: '4px', fontSize: '1rem'
                      }}
                  >
                      🗑
                  </button>
              )}
          </div>
      )}
    </div>
  );
};