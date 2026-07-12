import React from 'react';
import { NoteTargetType } from '../../store';
import { ExtendedNoteObjectType, FreehandSettings, PlacementMode } from './noteConstants';
import { AssetImg } from './NoteObjectComponents';
import { ColorSwatches } from './ColorSwatches';

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
    onAlignLeft: () => void;
    onAlignTop: () => void;
    onDistributeHorizontal: () => void;
    onDistributeVertical: () => void;
    onExportPng: () => void;
    onGatherOutside: () => void;
    portraitPalette: string[];
    assets: string[];
    targetType: NoteTargetType;
    characterPortraits: string[];
    onAssetContextMenu: (asset: string, x: number, y: number) => void;
    onUndo: () => void;
    onRedo: () => void;
}

// デスクトップ用の Tools サイドバー（画像/テキスト/図形配置・選択中オブジェクト操作・画像パレット）。
export const NoteToolsSidebar: React.FC<NoteToolsSidebarProps> = ({
    sidebarHeader, sidebarHeaderDivider, fileInputRef, onImageUpload,
    placementMode, onStartPlacement,
    freehandSettings, onFreehandSettingsChange,
    snapOn, onToggleSnap,
    selectedIds,
    onAlignLeft, onAlignTop, onDistributeHorizontal, onDistributeVertical,
    onExportPng, onGatherOutside,
    portraitPalette, assets, targetType, characterPortraits, onAssetContextMenu,
    onUndo, onRedo,
}) => (
    <div className="char-sidebar">
        {sidebarHeader && (
            <div className="sidebar-header" style={{ marginBottom: '10px', ...(sidebarHeaderDivider ? { paddingBottom: '10px', borderBottom: '1px solid var(--border-default, #333)' } : {}), display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sidebarHeader}
            </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Tools</h3>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {/* revise3 B-2: タッチ操作向けの取り消し/やり直しボタン（Ctrl+Z/Y のUI版） */}
                <button onClick={onUndo} title="元に戻す (Ctrl+Z)"
                    style={{ background: 'transparent', border: '1px solid var(--border-strong, #555)', borderRadius: '4px', color: '#888', padding: '3px 7px', cursor: 'pointer', fontSize: '0.85rem' }}
                >↩</button>
                <button onClick={onRedo} title="やり直し (Ctrl+Y)"
                    style={{ background: 'transparent', border: '1px solid var(--border-strong, #555)', borderRadius: '4px', color: '#888', padding: '3px 7px', cursor: 'pointer', fontSize: '0.85rem' }}
                >↪</button>
                <button
                    onClick={onToggleSnap}
                    title="グリッドスナップ（配置/移動を24px格子に吸着）"
                    style={{
                        background: snapOn ? 'rgba(102,179,255,0.2)' : 'transparent', border: '1px solid var(--border-strong, #555)',
                        borderRadius: '4px', color: snapOn ? '#66b3ff' : '#888', padding: '3px 7px', cursor: 'pointer', fontSize: '0.85rem',
                    }}
                >⌗</button>
            </div>
        </div>
        <div className="tool-buttons">
            <button onClick={() => fileInputRef.current?.click()}>Image</button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={onImageUpload} />
            <button className={placementMode?.type === 'text' ? 'active-tool' : ''} onClick={() => onStartPlacement('text')}>Text</button>

            {/* revise3 B-14: 記号のみだと初見で判別しにくいため、CompactToolbar と同じ日本語ラベルを併記 */}
            <div className="shapes-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <button className={placementMode?.type === 'freehand' ? 'active-tool' : ''} onClick={() => onStartPlacement('freehand')}>✏️ ペン</button>
                <button className={placementMode?.type === 'circle' ? 'active-tool' : ''} onClick={() => onStartPlacement('circle')}>○ 円</button>
                <button className={placementMode?.type === 'triangle' ? 'active-tool' : ''} onClick={() => onStartPlacement('triangle')}>△ 三角</button>
                <button className={placementMode?.type === 'rect' ? 'active-tool' : ''} onClick={() => onStartPlacement('rect')}>■ 四角</button>
                <button className={placementMode?.type === 'line' ? 'active-tool' : ''} onClick={() => onStartPlacement('line')}>─ 直線</button>
                <button className={placementMode?.type === 'arrow' ? 'active-tool' : ''} onClick={() => onStartPlacement('arrow')}>→ 矢印</button>
                <button className={placementMode?.type === 'curve' ? 'active-tool' : ''} onClick={() => onStartPlacement('curve')}>～ 曲線</button>
                <button className={placementMode?.type === 'curve_arrow' ? 'active-tool' : ''} onClick={() => onStartPlacement('curve_arrow')}>↷ 曲線矢印</button>
            </div>
            {placementMode?.type === 'freehand' && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Pen Settings</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', minWidth: '36px' }}>Color</span>
                        <input type="color" value={freehandSettings.color}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, color: e.target.value }))}
                            style={{ width: '28px', height: '24px', border: 'none', cursor: 'pointer', background: 'none' }} />
                        <ColorSwatches value={freehandSettings.color} onPick={c => onFreehandSettingsChange(s => ({ ...s, color: c }))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', minWidth: '36px' }}>Width</span>
                        <input type="range" min="1" max="20" value={freehandSettings.strokeWidth}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, strokeWidth: +e.target.value }))}
                            style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', minWidth: '16px' }}>{freehandSettings.strokeWidth}</span>
                    </div>
                    <select value={freehandSettings.lineStyle}
                        onChange={e => onFreehandSettingsChange(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                        style={{ background: '#222', color: 'var(--text-secondary, #ccc)', border: '1px solid var(--border-strong, #555)', borderRadius: '4px', padding: '3px 6px', fontSize: '0.8rem' }}>
                        <option value="pen">Pen</option>
                        <option value="marker">Marker</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', minWidth: '36px' }}>補正</span>
                        <input type="range" min="0" max="9" value={freehandSettings.stabilization}
                            onChange={e => onFreehandSettingsChange(s => ({ ...s, stabilization: +e.target.value }))}
                            style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', minWidth: '16px' }}>{freehandSettings.stabilization}</span>
                    </div>
                </div>
            )}
            {/* 選択中のオブジェクトに対する操作をひとまとめに（縦長で迷子になるのを防ぐ）。ui.md §5.3 */}
            {selectedIds.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-default, #333)', fontSize: '0.72rem', fontWeight: 'bold', color: '#888', letterSpacing: '0.04em' }}>
                    選択中（{selectedIds.length}）
                </div>
            )}
            {/* F5: 複数選択時の整列（線系は対象外・座標を持つ図形/画像/テキストのみ） */}
            {selectedIds.length >= 2 && (
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <button onClick={onAlignLeft} title="左揃え"
                        style={{ background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >⊢ 左揃え</button>
                    <button onClick={onAlignTop} title="上揃え"
                        style={{ background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >⊤ 上揃え</button>
                    <button onClick={onDistributeHorizontal} title="横に等間隔配置"
                        style={{ background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >↔ 横等間隔</button>
                    <button onClick={onDistributeVertical} title="縦に等間隔配置"
                        style={{ background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                    >↕ 縦等間隔</button>
                </div>
            )}
            <button
                onClick={onExportPng}
                title="このキャンバスをPNGで書き出す"
                style={{ marginTop: '6px', background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
            >
                📷 PNG書き出し
            </button>
            <button
                onClick={onGatherOutside}
                title="ビューポート外にあるオブジェクトを画面内へ回収する"
                style={{ marginTop: '6px', background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
            >
                🧲 画面外を回収
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
                        onAssetContextMenu(asset, e.clientX, e.clientY);
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
