import React from 'react';

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
}

const dividerStyle: React.CSSProperties = { width: 1, alignSelf: 'stretch', margin: '7px 2px', background: '#444', flexShrink: 0 };
const segBtnStyle: React.CSSProperties = {
    background: '#3a3a3a', border: '1px solid #555', color: '#ccc', borderRadius: '4px',
    cursor: 'pointer', fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
};

// U3: キャンバス上端の選択中オブジェクト操作バー（右クリックメニューと同じハンドラを共有し、
// 右クリックなしで色/線幅/レイヤー/グループ化/削除を完結させる）。選択が無いときは親側で非表示にする。
export const SelectionContextBar: React.FC<SelectionContextBarProps> = ({
    count, colorValue, onColorChange, widthValue, onWidthChange,
    canReorder, onReorderBack, onReorderFront, canGroup, onGroup, canUngroup, onUngroup, onDelete,
}) => (
    <div style={{
        height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
        padding: '0 10px', background: 'rgba(30,30,30,0.95)', borderBottom: '1px solid #444',
        fontSize: '0.8rem', color: '#ccc', overflowX: 'auto', boxSizing: 'border-box',
    }}>
        <span style={{ whiteSpace: 'nowrap', color: '#aaa', flexShrink: 0 }}>{count}個選択</span>

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
