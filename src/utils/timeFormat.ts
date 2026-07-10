import { TARGET_FPS } from '../constants';

// フレーム数を mm:ss:ff 形式に変換する（TARGET_FPS=60 基準）。
export const formatTime = (frames: number): string => {
    const seconds = Math.floor(frames / TARGET_FPS);
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    const ff = Math.floor(frames % TARGET_FPS).toString().padStart(2, '0');
    return `${mm}:${ss}:${ff}`;
};
