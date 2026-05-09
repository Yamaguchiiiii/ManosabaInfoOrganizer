import { useState } from 'react';
import Konva from 'konva';

interface UseStageZoomParams {
    minScale?: number;
    maxScale?: number;
    initialScale?: number;
    scaleBy?: number;
}

export const useStageZoom = ({
    minScale = 0.5,
    maxScale = 1.5,
    initialScale = 1,
    scaleBy = 1.025
}: UseStageZoomParams = {}) => {
    const [stageSpec, setStageSpec] = useState({
        scale: initialScale,
        x: 0,
        y: 0
    });

    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        let newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

        newScale = Math.max(minScale, Math.min(maxScale, newScale));

        // マウス位置中心にズームするための座標計算
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        setStageSpec({
            scale: newScale,
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
    };

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // ステージ自身のドラッグイベントのみを処理
    if (e.target === e.target.getStage()) {
      setStageSpec((prev) => ({
        ...prev,
        x: e.target.x(),
        y: e.target.y(),
      }));
    }
  };

  return {
    stageSpec,
    handleWheel,
    handleDragEnd,
    setStageSpec // 必要に応じて手動でセットできるように公開
  };
}