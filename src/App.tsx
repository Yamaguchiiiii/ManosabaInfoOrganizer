import React, { useState, useEffect } from 'react';
import { FloorId, useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CreateView } from './components/CreateView';
import { AnimateView } from './components/AnimateView';
import { NoteView } from './components/NoteView';
import { DialogHost } from './components/common/DialogHost';
import { TutorialRoot } from './components/tutorial/TutorialRoot';
import { runNavigationGuard } from './services/navigationGuard';
import './styles/App.scss';
import './styles/Modal.scss';

function App() {
    // ▼ 修正: 必要な状態だけを個別に取得し、不要な再レンダリングを防止 ▼
    const _hasHydrated = useAppStore(state => state._hasHydrated);
    const mode = useAppStore(state => state.mode);
    const setMode = useAppStore(state => state.setMode);
    const setSkullMode = useAppStore(state => state.setSkullMode);
    const activeFloor = useAppStore(state => state.activeFloor);
    const setActiveFloor = useAppStore(state => state.setActiveFloor);
    const setGraphEditMode = useAppStore(state => state.setGraphEditMode);
    const sidebarWidth = useAppStore(state => state.sidebarWidth);

    const [selectedIcons, setSelectedIcons] = useState<string[]>([]);
    const [viewOpacity, setViewOpacity] = useState(1);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };
        document.addEventListener('contextmenu', handleContextMenu);
        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    if (!_hasHydrated) {
        return (
            <div style={{ 
                display: 'flex', justifyContent: 'center', alignItems: 'center', 
                height: '100vh', width: '100vw', backgroundColor: '#1e1e1e', 
                color: '#ccc', fontSize: '1.2rem', fontFamily: 'monospace' 
            }}>
                Loading map data...
            </div>
        );
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

    const handleTransition = (action: () => void) => {
        setViewOpacity(0);
        setTimeout(() => {
            action();
            setTimeout(() => {
                setViewOpacity(1);
            }, 50)
        }, 300)
    }

    const changeModeWithTransition = async (newMode: 'create' | 'animate' | 'note') => {
        if (mode === newMode) return;
        // 未保存の経路があればガードで確認（中止ならモード切替しない）
        if (!(await runNavigationGuard())) return;
        handleTransition(() => {
            setMode(newMode);
            if (newMode === 'animate' || newMode === 'note'){
                setGraphEditMode(false);
                // 死亡設定モード(どくろ)はCreate専用なので、離脱時に必ず解除する
                setSkullMode(false);
            }
        });
    };

    const changeFloorWithTransition = (newFloor: FloorId) => {
        if (activeFloor === newFloor) return;
        handleTransition(() => {
            setActiveFloor(newFloor);
        })
    }

    return (
        <div 
            className="app-container" 
            style={{ '--sidebar-width': `${sidebarWidth}px`, '--scale-factor': sidebarWidth / 250 } as React.CSSProperties}
        >
            <Sidebar 
                selectedIcons={selectedIcons}
                onIconSelect={handleIconSelect}
                onModeChange={changeModeWithTransition}
                onFloorChange={changeFloorWithTransition}
            />

            <div className="main-content">
                {mode !== 'animate' && mode !== 'note' && (
                    <TopBar 
                        selectedIcons={selectedIcons}
                        onIconSelect={handleIconSelect}
                    />
                )}

                <div 
                    className="workspace"
                    style={{ opacity: viewOpacity, transition: 'opacity 0.3s ease-in-out' }}
                >
                    {mode === 'create' ? (
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
                    )}
                </div>
            </div>

            <DialogHost />
            <TutorialRoot />
        </div>
    );
}

export default App;