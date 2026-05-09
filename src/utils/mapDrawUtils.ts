// src/utils/mapDrawUtils.ts

export const SEGMENT_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

export const getOffsetPoint = (x1: number, y1: number, x2: number, y2: number, offset: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: x1, y: y1, x2: x2, y2: y2 };
    const nx = -dy / len;
    const ny = dx / len;
    return { x: x1 + nx * offset, y: y1 + ny * offset, x2: x2 + nx * offset, y2: y2 + ny * offset };
};