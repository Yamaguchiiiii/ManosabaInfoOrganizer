import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';

// チュートリアルの開閉ロジック（初回自動表示・F1/Shift+/トリガー・「閲覧済み」永続化）。
export const useTutorial = () => {
    const tutorialSeen = useAppStore(s => s.tutorialSeen);
    const setTutorialSeen = useAppStore(s => s.setTutorialSeen);
    const setHelpOverlayOpen = useAppStore(s => s.setHelpOverlayOpen);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [tourOpen, setTourOpen] = useState(false);

    // revise3 A-12: ヘルプ/ツアー表示中はキャンバスのショートカットを無効化する
    useEffect(() => {
        setHelpOverlayOpen(drawerOpen || tourOpen);
    }, [drawerOpen, tourOpen, setHelpOverlayOpen]);

    // 初回のみ、少し待ってからツアーを自動開始する（0711_2 #3: モバイル専用ステップを用意したため全ビューポートで起動）。
    useEffect(() => {
        if (tutorialSeen) return;
        const t = setTimeout(() => setTourOpen(true), 600);
        return () => clearTimeout(t);
        // 初回マウント時の判定のみ
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // F1 / Shift+/（=?）でヘルプドロワーを開閉。
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.isComposing || e.keyCode === 229) return; // IME変換中は奪わない
            // F1 は文字入力に使われないため、入力欄フォーカス中でも常に受け付ける。
            // ブラウザ既定のヘルプより先に受けるため capture で listen し、必ず preventDefault する。0711 #9
            if (e.key === 'F1') {
                e.preventDefault();
                setDrawerOpen(o => !o);
                return;
            }
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
            if (e.shiftKey && (e.key === '?' || e.key === '/' || e.code === 'Slash')) {
                e.preventDefault();
                setDrawerOpen(o => !o);
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, []);

    const closeTour = useCallback(() => { setTourOpen(false); setTutorialSeen(true); }, [setTutorialSeen]);
    const startTour = useCallback(() => { setDrawerOpen(false); setTourOpen(true); }, []);
    const openDrawer = useCallback(() => setDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    return { drawerOpen, tourOpen, openDrawer, closeDrawer, closeTour, startTour };
};
