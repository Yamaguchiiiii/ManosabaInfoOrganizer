import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';

// チュートリアルの開閉ロジック（初回自動表示・F1/Shift+/トリガー・「閲覧済み」永続化）。
export const useTutorial = () => {
    const tutorialSeen = useAppStore(s => s.tutorialSeen);
    const setTutorialSeen = useAppStore(s => s.setTutorialSeen);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [tourOpen, setTourOpen] = useState(false);

    // 初回のみ、少し待ってからツアーを自動開始する。
    // ただしモバイル幅では自動起動しない（ツアーはデスクトップUI(NavRail/ICONS等)を指すため、
    // モバイルでは対象が存在せずハイライトできない。ヘルプからは手動で開ける）。
    useEffect(() => {
        if (tutorialSeen) return;
        if (window.innerWidth < 768) return;
        const t = setTimeout(() => setTourOpen(true), 600);
        return () => clearTimeout(t);
        // 初回マウント時の判定のみ
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // F1 / Shift+/（=?）でヘルプドロワーを開閉。
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
            if (e.key === 'F1' || (e.shiftKey && (e.key === '?' || e.key === '/'))) {
                e.preventDefault();
                setDrawerOpen(o => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const closeTour = useCallback(() => { setTourOpen(false); setTutorialSeen(true); }, [setTutorialSeen]);
    const startTour = useCallback(() => { setDrawerOpen(false); setTourOpen(true); }, []);
    const openDrawer = useCallback(() => setDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    return { drawerOpen, tourOpen, openDrawer, closeDrawer, closeTour, startTour };
};
