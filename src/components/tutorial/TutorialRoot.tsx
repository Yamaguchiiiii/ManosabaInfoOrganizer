import React, { useMemo } from 'react';
import { useTutorial } from '../../hooks/useTutorial';
import { useViewport } from '../../hooks/useViewport';
import { HelpButton } from './HelpButton';
import { HelpDrawer } from './HelpDrawer';
import { SpotlightTour, TourStep } from './SpotlightTour';
import { TOUR_TARGETS } from './tourTargets';
import { Kbd } from './Kbd';

// 初回スポットライトツアーの手順（デスクトップ）。mode を指定したステップは表示前にそのページへ切り替える。
const DESKTOP_STEPS: TourStep[] = [
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

// モバイル: 対象・文言ともモバイルUIに合わせる（0711_2 #3）
const MOBILE_STEPS: TourStep[] = [
    {
        target: TOUR_TARGETS.sidebarPages,
        placement: 'top',
        title: 'ページを切り替える',
        body: <>下のタブで <b>Create / Animate / Note</b> を行き来します。Create で経路を作り、Animate で再生、Note で推理を整理します。</>,
    },
    {
        target: TOUR_TARGETS.mobileMenu,
        title: 'キャラクターとノートの切替',
        body: <>左上の <b>☰</b> でシートを開き、キャラクター選択（Create/Animate）や、ノート種別の切替・死亡設定（💀）ができます。</>,
    },
    {
        target: TOUR_TARGETS.createMaps,
        mode: 'create',
        title: 'Create — 行動経路をつくる',
        body: <>上のセグメントで 2F/1F/B1 を切替。地点をタップして Start→Goal を指定、<b>Add Stop</b> で経由地、<b>sync(⏱)</b> で他キャラと合流/すれ違い、<b>Save Path</b> で保存します。</>,
    },
    {
        target: TOUR_TARGETS.animatePlayback,
        mode: 'animate',
        placement: 'top',
        title: 'Animate — 再生して検証',
        body: <>▶ で再生／停止。🗓 のイベント一覧をタップすると、その時刻とマップへジャンプします。「事件ノート」を開くと状況メモを重ねられます。</>,
    },
    {
        target: TOUR_TARGETS.sidebarPages,
        mode: 'note',
        placement: 'top',
        title: 'Note — 推理を整理する',
        body: <>全体／事件／キャラクター／メモの 4 種。図形・テキスト・画像（立ち絵）を配置できます。ノート種別は ☰ から切り替えます。</>,
    },
    {
        target: TOUR_TARGETS.helpButton,
        placement: 'top',
        title: 'すべての機能はここから',
        body: <>右下の <b>?</b> で、全機能の説明とショートカット一覧をいつでも開けます。</>,
    },
];

export const TutorialRoot: React.FC = () => {
    const { drawerOpen, tourOpen, openDrawer, closeDrawer, closeTour, startTour } = useTutorial();
    const isMobile = useViewport() === 'mobile';
    const steps = useMemo(() => (isMobile ? MOBILE_STEPS : DESKTOP_STEPS), [isMobile]);
    return (
        <>
            <HelpButton onClick={openDrawer} />
            <HelpDrawer open={drawerOpen} onClose={closeDrawer} onStartTour={startTour} />
            <SpotlightTour open={tourOpen} steps={steps} onClose={closeTour} />
        </>
    );
};
