import { MapNode } from '../store';
import { resolveStartTimes, normalizeTimelineData, precomputePath, computeAnchors } from './animationUtils';

export interface PresetTiming {
    offset: number;                          // 全キャラ最小開始時刻（これを 0 に正規化）
    maxDuration: number;                     // 正規化後の全体尺
    resolvedStarts: Record<string, number>;  // 絶対時刻（正規化前）
}

// プリセットの正規化 offset・全体尺・各キャラ解決済み開始時刻を1箇所で算出する。
// AnimationTimeline と useAnimationPositions の重複実装（revise No.14）を統合するための基盤。
export const computePresetTiming = (rawData: Record<string, unknown>, nodes: MapNode[]): PresetTiming => {
    const resolvedStarts = resolveStartTimes(rawData, nodes);
    const spans: { start: number; end: number }[] = [];
    Object.entries(rawData).forEach(([id, raw]) => {
        const base = normalizeTimelineData(raw);
        if (!base) return;
        const charData = { ...base, startTime: resolvedStarts[id] ?? base.startTime ?? 0 };
        const cached = precomputePath(charData.path, nodes);
        const anchors = computeAnchors(charData, cached);
        if (anchors.length === 0) return;
        spans.push({ start: anchors[0].time, end: anchors[anchors.length - 1].time });
    });
    if (spans.length === 0) return { offset: 0, maxDuration: 300, resolvedStarts };
    const minStart = Math.min(...spans.map(s => s.start));
    const offset = (Number.isFinite(minStart) && minStart > 0) ? minStart : 0;
    const max = Math.max(...spans.map(s => s.end - offset));
    return { offset, maxDuration: Math.max(max + 60, 300), resolvedStarts };
};
