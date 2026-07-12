import React from 'react';
import { ColorSwatches } from './ColorSwatches';

interface SelectionContextBarProps {
    count: number;
    // null は「選択中に色/線幅を持つオブジェクトが無い」（image のみ選択など）＝コントロール非表示
    colorValue: string | null;
    onColorChange: (v: string) => void;
    widthValue: number | null;
    onWidthChange: (v: number) => void;
    canReorder: boolean;
    onReorderBack: () => void;
    onReorderFront: () => void;
    canGroup: boolean;
    onGroup: () => void;
    canUngroup: boolean;
    onUngroup: () => void;
    onDelete: () => void;
    // 0711 #4 追加
    keepRatioVisible: boolean;            // 単独選択の image のみ true
    keepRatioChecked: boolean;
    onToggleKeepRatio: (v: boolean) => void;
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    pasteEnabled: boolean;
    variant: 'topbar' | 'overlay';        // topbar=ContextBar内 / overlay=compactのCanvas上端
}

const dividerStyle: React.CSSProperties = { width: 1, alignSelf: 'stretch', margin: '7px 2px', background: 'var(--border-default, #444)', flexShrink: 0 };
const segBtnStyle: React.CSSProperties = {
    background: 'var(--surface-4, #3a3a3a)', border: '1px solid var(--border-strong, #555)', color: 'var(--text-secondary, #ccc)', borderRadius: '4px',
    cursor: 'pointer', fontSize: '0.78rem', padding: '5px 10px', minHeight: 28, whiteSpace: 'nowrap', flexShrink: 0,
};

// U3: キャンバス上端の選択中オブジェクト操作バー（右クリックメニューと同じハンドラを共有し、
// 右クリックなしで色/線幅/レイヤー/グループ化/削除を完結させる）。選択が無いときは親側で非表示にする。
export const SelectionContextBar: React.FC<SelectionContextBarProps> = ({
    count, colorValue, onColorChange, widthValue, onWidthChange,
    canReorder, onReorderBack, onReorderFront, canGroup, onGroup, canUngroup, onUngroup, onDelete,
    keepRatioVisible, keepRatioChecked, onToggleKeepRatio, onCopy, onCut, onPaste, pasteEnabled, variant,
}) => (
    <div style={variant === 'topbar' ? {
        height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
        padding: '0 4px', background: 'transparent', borderBottom: 'none',
        fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', overflowX: 'auto', boxSizing: 'border-box',
    } : {
        height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
        padding: '0 10px', background: 'var(--surface-2, rgba(30,30,30,0.95))', borderBottom: '1px solid var(--border-default, #444)',
        fontSize: '0.8rem', color: 'var(--text-secondary, #ccc)', overflowX: 'auto', boxSizing: 'border-box',
    }}>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary, #aaa)', flexShrink: 0 }}>{count}個選択</span>

        {colorValue !== null && (
            <>
                <div style={dividerStyle} />
                <input
                    type="color"
                    value={colorValue}
                    onChange={e => onColorChange(e.target.value)}
                    title="色"
                    style={{ width: 26, height: 24, border: 'none', cursor: 'pointer', background: 'none', padding: 0, flexShrink: 0 }}
                />
                {/* revise3 B-13: 定番色への即時切替（undo は onColorChange と同じ経路なので1回で戻る） */}
                <ColorSwatches value={colorValue} onPick={onColorChange} />
            </>
        )}

        {widthValue !== null && (
            <>
                <div style={dividerStyle} />
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>線幅</span>
                <input
                    type="range" min="0" max="20"
                    value={widthValue}
                    onChange={e => onWidthChange(parseInt(e.target.value, 10))}
                    style={{ width: 70, flexShrink: 0 }}
                />
                <span style={{ minWidth: 16, textAlign: 'right', flexShrink: 0 }}>{widthValue}</span>
            </>
        )}

        {canReorder && (
            <>
                <div style={dividerStyle} />
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>レイヤー</span>
                <button onClick={onReorderBack} title="後ろへ" style={segBtnStyle}>◀</button>
                <button onClick={onReorderFront} title="前へ" style={segBtnStyle}>▶</button>
            </>
        )}

        {(canGroup || canUngroup) && (
            <>
                <div style={dividerStyle} />
                {canGroup && <button onClick={onGroup} style={segBtnStyle}>グループ化</button>}
                {canUngroup && <button onClick={onUngroup} style={segBtnStyle}>解除</button>}
            </>
        )}

        {keepRatioVisible && (
            <>
                <div style={dividerStyle} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={keepRatioChecked} onChange={e => onToggleKeepRatio(e.target.checked)} />
                    比率維持
                </label>
            </>
        )}
        <div style={dividerStyle} />
        <button onClick={onCopy} style={segBtnStyle} title="コピー (Ctrl+C)">⧉</button>
        <button onClick={onCut} style={segBtnStyle} title="切り取り (Ctrl+X)">✂</button>
        <button onClick={onPaste} disabled={!pasteEnabled} style={{ ...segBtnStyle, opacity: pasteEnabled ? 1 : 0.4 }} title="貼り付け (Ctrl+V)">⎘</button>

        <div style={dividerStyle} />
        <button
            onClick={onDelete}
            title="削除"
            style={{ ...segBtnStyle, background: 'var(--danger, #ef4444)', border: '1px solid #b91c1c', color: 'white' }}
        >
            🗑 削除
        </button>
    </div>
);
