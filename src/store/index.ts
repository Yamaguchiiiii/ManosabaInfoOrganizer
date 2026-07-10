import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIdbPersistStorage } from './persistStorage';
import { normalizeTimelineData } from '../utils/animationUtils';
import { AppState, CharacterTimelineData } from './types';
import { createUiSlice } from './uiSlice';
import { createMapSlice } from './mapSlice';
import { createPresetSlice } from './presetSlice';
import { createNoteSlice } from './noteSlice';

// persist ストレージ（set() ごとの全量 stringify を排除するカスタム実装。詳細は persistStorage.ts）
const idbPersist = createIdbPersistStorage<AppState>();
/** 未書き込みの persist を即時確定させる（バックアップのエクスポート前などに使う）。 */
export const flushPersistNow = idbPersist.flushNow;

// persist 対象から除外する state（UI一時状態・履歴の逆参照など。詳細は各 slice のコメント参照）
const PERSIST_EXCLUDE = new Set([
    'noteHistory', 'noteRedoStack', '_hasHydrated', 'dialog', 'eventFilterChar',
    'selectedIcons', 'mobileSheetOpen',
]);

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
        ...createUiSlice(...a),
        ...createMapSlice(...a),
        ...createPresetSlice(...a),
        ...createNoteSlice(...a),
    }),
    {
        name: 'mystery-map-storage',
        storage: idbPersist,
        partialize: (state) =>
            Object.fromEntries(
                Object.entries(state).filter(([key]) => !PERSIST_EXCLUDE.has(key))
            ) as AppState,
        onRehydrateStorage: () => (state) => {
            if (state) {
                // 旧デフォルト名 'Chapter 1' を 'Episode 1' に移行する（自動生成された初期プリセットのみ対象）
                const defaultPreset = state.presets?.find(p => p.id === 'chapter1');
                if (defaultPreset && defaultPreset.name === 'Chapter 1') {
                    state.presets = state.presets.map(p => p.id === 'chapter1' ? { ...p, name: 'Episode 1' } : p);
                }
                // 旧形式(配列)のタイムラインを CharacterTimelineData に正規化し、data の型を確定させる（#A-5）。
                // これで各所の Array.isArray 分岐が不要になる。
                state.presets = (state.presets || []).map(p => ({
                    ...p,
                    data: Object.fromEntries(
                        Object.entries(p.data || {})
                            .map(([id, raw]) => [id, normalizeTimelineData(raw)] as const)
                            .filter((e): e is [string, CharacterTimelineData] => e[1] !== null)
                    ),
                }));
                state.setHasHydrated(true);
                // 旧 data URL 画像を Blob(asset://) へ移行し、その後 未参照アセットを GC（起動時のみ）。#P2
                // 循環 import 回避のため動的 import。失敗は次回起動で再試行される（自己修復）。
                void import('../services/assetMigration').then(async ({ migrateDataUrlAssets, sweepOrphanAssets }) => {
                    try {
                        await migrateDataUrlAssets();
                        if (typeof requestIdleCallback === 'function') {
                            requestIdleCallback(() => { void sweepOrphanAssets(); }, { timeout: 2000 });
                        } else {
                            setTimeout(() => { void sweepOrphanAssets(); }, 1000);
                        }
                    } catch { /* 移行失敗は次回起動で再試行 */ }
                });
            }
        }
    }
  )
);

export { computeDuration } from './presetSlice';
export { usePlaybackStore } from './playback';
export * from './types';
