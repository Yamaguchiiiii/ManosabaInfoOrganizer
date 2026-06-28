import React from 'react';
import { useTutorial } from '../../hooks/useTutorial';
import { HelpButton } from './HelpButton';
import { HelpDrawer } from './HelpDrawer';
import { SpotlightTour, TourStep } from './SpotlightTour';
import { Kbd } from './Kbd';

// 初回スポットライトツアーの手順。mode を指定したステップは表示前にそのページへ切り替える。
const STEPS: TourStep[] = [
    {
        target: 'sidebar-pages',
        title: 'ページを切り替える',
        body: <>左の <b>Create / Animate / Note</b> で 3 つのページを行き来します。Create で経路を作り、Animate で再生、Note で推理を整理します。</>,
    },
    {
        target: 'sidebar-icons',
        mode: 'create',
        title: 'キャラクターを選ぶ',
        body: <>ICONS からキャラを選択。<Kbd keys={['Shift', 'Click']} /> で複数選択できます。どくろ印で死亡設定。</>,
    },
    {
        target: 'create-maps',
        mode: 'create',
        title: 'Create — 経路をつくる',
        body: <>2F/1F/B1 の 4 ペイン。ホバーしたペインが編集対象フロアです。ノードを置いて接続し、Start/Goal を指定して <b>Save Path</b> で保存します。</>,
    },
    {
        target: 'animate-playback',
        mode: 'animate',
        title: 'Animate — 再生する',
        body: <><Kbd keys={['Space']} /> または操作盤の ▶ で再生／一時停止。操作盤はドラッグで移動でき、速度・再生位置も変えられます。</>,
    },
    {
        target: 'note-tabs',
        mode: 'note',
        title: 'Note — 推理を整理する',
        body: <>全体／事件／キャラクター／メモの 4 種類。Canvas に図形・テキスト・画像を配置。<Kbd keys={['Mod', 'Z']} /> や <Kbd keys={['Delete']} /> も使えます。</>,
    },
    {
        target: 'help-button',
        title: 'いつでもヘルプ',
        placement: 'top',
        body: <>この <b>?</b> ボタン（または <Kbd keys={['F1']} />）でショートカット一覧とクイックスタートをいつでも開けます。</>,
    },
];

export const TutorialRoot: React.FC = () => {
    const { drawerOpen, tourOpen, openDrawer, closeDrawer, closeTour, startTour } = useTutorial();
    return (
        <>
            <HelpButton onClick={openDrawer} />
            <HelpDrawer open={drawerOpen} onClose={closeDrawer} onStartTour={startTour} />
            <SpotlightTour open={tourOpen} steps={STEPS} onClose={closeTour} />
        </>
    );
};
