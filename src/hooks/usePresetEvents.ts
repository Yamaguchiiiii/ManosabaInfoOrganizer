import { useMemo } from 'react';
import { useAppStore } from '../store';
import { computePresetTiming } from '../utils/presetTiming';
import { detectEncounters } from '../utils/encounterDetection';
import { normalizeTimelineData } from '../utils/animationUtils';

export interface TimedEvent {
    kind: 'talk' | 'auto-talk' | 'pass';   // 💬明示会話 / 💬同室検出 / ⚇遭遇(syncすれ違い)
    label: string;                          // 地点名
    charIds: string[];
    t: number;                              // 正規化済みフレーム（ジャンプ先）
    tEnd?: number;                          // auto-talk の帯表示用
}

// アクティブプリセットの「⚇遭遇(syncすれ違い)」「💬会話(同室自動検出+明示記録)」を
// 時系列イベントとして統合する。AnimationTimeline のシークバー重畳と ContextPanel の
// イベント一覧（20.md #10）が同じ算出結果を共有するための基盤フック。
export const usePresetEvents = (): { maxDuration: number; offset: number; events: TimedEvent[] } => {
    const presets = useAppStore(s => s.presets);
    const activePresetId = useAppStore(s => s.activePresetId);
    const nodes = useAppStore(s => s.nodes);
    const activePreset = presets.find(p => p.id === activePresetId);

    return useMemo(() => {
        if (!activePreset?.data) return { maxDuration: 300, offset: 0, events: [] };
        const { offset, maxDuration, resolvedStarts } = computePresetTiming(activePreset.data, nodes);
        const events: TimedEvent[] = [];

        // ⚇ 遭遇: 各キャラの syncConstraints（すれ違い/合流の瞬間）
        const seen = new Set<string>();   // 相互syncの重複除去
        Object.entries(activePreset.data).forEach(([id, raw]) => {
            const base = normalizeTimelineData(raw);
            (base?.syncConstraints || []).forEach(sc => {
                const chars = [id, ...sc.charIds];
                const key = `${Math.round(sc.meetingTime)}:${sc.waypointId}:${[...chars].sort().join(',')}`;
                if (seen.has(key)) return;
                seen.add(key);
                events.push({ kind: 'pass', label: sc.waypointName, charIds: chars, t: sc.meetingTime - offset });
            });
        });
        // 💬 会話（同室の自動検出）
        detectEncounters(activePreset.data, nodes, resolvedStarts).forEach(e =>
            events.push({ kind: 'auto-talk', label: e.nodeName, charIds: e.charIds, t: e.start - offset, tEnd: e.end - offset }));
        // 💬 会話（明示・#8）
        (activePreset.events || []).forEach(ev =>
            events.push({ kind: 'talk', label: ev.nodeName, charIds: ev.charIds, t: ev.time - offset }));

        return {
            maxDuration, offset,
            events: events.filter(e => (e.tEnd ?? e.t) >= 0 && e.t <= maxDuration).sort((a, b) => a.t - b.t),
        };
    }, [activePreset, nodes]);
};
