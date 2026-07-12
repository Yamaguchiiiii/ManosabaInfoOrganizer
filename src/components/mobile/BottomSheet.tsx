import React from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  height?: 'half' | 'full' | 'auto';
  children: React.ReactNode;
}

// 汎用ボトムシート（smartphone.md M0）。下からせり上がる操作パネル。
// 背景タップ / ×で閉じる。safe-area-inset-bottom を考慮。
export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, height = 'auto', children }) => {
  if (!open) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div
        className={`bottom-sheet bottom-sheet--${height}`}
        style={{
          position: 'relative', background: 'var(--surface-2, #252526)',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.5)', animation: 'sheet-up 200ms ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#666' }} />
        </div>
        {title && (
          <div style={{ padding: '0 16px 8px', fontWeight: 'bold', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        )}
        <div style={{ overflowY: 'auto', padding: '0 16px 16px', flex: 1 }}>{children}</div>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
      <style>{`@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>,
    document.body
  );
};
