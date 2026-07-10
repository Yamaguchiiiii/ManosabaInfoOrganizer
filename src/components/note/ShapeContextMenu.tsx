import React from 'react';
import { NoteObject, NoteTargetType } from '../../store';
import { ExtendedNoteObjectType } from './noteConstants';

export interface ShapeContextMenuState {
    id: string;
    type: ExtendedNoteObjectType;
    x: number;
    y: number;
    stroke: string;
    strokeWidth: number;
    fill?: string;
    lineStyle?: string;
}

interface ShapeContextMenuProps {
    menu: ShapeContextMenuState;
    setMenu: React.Dispatch<React.SetStateAction<ShapeContextMenuState | null>>;
    targetType: NoteTargetType;
    displayTargetId: string;
    updateNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, attrs: Partial<NoteObject>, skipHistory?: boolean) => void;
    updateNoteObjects: (targetType: NoteTargetType, targetId: string, updates: { id: string, attrs: Partial<NoteObject> }[], skipHistory?: boolean) => void;
    commitThrottled: (fn: () => void) => void;
    saveHistoryOnceThenSkip: () => void;
    reorderNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, direction: 'front' | 'back' | 'up' | 'down') => void;
    selectedIds: string[];
}

// 図形の右クリックメニュー（線色/線幅/塗り/レイヤー/グループ化）。CanvasWorkspace の shapeContextMenu 用。
export const ShapeContextMenu: React.FC<ShapeContextMenuProps> = ({
    menu, setMenu, targetType, displayTargetId, updateNoteObject, updateNoteObjects,
    commitThrottled, saveHistoryOnceThenSkip, reorderNoteObject, selectedIds,
}) => (
    <div
        style={{
            position: 'fixed', top: menu.y, left: menu.x,
            background: '#2d2d2d', border: '1px solid #444', borderRadius: '8px',
            padding: '15px', zIndex: 1000, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', width: '200px'
        }}
        onClick={(e) => e.stopPropagation()}
    >
        {['line', 'arrow', 'curve', 'curve_arrow', 'freehand'].includes(menu.type) && (
            <>
                <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Style</div>
                <select
                    value={menu.lineStyle || 'normal'}
                    onChange={(e) => {
                        const val = e.target.value;
                        saveHistoryOnceThenSkip();
                        setMenu(prev => prev ? { ...prev, lineStyle: val } : null);
                        updateNoteObject(targetType, displayTargetId, menu.id, { lineStyle: val as 'normal' | 'marker' | 'pen' }, true);
                    }}
                    style={{ width: '100%', marginBottom: '10px', background: '#222', color: 'white', border: '1px solid #555', padding: '4px', borderRadius: '3px' }}
                >
                    <option value="normal">Normal</option>
                    <option value="marker">Marker</option>
                    <option value="pen">Pen</option>
                </select>
            </>
        )}

        <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Color</div>
        <input
            type="color"
            value={menu.stroke}
            onChange={(e) => {
                const val = e.target.value;
                const id = menu.id;
                saveHistoryOnceThenSkip();
                commitThrottled(() => {
                    setMenu(prev => prev ? { ...prev, stroke: val } : null);
                    updateNoteObject(targetType, displayTargetId, id, { stroke: val }, true);
                });
            }}
            style={{ width: '100%', marginBottom: '10px' }}
        />

        <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Width: {menu.strokeWidth}</div>
        <input
            type="range" min="0" max="20"
            value={menu.strokeWidth}
            onChange={(e) => {
                const val = parseInt(e.target.value);
                const id = menu.id;
                saveHistoryOnceThenSkip();
                commitThrottled(() => {
                    setMenu(prev => prev ? { ...prev, strokeWidth: val } : null);
                    updateNoteObject(targetType, displayTargetId, id, { strokeWidth: val }, true);
                });
            }}
            style={{ width: '100%', marginBottom: '10px' }}
        />

        {['rect', 'circle', 'triangle'].includes(menu.type) && (
            <>
                <div style={{ marginBottom: '5px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Fill Color</span>
                    <button
                        onClick={() => {
                            saveHistoryOnceThenSkip();
                            setMenu(prev => prev ? { ...prev, fill: 'transparent' } : null);
                            updateNoteObject(targetType, displayTargetId, menu.id, { fill: 'transparent' }, true);
                        }}
                        style={{ background: '#444', border: '1px solid #666', color: '#ccc', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        No Fill
                    </button>
                </div>
                <input
                    type="color"
                    value={menu.fill === 'transparent' ? '#ffffff' : (menu.fill || '#A8D5BA')}
                    onChange={(e) => {
                        const val = e.target.value;
                        const id = menu.id;
                        saveHistoryOnceThenSkip();
                        commitThrottled(() => {
                            setMenu(prev => prev ? { ...prev, fill: val } : null);
                            updateNoteObject(targetType, displayTargetId, id, { fill: val }, true);
                        });
                    }}
                    style={{ width: '100%' }}
                />
            </>
        )}

        <div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.85rem', marginBottom: '5px', color: '#aaa' }}>Layer</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {(['front', 'up', 'down', 'back'] as const).map((dir) => (
                    <button
                        key={dir}
                        onClick={() => { reorderNoteObject(targetType, displayTargetId, menu.id, dir); setMenu(null); }}
                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                    </button>
                ))}
            </div>
        </div>
        {selectedIds.length >= 2 && (
            <div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '5px', color: '#aaa' }}>Group</div>
                <button
                    onClick={() => {
                        const newGroupId = `group_${Date.now()}`;
                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                        setMenu(null);
                    }}
                    style={{ width: '100%', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                    グループ化
                </button>
            </div>
        )}
    </div>
);
