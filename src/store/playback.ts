import { create } from 'zustand';

// --- 再生(playback)の一時状態は永続化しない別ストアに分離する ---
// currentTime は再生中に毎フレーム更新されるため、これを persist 付きの useAppStore に
// 置くと「巨大な state を IndexedDB へ毎フレーム書き込む」ことになり、フレーム落ち・GC圧の
// 主因になっていた（Performance 上 setItem/put が 100%）。永続化不要な currentTime /
// isPlaying / playbackSpeed をこの軽量ストアへ移し、再生が IndexedDB に一切触れないようにする。
interface PlaybackState {
    isPlaying: boolean;
    currentTime: number;
    playbackSpeed: number;
    setIsPlaying: (isPlaying: boolean) => void;
    setCurrentTime: (time: number) => void;
    setPlaybackSpeed: (speed: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1.0,
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
}));
