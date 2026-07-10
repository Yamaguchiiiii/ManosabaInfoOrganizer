import React from 'react';
import { useAppStore } from '../../store';
import { SaveStatusIndicator } from '../common/SaveStatusIndicator';
import { NoteSearchBox } from '../common/NoteSearchBox';

interface MobileAppBarProps {
  onOpenContext: () => void;
}

const NOTE_TAB_LABELS: Record<string, string> = {
  overview: '全体ノート', preset: '事件ノート', character: 'キャラクターノート', misc: 'メモ',
};

// モバイル上部バー（smartphone.md M0）。左=文脈シートを開くメニュー、中央=ビュー名、右=保存状態。
export const MobileAppBar: React.FC<MobileAppBarProps> = ({ onOpenContext }) => {
  const mode = useAppStore(s => s.mode);
  const activeNoteTab = useAppStore(s => s.activeNoteTab);

  const title = mode === 'create' ? 'Create'
    : mode === 'animate' ? 'Animate'
    : `事件ノート: ${NOTE_TAB_LABELS[activeNoteTab] ?? ''}`.replace('事件ノート: ', 'Note ▸ ');

  return (
    <header className="mobile-appbar">
      <button className="appbar-menu" onClick={onOpenContext} title="メニュー" aria-label="メニュー">☰</button>
      <span className="appbar-title">{title}</span>
      <div className="appbar-right"><NoteSearchBox /><SaveStatusIndicator /></div>
    </header>
  );
};
