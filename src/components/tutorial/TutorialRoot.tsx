import React from 'react';
import { useTutorial } from '../../hooks/useTutorial';
import { HelpButton } from './HelpButton';
import { HelpDrawer } from './HelpDrawer';
import { SpotlightTour, TourStep } from './SpotlightTour';
import { TOUR_TARGETS } from './tourTargets';
import { Kbd } from './Kbd';

// 初回スポットライトツアーの手順。mode を指定したステップは表示前にそのページへ切り替える。
const STEPS: TourStep[] = [
    {
        target: TOUR_TARGETS.sidebarPages,
        title: 'ページを切り替える',
        body: <>左の <b>Create / Animate / Note</b> で 3 つのページを行き来します。Create で経路を作り、Animate で再生、Note で推理を整理します。</>,
    },
    {
        target: TOUR_TARGETS.sidebarIcons,
        mode: 'create',
        title: 'キャラクターを選ぶ',
        body: <>ICONS からキャラを選択。<Kbd keys={['Shift', 'Click']} /> で複数選択できます。どくろ印で死亡設定。</>,
    },
    {
        target: TOUR_TARGETS.createMaps,
        mode: 'create',
        title: 'Create — 行動経路をつくる',
        body: <>2F/1F/B1 を同時表示。ホバーしたペインが編集対象です。地点をクリックして Start→Goal を指定、<b>Add Stop</b> で経由地、<b>sync(⏱)</b> で他キャラと合流/すれ違い、<b>Save Path</b> で保存します。</>,
    },
    {
        target: TOUR_TARGETS.animatePlayback,
        mode: 'animate',
        title: 'Animate — 再生して検証',
        body: <><Kbd keys={['Space']} /> または ▶ で再生／停止。操作盤はドラッグ移動でき、プリセット・速度・再生位置を調整。右下の事件ノートに状況メモを重ねられます。</>,
    },
    {
        target: TOUR_TARGETS.noteTabs,
        mode: 'note',
        title: 'Note — 推理を整理する',
        body: <>全体／事件／キャラクター／メモの 4 種。図形・テキスト・画像（立ち絵）を配置し、複数選択・グループ化・コピー/貼り付け・<Kbd keys={['Mod', 'Z']} /> に対応します。</>,
    },
    {
        target: TOUR_TARGETS.helpButton,
        title: 'すべての機能はここから',
        placement: 'top',
        body: <>サイドバー右下の <b>?</b>（または <Kbd keys={['F1']} /> / <Kbd keys={['Shift', '/']} />）で、全機能の説明とショートカット一覧をいつでも開けます。</>,
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
