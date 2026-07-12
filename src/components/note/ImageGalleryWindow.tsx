import React from 'react';
import { createPortal } from 'react-dom';
import { AssetImg } from './NoteObjectComponents';

interface ImageGalleryWindowProps {
    galleryPos: { x: number, y: number } | null;
    isDraggingGallery: boolean;
    onDragStart: (e: React.PointerEvent) => void;
    availableImages: string[];
    onClose: () => void;
    onSelectImage: (src: string) => void;
}

// 登録画像ギャラリー。アニメ(マップ)が最大限見えるよう小さく、既定は右下。ヘッダーをドラッグで移動可。
export const ImageGalleryWindow: React.FC<ImageGalleryWindowProps> = ({
    galleryPos, isDraggingGallery, onDragStart, availableImages, onClose, onSelectImage,
}) => createPortal(
    <div style={{
        position: 'fixed',
        ...(galleryPos
            ? { left: galleryPos.x, top: galleryPos.y }
            : { right: '12px', bottom: '16px' }),
        width: '210px', maxHeight: '45vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
        borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 1000000, padding: '8px'
    }}>
        <div
            onPointerDown={onDragStart}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', cursor: isDraggingGallery ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', userSelect: 'none' }}>⠿ 画像を選んで配置</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {availableImages.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', color: 'var(--text-disabled)', fontSize: '0.75rem', textAlign: 'center', padding: '10px' }}>画像がありません</div>
            ) : availableImages.map((src, idx) => (
                <div
                    key={idx}
                    title="クリックして配置 → キャンバスをクリック"
                    onClick={() => onSelectImage(src)}
                    style={{ cursor: 'pointer', aspectRatio: '1 / 1', background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: '6px', overflow: 'hidden' }}
                >
                    <AssetImg src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
            ))}
        </div>
    </div>,
    document.body
);
