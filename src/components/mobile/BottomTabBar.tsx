import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { TOUR_TARGETS } from '../tutorial/tourTargets';

interface BottomTabBarProps {
  onModeChange: (mode: 'create' | 'animate' | 'note') => Promise<void> | void;
}

const TABS = [
  { mode: 'create', label: 'Create', icon: '🗺️' },
  { mode: 'animate', label: 'Animate', icon: '▶' },
  { mode: 'note', label: 'Note', icon: '📓' },
] as const;

// 下部固定タブバー（smartphone.md M0）。親指到達域にナビゲーションを置く。
// E6: ガード解決までタップ無効化（確認ダイアログ表示中の連打で遷移要求が積まれるのを防ぐ）。
export const BottomTabBar: React.FC<BottomTabBarProps> = ({ onModeChange }) => {
  const mode = useAppStore(s => s.mode);
  const [pending, setPending] = useState(false);

  const handle = async (m: 'create' | 'animate' | 'note') => {
    if (pending || m === mode) return;
    setPending(true);
    try { await onModeChange(m); } finally { setPending(false); }
  };

  return (
    <nav className="mobile-tabbar" data-tour={TOUR_TARGETS.sidebarPages}>
      {TABS.map(t => (
        <button
          key={t.mode}
          className={`tab ${mode === t.mode ? 'active' : ''}`}
          onClick={() => handle(t.mode)}
          disabled={pending}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
};
