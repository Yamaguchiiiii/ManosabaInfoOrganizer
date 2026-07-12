import { useMemo } from 'react';
import { useAppStore } from '../store';
import { validatePresetSync, SyncIssue } from '../utils/syncValidation';

// sync 整合性チェックを常設表示するためのフック（revise2 №12）。
// 旧: 保存時トースト/アラートのみで、後から Animate を見た人には「なぜかズレる」だけが残っていた。
export const usePresetSyncIssues = (): SyncIssue[] => {
    const presets = useAppStore(s => s.presets);
    const activePresetId = useAppStore(s => s.activePresetId);
    const nodes = useAppStore(s => s.nodes);
    return useMemo(() => {
        const p = presets.find(pp => pp.id === activePresetId);
        return p?.data ? validatePresetSync(p.data, nodes) : [];
    }, [presets, activePresetId, nodes]);
};
