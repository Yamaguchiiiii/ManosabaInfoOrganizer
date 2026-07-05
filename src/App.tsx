import React, { useState, useEffect } from 'react';
import { FloorId, useAppStore } from './store';
import { NavRail } from './components/NavRail';
import { ContextPanel } from './components/ContextPanel';
import { ContextBar } from './components/ContextBar';
import { CreateView } from './components/CreateView';
import { AnimateView } from './components/AnimateView';
import { NoteView } from './components/NoteView';
import { DialogHost } from './components/common/DialogHost';
import { LoadingScreen } from './components/common/LoadingScreen';
import { ToastHost } from './components/common/ToastHost';
import { ConflictBanner } from './components/common/ConflictBanner';
import { TutorialRoot } from './components/tutorial/TutorialRoot';
import { MobileShell } from './components/mobile/MobileShell';
import { useViewport } from './hooks/useViewport';
import { runNavigationGuard } from './services/navigationGuard';
import { checkStorageHealth } from './services/storageHealth';
import './styles/App.scss';
import './styles/Modal.scss';

function App() {
    // ▼ 修正: 必要な状態だけを個別に取得し、不要な再レンダリングを防止 ▼
    const _hasHydrated = useAppStore(state => state._hasHydrated);
    const mode = useAppStore(state => state.mode);
    const enterMode = useAppStore(state => state.enterMode);
    const activeFloor = useAppStore(state => state.activeFloor);
    const setActiveFloor = useAppStore(state => state.setActiveFloor);
    const sidebarWidth = useAppStore(state => state.sidebarWidth);
    const contextPanelCollapsed = useAppStore(state => state.contextPanelCollapsed);
    const viewport = useViewport();

    const [selectedIcons, setSelectedIcons] = useState<string[]>([]);
    // #06/30-8: ページ遷移中はロゴ+「Loading ...」オーバーレイを表示する（旧: workspace の黒フェード）
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };
        document.addEventListener('contextmenu', handleContextMenu);
        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    // ストレージ永続化の要求＋容量チェック（E2）。ハイドレーション後に1回だけ。
    useEffect(() => {
        if (_hasHydrated) void checkStorageHealth();
    }, [_hasHydrated]);

    if (!_hasHydrated) {
        return <LoadingScreen />;
    }

    const handleIconSelect = async (icon: string, isShiftPressed: boolean) => {
        if (isShiftPressed) {
            setSelectedIcons(prev => {
                if (prev.includes(icon)) {
                    return prev.filter(i => i !== icon);
                } else {
                    return [...prev, icon];
                }
            });
            return;
        }
        // 同じキャラの再選択は遷移扱いしない
        if (selectedIcons.length === 1 && selectedIcons[0] === icon) return;
        // 単一キャラへ切替: 未保存の経路があればガードで確認（中止ならキャンセル）
        if (!(await runNavigationGuard())) return;
        setSelectedIcons([icon]);
    };

    const clearSelection = () => setSelectedIcons([]);

    const MIN_OVERLAY_MS = 250; // チラつき防止の最低表示時間

    const handleTransition = (action: () => void) => {
        setIsTransitioning(true);
        const shownAt = performance.now();
        // オーバーレイを1フレーム描画してから重い処理（enterMode→ビュー再マウント）を実行する
        requestAnimationFrame(() => {
            action();
            // 新ビューの初回描画が終わった次フレームで、最低表示時間を満たしてから閉じる
            requestAnimationFrame(() => {
                const wait = Math.max(0, MIN_OVERLAY_MS - (performance.now() - shownAt));
                setTimeout(() => setIsTransitioning(false), wait);
            });
        });
    };

    const changeModeWithTransition = async (newMode: 'create' | 'animate' | 'note') => {
        if (mode === newMode) return;
        // 未保存の経路があればガードで確認（中止ならモード切替しない）
        if (!(await runNavigationGuard())) return;
        // enterMode が mode 切替と Create 専用モード解除を1回の set で行う（#06/30-10）
        handleTransition(() => enterMode(newMode));
    };

    const changeFloorWithTransition = (newFloor: FloorId) => {
        if (activeFloor === newFloor) return;
        handleTransition(() => {
            setActiveFloor(newFloor);
        })
    }

    // 現在のビュー本体（デスクトップ/モバイルで共通に再利用する）
    const viewElement = mode === 'create' ? (
        <CreateView
            onFloorChange={changeFloorWithTransition}
            selectedIcons={selectedIcons}
            onIconSelect={handleIconSelect}
            onClearSelection={clearSelection}
        />
    ) : mode === 'animate' ? (
        <AnimateView />
    ) : (
        <NoteView />
    );

    const overlays = (
        <>
            {isTransitioning && <LoadingScreen overlay />}
            <DialogHost />
            <ToastHost />
            <ConflictBanner />
            <TutorialRoot />
        </>
    );

    // モバイル: 下タブ+上部バーのモバイルシェルで既存ビューを包む（smartphone.md M0）
    if (viewport === 'mobile') {
        return (
            <div className="app-container mobile">
                <MobileShell
                    selectedIcons={selectedIcons}
                    onIconSelect={handleIconSelect}
                    onModeChange={changeModeWithTransition}
                >
                    {viewElement}
                </MobileShell>
                {overlays}
            </div>
        );
    }

    return (
        <div
            className="app-container"
            style={{ '--sidebar-width': `${sidebarWidth}px`, '--scale-factor': sidebarWidth / 250 } as React.CSSProperties}
        >
            <NavRail onModeChange={changeModeWithTransition} />

            {!contextPanelCollapsed && (
                <ContextPanel
                    selectedIcons={selectedIcons}
                    onIconSelect={handleIconSelect}
                />
            )}

            <div className="main-content">
                <ContextBar
                    selectedIcons={selectedIcons}
                    onIconSelect={handleIconSelect}
                />

                <div className="workspace">
                    {viewElement}
                </div>
            </div>

            {overlays}
        </div>
    );
}

export default App;