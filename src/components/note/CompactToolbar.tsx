import React from 'react';
import { NoteObject } from '../../store';
import { ExtendedNoteObjectType, FreehandSettings, PlacementMode } from './noteConstants';

interface CompactToolbarProps {
    onUploadClick: () => void;
    showImageGallery: boolean;
    onToggleImageGallery: () => void;
    placementMode: PlacementMode;
    onStartPlacement: (type: ExtendedNoteObjectType) => void;
    selectedIds: string[];
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    clipboardEmpty: boolean;
    onDelete: () => void;
    onExportPng: () => void;
    freehandSettings: FreehandSettings;
    onFreehandSettingsChange: (updater: (s: FreehandSettings) => FreehandSettings) => void;
    selectedObject: NoteObject | undefined;
    onToggleKeepRatio: (checked: boolean) => void;
    onReorder: (dir: 'front' | 'up' | 'down' | 'back') => void;
    selectedGroupId: string | null;
    onGroup: () => void;
    onUngroup: () => void;
    toolBtnStyle: (isActive: boolean) => React.CSSProperties;
    toolTextBtnStyle: (isActive: boolean, disabled?: boolean) => React.CSSProperties;
}

// Canvas操作ツールバー: Animateセルの左余白にドック（縦並び・幅はレスポンシブ）。compactMode専用。
export const CompactToolbar: React.FC<CompactToolbarProps> = ({
    onUploadClick, showImageGallery, onToggleImageGallery,
    placementMode, onStartPlacement,
    selectedIds, onCopy, onCut, onPaste, clipboardEmpty, onDelete, onExportPng,
    freehandSettings, onFreehandSettingsChange,
    selectedObject, onToggleKeepRatio, onReorder,
    selectedGroupId, onGroup, onUngroup,
    toolBtnStyle, toolTextBtnStyle,
}) => (
    <div
        style={{
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            backgroundColor: 'transparent',
            padding: '5px 4px'
        }}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
            <button title="画像をアップロードして配置" onClick={onUploadClick} style={toolTextBtnStyle(false)}>画像</button>
            <button title="登録画像から配置" onClick={onToggleImageGallery} style={toolTextBtnStyle(showImageGallery)}>画像一覧</button>
            <button title="テキスト" onClick={() => onStartPlacement('text')} style={toolTextBtnStyle(placementMode?.type === 'text')}>テキスト</button>
            <button title="フリーハンド" onClick={() => onStartPlacement('freehand')} style={toolTextBtnStyle(placementMode?.type === 'freehand')}>ペン</button>
            <div style={{ height: '1px', backgroundColor: '#555', margin: '2px 0' }} />
            <button title="円" onClick={() => onStartPlacement('circle')} style={toolTextBtnStyle(placementMode?.type === 'circle')}>○ 円</button>
            <button title="三角" onClick={() => onStartPlacement('triangle')} style={toolTextBtnStyle(placementMode?.type === 'triangle')}>△ 三角</button>
            <button title="四角" onClick={() => onStartPlacement('rect')} style={toolTextBtnStyle(placementMode?.type === 'rect')}>□ 四角</button>
            <button title="直線" onClick={() => onStartPlacement('line')} style={toolTextBtnStyle(placementMode?.type === 'line')}>─ 直線</button>
            <button title="矢印" onClick={() => onStartPlacement('arrow')} style={toolTextBtnStyle(placementMode?.type === 'arrow')}>→ 矢印</button>
            <button title="曲線" onClick={() => onStartPlacement('curve')} style={toolTextBtnStyle(placementMode?.type === 'curve')}>～ 曲線</button>
            <button title="曲線矢印" onClick={() => onStartPlacement('curve_arrow')} style={toolTextBtnStyle(placementMode?.type === 'curve_arrow')}>↷ 曲線矢印</button>
            <div style={{ height: '1px', backgroundColor: '#555', margin: '2px 0' }} />
            <button
                title="コピー (Ctrl+C)"
                onClick={onCopy}
                disabled={selectedIds.length === 0}
                style={toolTextBtnStyle(false, selectedIds.length === 0)}
            >
                コピー
            </button>
            <button
                title="切り取り (Ctrl+X)"
                onClick={onCut}
                disabled={selectedIds.length === 0}
                style={toolTextBtnStyle(false, selectedIds.length === 0)}
            >
                切り取り
            </button>
            <button
                title="貼り付け (Ctrl+V)"
                onClick={onPaste}
                disabled={clipboardEmpty}
                style={toolTextBtnStyle(false, clipboardEmpty)}
            >
                貼り付け
            </button>
            <button
                title="削除"
                onClick={onDelete}
                disabled={selectedIds.length === 0}
                style={{ ...toolTextBtnStyle(false, selectedIds.length === 0), color: selectedIds.length === 0 ? '#666' : '#ef4444' }}
            >
                削除
            </button>
            <button title="このキャンバスをPNGで書き出す" onClick={onExportPng} style={toolTextBtnStyle(false)}>📷 PNG</button>
        </div>
        {placementMode?.type === 'freehand' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                <input type="color" value={freehandSettings.color} title="Stroke Color"
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, color: e.target.value }))}
                    style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
                <input type="range" min="1" max="20" value={freehandSettings.strokeWidth} title={`Width: ${freehandSettings.strokeWidth}`}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, strokeWidth: +e.target.value }))}
                    style={{ width: '70px' }} />
                <select value={freehandSettings.lineStyle}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                    style={{ background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '2px 4px', fontSize: '0.8rem' }}>
                    <option value="pen">Pen</option>
                    <option value="marker">Marker</option>
                </select>
                <input type="range" min="0" max="5" value={freehandSettings.stabilization}
                    title={`補正: ${freehandSettings.stabilization}`}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, stabilization: +e.target.value }))}
                    style={{ width: '70px' }} />
                <span style={{ fontSize: '0.75rem', color: '#ccc', minWidth: '14px' }}>{freehandSettings.stabilization}</span>
            </div>
        )}
        {selectedIds.length === 1 && selectedObject?.type === 'image' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#ccc' }}>
                    <input
                        type="checkbox"
                        checked={selectedObject.keepRatio ?? true}
                        onChange={(e) => onToggleKeepRatio(e.target.checked)}
                    />
                    縦横比固定
                </label>
            </div>
        )}
        {selectedIds.length === 1 && selectedObject && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: '2px' }}>Layer:</span>
                {(['front', 'up', 'down', 'back'] as const).map(dir => (
                    <button key={dir}
                        onClick={() => onReorder(dir)}
                        style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                    >
                        {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                    </button>
                ))}
            </div>
        )}
        {selectedIds.length >= 2 && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: '2px' }}>Group:</span>
                <button
                    onClick={onGroup}
                    style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                >
                    グループ化
                </button>
                {selectedGroupId && (
                    <button
                        onClick={onUngroup}
                        style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                    >
                        グループ解除
                    </button>
                )}
            </div>
        )}
    </div>
);
