import React from 'react';
import { NoteObject, NoteTargetType } from '../../store';
import { ExtendedNoteObjectType, FreehandSettings, PlacementMode } from './noteConstants';
import { AssetImg } from './NoteObjectComponents';

interface NoteToolsSidebarProps {
    sidebarHeader?: React.ReactNode;
    sidebarHeaderDivider: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placementMode: PlacementMode;
    onStartPlacement: (type: ExtendedNoteObjectType, data?: string) => void;
    freehandSettings: FreehandSettings;
    onFreehandSettingsChange: (updater: (s: FreehandSettings) => FreehandSettings) => void;
    snapOn: boolean;
    onToggleSnap: () => void;
    selectedIds: string[];
    selectedObject: NoteObject | undefined;
    onToggleKeepRatio: (checked: boolean) => void;
    onReorder: (dir: 'front' | 'up' | 'down' | 'back') => void;
    selectedGroupId: string | null;
    onGroup: () => void;
    onUngroup: () => void;
    onAlignLeft: () => void;
    onAlignTop: () => void;
    onDistributeHorizontal: () => void;
    onDistributeVertical: () => void;
    onDeleteSelected: () => void;
    onExportPng: () => void;
    portraitPalette: string[];
    assets: string[];
    targetType: NoteTargetType;
    characterPortraits: string[];
    onAssetContextMenu: (index: number, x: number, y: number) => void;
}

