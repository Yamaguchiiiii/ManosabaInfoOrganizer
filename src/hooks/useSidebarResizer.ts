import { useCallback, useEffect, useRef } from "react";

export const MIN_SIDEBAR_WIDTH = 150;
export const MAX_SIDEBAR_WIDTH = 350;

export const useSidebarResizer = (
    setSidebarWidth: (width: number) => void
) => {
    const isDraggingRef = useRef(false);
    const animationFrameId = useRef<number | null>(null);   // アニメーションフレーム管理用

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // ドラッグ中はテキスト選択などを無効化して軽量化
    }, []);

    const stopResizing = useCallback(() => {
        isDraggingRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';

        // 保留中の処理があればキャンセル
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isDraggingRef.current) {
            // すでに描画町の処理があれば，最新のマウス位置だけを処理するためキャンセル
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }

            // 次の描画フレームで実行
            animationFrameId.current = requestAnimationFrame(() => {
                const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
            setSidebarWidth(newWidth);
            })
            
        }
    }, [setSidebarWidth]);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);

            // クリーンアップ時にもキャンセル
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [resize, stopResizing]);

    return { startResizing };
};