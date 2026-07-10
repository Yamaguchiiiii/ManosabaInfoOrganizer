import React from 'react';
import { useAppStore } from '../../store';
import { MobileAppBar } from './MobileAppBar';
import { BottomTabBar } from './BottomTabBar';
import { MobileContextSheet } from './MobileContextSheet';

interface MobileShellProps {
  onModeChange: (mode: 'create' | 'animate' | 'note') => Promise<void> | void;
  children: React.ReactNode; // 現在のビュー（Create/Animate/Note）
}

// モバイル用の外枠（smartphone.md M0）: 上部バー + ビュー + 下部タブ + 文脈シート。
// ビュー本体は既存コンポーネントを再利用（各ビューのタッチ最適化は M1〜M3 の範囲）。
export const MobileShell: React.FC<MobileShellProps> = ({ onModeChange, children }) => {
  const mobileSheetOpen = useAppStore(s => s.mobileSheetOpen);
  const setMobileSheetOpen = useAppStore(s => s.setMobileSheetOpen);
  return (
    <div className="mobile-shell">
      <MobileAppBar onOpenContext={() => setMobileSheetOpen(true)} />
      <div className="mobile-workspace">{children}</div>
      <BottomTabBar onModeChange={onModeChange} />
      <MobileContextSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
      />
    </div>
  );
};