// デスクトップ用の Tools サイドバー（画像/テキスト/図形配置・選択中オブジェクト操作・画像パレット）。
export const NoteToolsSidebar: React.FC<NoteToolsSidebarProps> = ({
    sidebarHeader, sidebarHeaderDivider, fileInputRef, onImageUpload,
    placementMode, onStartPlacement,
    freehandSettings, onFreehandSettingsChange,
    snapOn, onToggleSnap,
    selectedIds, selectedObject, onToggleKeepRatio, onReorder,
    selectedGroupId, onGroup, onUngroup,
    onAlignLeft, onAlignTop, onDistributeHorizontal, onDistributeVertical,
    onDeleteSelected, onExportPng,
    portraitPalette, assets, targetType, characterPortraits, onAssetContextMenu,
}) => (
    <div className="char-sidebar">
        {sidebarHeader && (
            <div className="sidebar-header" style={{ marginBottom: '10px', ...(sidebarHeaderDivider ? { paddingBottom: '10px', borderBottom: '1px solid #333' } : {}), display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sidebarHeader}
            </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Tools</h3>
            <button
                onClick={onToggleSnap}
                title="グリッドスナップ（配置/移動を24px格子に吸着）"
                style={{
                    background: snapOn ? 'rgba(102,179,255,0.2)' : 'transparent', border: '1px solid #555',
                    borderRadius: '4px', color: snapOn ? '#66b3ff' : '#888', padding: '3px 7px', cursor: 'pointer', fontSize: '0.85rem',
                }}
            >⌗</button>
        </div>
        <div className="tool-buttons">
            <button onClick={() => fileInputRef.current?.click()}>Image</button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={onImageUpload} />
            <button className={placementMode?.type === 'text' ? 'active-tool' : ''} onClick={() => onStartPlacement('text')}>Text</button>

            <div className="shapes-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <button className={placementMode?.type === 'freehand' ? 'active-tool' : ''} onClick={() => onStartPlacement('freehand')}>✏️</button>
                <button className={placementMode?.type === 'circle' ? 'active-tool' : ''} onClick={() => onStartPlacement('circle')}>○</button>
                <button className={placementMode?.type === 'triangle' ? 'active-tool' : ''} onClick={() => onStartPlacement('triangle')}>△</button>
                <button className={placementMode?.type === 'rect' ? 'active-tool' : ''} onClick={() => onStartPlacement('rect')}>■</button>
                <button className={placementMode?.type === 'line' ? 'active-tool' : ''} onClick={() => onStartPlacement('line')}>─</button>
                <button className={placementMode?.type === 'arrow' ? 'active-tool' : ''} onClick={() => onStartPlacement('arrow')}>→</button>
                <button className={placementMode?.type === 'curve' ? 'active-tool' : ''} onClick={() => onStartPlacement('curve')}>~</button>
                <button className={placementMode?.type === 'curve_arrow' ? 'active-tool' : ''} onClick={() => onStartPlacement('curve_arrow')}>↷</button>
            </div>
            {placementMode?.type === 'freehand' && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Pen Settings</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>Color</span>
                        <input type="color" value={freehandSettings.color}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, color: e.target.value }))}
                            style={{ width: '28px', height: '24px', border: 'none', cursor: 'pointer', background: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>Width</span>
                        <input type="range" min="1" max="20" value={freehandSettings.strokeWidth}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, strokeWidth: +e.target.value }))}
                            style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '16px' }}>{freehandSettings.strokeWidth}</span>
                    </div>
                    <select value={freehandSettings.lineStyle}
                        onChange={e => onFreehandSettingsChange(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                        style={{ background: '#222', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '3px 6px', fontSize: '0.8rem' }}>
                        <option value="pen">Pen</option>
                        <option value="marker">Marker</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>補正</span>
                        <input type="range" min="0" max="9" value={freehandSettings.stabilization}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, stabilization: +e.target.value }))}
                            style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '16px' }}>{freehandSettings.stabilization}</span>
                    </div>
                </div>
            )}
            {/* 選択中のオブジェクトに対する操作をひとまとめに（縦長で迷子になるのを防ぐ）。ui.md §5.3 */}
            {selectedIds.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #333', fontSize: '0.72rem', fontWeight: 'bold', color: '#888', letterSpacing: '0.04em' }}>
                    選択中（{selectedIds.length}）
                </div>
            )}
            {/* F5: 複数選択時の整列（線系は対象外・座標を持つ図形/画像/テキストのみ） */}
            {selectedIds.length >= 2 && (
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <button onClick={onAlignLeft} title="左揃え"
                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >⊢ 左揃え</button>
                    <button onClick={onAlignTop} title="上揃え"
                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >⊤ 上揃え</button>
                    <button onClick={onDistributeHorizontal} title="横に等間隔配置"
                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >↔ 横等間隔</button>
                    <button onClick={onDistributeVertical} title="縦に等間隔配置"
                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >↕ 縦等間隔</button>
                </div>
            )}
            {selectedIds.length === 1 && selectedObject?.type === 'image' && (
                <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#ccc' }}>
                        <input
                            type="checkbox"
                            checked={selectedObject.keepRatio ?? true}
                            onChange={(e) => onToggleKeepRatio(e.target.checked)}
                        />
                        アスペクト比を維持
                    </label>
                </div>
            )}
            {selectedIds.length === 1 && selectedObject && (
                <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Layer</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        {(['front', 'up', 'down', 'back'] as const).map(dir => (
                            <button key={dir}
                                onClick={() => onReorder(dir)}
                                style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {selectedIds.length >= 2 && (
                <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Group</div>
                    <button
                        onClick={onGroup}
                        style={{ width: '100%', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        グループ化 (Ctrl+G)
                    </button>
                    {selectedGroupId && (
                        <button
                            onClick={onUngroup}
                            style={{ width: '100%', marginTop: '4px', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                            グループ解除 (Ctrl+Shift+G)
                        </button>
                    )}
                </div>
            )}
            <button
                onClick={onDeleteSelected}
                disabled={selectedIds.length === 0}
                style={{ marginTop: '10px', background: selectedIds.length === 0 ? 'var(--surface-4, #444)' : 'var(--danger, #ef4444)', color: selectedIds.length === 0 ? '#888' : 'white', fontSize: '1rem', padding: '5px' }}
            >
                Delete Selected
            </button>
            <button
                onClick={onExportPng}
                title="このキャンバスをPNGで書き出す"
                style={{ marginTop: '6px', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
            >
                📷 PNG書き出し
            </button>
        </div>
        <h3>Images</h3>
        <div className="char-thumbnails">
            {/* 事件ノートでは全キャラの立ち絵をImagesに常時表示（クリックで配置） */}
            {portraitPalette.map((src, idx) => (
                <div
                    key={`portrait-${idx}`}
                    className={`thumb ${placementMode?.data === src ? 'active' : ''}`}
                    onClick={() => onStartPlacement('image', src)}
                >
                    <img src={src} alt={`portrait-${idx}`} />
                </div>
            ))}
            {assets.map((asset, idx) => (
                <div
                    key={idx}
                    className={`thumb ${placementMode?.data === asset ? 'active' : ''}`}
                    onClick={() => onStartPlacement('image', asset)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onAssetContextMenu(idx, e.clientX, e.clientY);
                    }}
                >
                    <AssetImg src={asset} alt={`asset-${idx}`} />
                </div>
            ))}
            {/* ToolsのImageで追加した画像(assets)はここに入る。空なら明示する。#06/28-3:58-2 */}
            {portraitPalette.length === 0 && assets.length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: '#666', fontSize: '0.8rem', textAlign: 'center', padding: '8px' }}>Empty</div>
            )}
        </div>

        {/* preset以外(全体/キャラ/メモ)はデフォルトで全キャラの立ち絵をCharacter Imagesに表示。#06/28-3:58-2 */}
        {targetType !== 'preset' && (
            <>
                <h3>Character Images</h3>
                <div className="char-thumbnails">
                    {characterPortraits.map((src, idx) => (
                        <div
                            key={`charimg-${idx}`}
                            className={`thumb ${placementMode?.data === src ? 'active' : ''}`}
                            onClick={() => onStartPlacement('image', src)}
                        >
                            <img src={src} alt={`charimg-${idx}`} />
                        </div>
                    ))}
                </div>
            </>
        )}
    </div>
);
