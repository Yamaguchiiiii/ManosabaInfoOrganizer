import React, { useState, useEffect } from 'react';
import { FloorId, MapNode } from '../../store';

interface NodeEditModalProps {
  isOpen: boolean;
  initialType: MapNode['type'];
  initialFloor?: FloorId;
  initialName?: string; // 名称を受け取る
  onClose: () => void;
  onSave: (type: MapNode['type'], floor?: FloorId, name?: string) => void; // 名称を渡す定義
  onDelete: () => void;
}

export const NodeEditModal: React.FC<NodeEditModalProps> = ({ 
    isOpen, initialType, initialFloor, initialName, onClose, onSave, onDelete 
}) => {
  const [type, setType] = useState<MapNode['type']>(initialType);
  const [floor, setFloor] = useState<FloorId | undefined>(initialFloor);
  const [name, setName] = useState<string>(initialName || '');

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setFloor(initialFloor);
      setName(initialName || ''); // 初期値をセット
    }
  }, [isOpen, initialType, initialFloor, initialName]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#333', padding: '20px', borderRadius: '8px', width: '300px', color: 'white' }}>
        <h3>Edit Node</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Type:</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} style={{ width: '100%', padding: '5px' }}>
            <option value="pass">Pass (通路)</option>
            <option value="room">Room (部屋)</option>
            <option value="stair">Stair (階段)</option>
          </select>
        </div>

        {/* 名称入力欄 */}
        <div style={{ marginBottom: '15px' }}>
             <label style={{ display: 'block', marginBottom: '5px' }}>Name (Optional):</label>
             <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 食堂, 独房A..."
                style={{ width: '100%', padding: '5px', boxSizing: 'border-box' }}
             />
        </div>

        {type === 'stair' && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Connected Floor:</label>
            <select value={floor || ''} onChange={(e) => setFloor(e.target.value as FloorId)} style={{ width: '100%', padding: '5px' }}>
              <option value="">Select Floor...</option>
              <option value="2F">2F</option>
              <option value="1F">1F</option>
              <option value="B1">B1</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onDelete} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
          <button onClick={onClose} style={{ background: '#666', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
          {/* ▼▼▼ 修正: ここで name を第3引数として渡す必要があります ▼▼▼ */}
          <button onClick={() => onSave(type, floor, name)} style={{ background: '#007acc', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
};