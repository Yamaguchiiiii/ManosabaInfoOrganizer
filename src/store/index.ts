import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIdbPersistStorage } from './persistStorage';
import { normalizeTimelineData } from '../utils/animationUtils';
import { AppState, AnimationPreset, CharacterTimelineData } from './types';
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
    'selectedIcons', 'mobileSheetOpen', 'noteClipboard', 'pendingNoteFocus',
]);

export const useAppStore = create<AppState>()(
  persist(
    (...a) => {
        const [set] = a;
        return {
            ...createUiSlice(...a),
            ...createMapSlice(...a),
            ...createPresetSlice(...a),
            ...createNoteSlice(...a),
            // F1: プリセット複製。presets と 事件ノートcanvas(notes.presets[id]) を同時に深複製する
            // 複合アクションのため、単一スライスをまたいで書ける index.ts に置く。
            duplicatePreset: (id: string) => set((state) => {
                const src = state.presets.find(p => p.id === id);
                if (!src) return state;
                const newId = `preset_${Date.now()}`;
                const copy: AnimationPreset = {
                    ...structuredClone(src),
                    id: newId,
                    name: `${src.name} (コピー)`,
                };
                const srcCanvas = state.notes.presets?.[id];
                return {
                    presets: [...state.presets, copy],
                    activePresetId: newId,
                    notes: srcCanvas
                        ? { ...state.notes, presets: { ...state.notes.presets, [newId]: structuredClone(srcCanvas) } }
                        : state.notes,
                };
            }),
        };
    },
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
                // 旧 data URL 画像を Blob(asset://) へ移行し、その後 未参照アセットを GC（起動時のみ）。#P2
                // 循環 import 回避のため動的 import。失敗は次回起動で再試行される（自己修復）。
                // revise No.3: UI解放(setHasHydrated)は移行完了後に行う。移行は起動時点のnotesスナップショットを
                // replaceNotes()で全置換するため、先にUIを解放するとその間のユーザー編集が巻き戻ってしまう。
                // _hasHydrated=falseの間はLoadingScreenが出続け、note系アクションは既存ガードで弾かれるため
                // 「編集→移行に上書きされる」という競合が構造的に起きなくなる。
                void import('../services/assetMigration').then(async ({ migrateDataUrlAssets, sweepOrphanAssets }) => {
                    try { await migrateDataUrlAssets(); }
                    catch { /* 移行失敗は次回起動で再試行（べき等） */ }
                    finally { state.setHasHydrated(true); }
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(() => { void sweepOrphanAssets(); }, { timeout: 2000 });
                    } else {
                        setTimeout(() => { void sweepOrphanAssets(); }, 1000);
                    }
                }).catch(() => state.setHasHydrated(true)); // 動的import自体の失敗でも必ず解放
            }
        }
    }
  )
);

export { computeDuration } from './presetSlice';
export { usePlaybackStore } from './playback';
export * from './types';
