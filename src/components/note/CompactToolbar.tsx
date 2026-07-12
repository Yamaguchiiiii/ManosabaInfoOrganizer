import React from 'react';
import { ExtendedNoteObjectType, FreehandSettings, PlacementMode } from './noteConstants';
import { ColorSwatches } from './ColorSwatches';

interface CompactToolbarProps {
    onUploadClick: () => void;
    showImageGallery: boolean;
    onToggleImageGallery: () => void;
    placementMode: PlacementMode;
    onStartPlacement: (type: ExtendedNoteObjectType) => void;
    onPaste: () => void;
    clipboardEmpty: boolean;
    onExportPng: () => void;
    freehandSettings: FreehandSettings;
    onFreehandSettingsChange: (updater: (s: FreehandSettings) => FreehandSettings) => void;
    toolTextBtnStyle: (isActive: boolean, disabled?: boolean) => React.CSSProperties;
    onUndo: () => void;
    onRedo: () => void;
    // revise3 B-18: モバイルビューポートでは下部の横スクロール列に並べるため横並びにする
    orientation?: 'vertical' | 'horizontal';
}

// Canvas操作ツールバー: Animateセルの左余白にドック（縦並び・幅はレスポンシブ）。compactMode専用。
// 0711 #4: 選択中オブジェクト操作(コピー/切り取り/削除/Layer/Group/縦横比)は上部の
// SelectionContextBar(ContextBar統合)へ移動した。貼り付けは選択が無くても使うためここに残す。
export const CompactToolbar: React.FC<CompactToolbarProps> = ({
    onUploadClick, showImageGallery, onToggleImageGallery,
    placementMode, onStartPlacement,
    onPaste, clipboardEmpty, onExportPng,
    freehandSettings, onFreehandSettingsChange,
    toolTextBtnStyle, onUndo, onRedo,
    orientation = 'vertical',
}) => {
    const horizontal = orientation === 'horizontal';
    // revise3 B-18: 横並び時は toolTextBtnStyle の width:100% を打ち消し、幅は内容ぶんだけにする
    const btnStyle = (isActive: boolean, disabled?: boolean): React.CSSProperties => horizontal
        ? { ...toolTextBtnStyle(isActive, disabled), width: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }
        : toolTextBtnStyle(isActive, disabled);
    return (
    <div
        style={{
            width: horizontal ? 'auto' : '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: horizontal ? 'row' : 'column',
            gap: '4px',
            backgroundColor: 'transparent',
            padding: '5px 4px',
            alignItems: horizontal ? 'center' : 'stretch',
        }}
    >
        <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap: '4px', alignItems: horizontal ? 'center' : 'stretch', flexShrink: 0 }}>
            {/* revise3 B-2: スマホには Ctrl+Z が無いため、誤操作を取り消す手段としてボタンを常設 */}
            <div style={{ display: 'flex', gap: '4px' }}>
                <button title="元に戻す (Ctrl+Z)" onClick={onUndo} style={horizontal ? btnStyle(false) : { ...btnStyle(false), width: '50%' }}>↩</button>
                <button title="やり直し (Ctrl+Y)" onClick={onRedo} style={horizontal ? btnStyle(false) : { ...btnStyle(false), width: '50%' }}>↪</button>
            </div>
            <button title="画像をアップロードして配置" onClick={onUploadClick} style={btnStyle(false)}>画像</button>
            <button title="登録画像から配置" onClick={onToggleImageGallery} style={btnStyle(showImageGallery)}>画像一覧</button>
            <button title="テキスト" onClick={() => onStartPlacement('text')} style={btnStyle(placementMode?.type === 'text')}>テキスト</button>
            <button title="フリーハンド" onClick={() => onStartPlacement('freehand')} style={btnStyle(placementMode?.type === 'freehand')}>ペン</button>
            <div style={horizontal ? { width: '1px', alignSelf: 'stretch', backgroundColor: 'var(--border-strong, #555)', margin: '0 2px' } : { height: '1px', backgroundColor: 'var(--border-strong, #555)', margin: '2px 0' }} />
            <button title="円" onClick={() => onStartPlacement('circle')} style={btnStyle(placementMode?.type === 'circle')}>○ 円</button>
            <button title="三角" onClick={() => onStartPlacement('triangle')} style={btnStyle(placementMode?.type === 'triangle')}>△ 三角</button>
            <button title="四角" onClick={() => onStartPlacement('rect')} style={btnStyle(placementMode?.type === 'rect')}>□ 四角</button>
            <button title="直線" onClick={() => onStartPlacement('line')} style={btnStyle(placementMode?.type === 'line')}>─ 直線</button>
            <button title="矢印" onClick={() => onStartPlacement('arrow')} style={btnStyle(placementMode?.type === 'arrow')}>→ 矢印</button>
            <button title="曲線" onClick={() => onStartPlacement('curve')} style={btnStyle(placementMode?.type === 'curve')}>～ 曲線</button>
            <button title="曲線矢印" onClick={() => onStartPlacement('curve_arrow')} style={btnStyle(placementMode?.type === 'curve_arrow')}>↷ 曲線矢印</button>
            <div style={horizontal ? { width: '1px', alignSelf: 'stretch', backgroundColor: 'var(--border-strong, #555)', margin: '0 2px' } : { height: '1px', backgroundColor: 'var(--border-strong, #555)', margin: '2px 0' }} />
            <button
                title="貼り付け (Ctrl+V)"
                onClick={onPaste}
                disabled={clipboardEmpty}
                style={btnStyle(false, clipboardEmpty)}
            >
                貼り付け
            </button>
            <button title="このキャンバスをPNGで書き出す" onClick={onExportPng} style={btnStyle(false)}>📷 PNG</button>
        </div>
        {placementMode?.type === 'freehand' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: horizontal ? 'none' : '1px solid var(--border-default, #444)', borderLeft: horizontal ? '1px solid var(--border-default, #444)' : 'none', marginTop: horizontal ? 0 : '4px', marginLeft: horizontal ? '4px' : 0, paddingTop: horizontal ? 0 : '6px', paddingLeft: horizontal ? '8px' : 0, flexWrap: horizontal ? 'nowrap' : 'wrap', flexShrink: 0 }}>
                <input type="color" value={freehandSettings.color} title="Stroke Color"
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, color: e.target.value }))}
                    style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
                <ColorSwatches value={freehandSettings.color} onPick={c => onFreehandSettingsChange(s => ({ ...s, color: c }))} />
                <input type="range" min="1" max="20" value={freehandSettings.strokeWidth} title={`Width: ${freehandSettings.strokeWidth}`}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, strokeWidth: +e.target.value }))}
                    style={{ width: '70px' }} />
                <select value={freehandSettings.lineStyle}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                    style={{ background: 'var(--surface-3, #333)', color: 'var(--text-secondary, #ccc)', border: '1px solid var(--border-strong, #555)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.8rem' }}>
                    <option value="pen">Pen</option>
                    <option value="marker">Marker</option>
                </select>
                <input type="range" min="0" max="5" value={freehandSettings.stabilization}
                    title={`補正: ${freehandSettings.stabilization}`}
                    onChange={e => onFreehandSettingsChange(s => ({ ...s, stabilization: +e.target.value }))}
                    style={{ width: '70px' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #ccc)', minWidth: '14px' }}>{freehandSettings.stabilization}</span>
            </div>
        )}
    </div>
    );
};
