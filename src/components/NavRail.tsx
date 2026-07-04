import React from 'react';
import { useAppStore } from '../store';
import { TOUR_TARGETS } from './tutorial/tourTargets';

interface NavRailProps {
  onModeChange: (mode: 'create' | 'animate' | 'note') => void;
}

const PAGES: { mode: 'create' | 'animate' | 'note'; label: string; icon: string }[] = [
  { mode: 'create', label: 'Create', icon: '🗺️' },
  { mode: 'animate', label: 'Animate', icon: '▶' },
  { mode: 'note', label: 'Note', icon: '📓' },
];

// 左端の細いナビゲーションレール（ui.md P2）。ロゴ＋ページ切替アイコンを縦積み。
// data-tour="sidebar-pages" はここに移設（チュートリアルのハイライト対象）。
export const NavRail: React.FC<NavRailProps> = React.memo(({ onModeChange }) => {
  const mode = useAppStore(s => s.mode);
  return (
    <div className="nav-rail">
      <div className="nav-rail-logo">
        <img src="./logo.png" alt="Logo" />
      </div>
      <div className="nav-rail-pages" data-tour={TOUR_TARGETS.sidebarPages}>
        {PAGES.map(p => (
          <button
            key={p.mode}
            className={`nav-rail-item ${mode === p.mode ? 'active' : ''}`}
            onClick={() => onModeChange(p.mode)}
            title={p.label}
          >
            <span className="nav-rail-icon">{p.icon}</span>
            <span className="nav-rail-label">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
