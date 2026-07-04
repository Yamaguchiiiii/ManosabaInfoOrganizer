import React, { useState } from 'react';
import { MobileAppBar } from './MobileAppBar';
import { BottomTabBar } from './BottomTabBar';
import { MobileContextSheet } from './MobileContextSheet';

interface MobileShellProps {
  selectedIcons: string[];
  onIconSelect: (icon: string, isShift: boolean) => void;
  onModeChange: (mode: 'create' | 'animate' | 'note') => Promise<void> | void;
  children: React.ReactNode; // 現在のビュー（Create/Animate/Note）
}

// モバイル用の外枠（smartphone.md M0）: 上部バー + ビュー + 下部タブ + 文脈シート。
// ビュー本体は既存コンポーネントを再利用（各ビューのタッチ最適化は M1〜M3 の範囲）。
export const MobileShell: React.FC<MobileShellProps> = ({ selectedIcons, onIconSelect, onModeChange, children }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="mobile-shell">
      <MobileAppBar onOpenContext={() => setSheetOpen(true)} />
      <div className="mobile-workspace">{children}</div>
      <BottomTabBar onModeChange={onModeChange} />
      <MobileContextSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        selectedIcons={selectedIcons}
        onIconSelect={onIconSelect}
      />
    </div>
  );
};
