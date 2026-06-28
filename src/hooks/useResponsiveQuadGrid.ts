import { useState, useEffect, RefObject } from 'react';

// 代表的なマップ画像のアスペクト比 (w/h)。floor_1≈1.85 / floor_2≈2.11 / floor_b1≈1.75 の概ね中央値。
// 4ペインの配置(2x2 / 縦1x4 / 横4x1)のうち、マップ表示が最大になるものを選ぶための基準。
const MAP_ASPECT = 1.9;

export interface QuadGridStyle {
    gridTemplateColumns: string;
    gridTemplateRows: string;
}

const LAYOUTS = {
    grid:    { gridTemplateColumns: '1fr 1fr',         gridTemplateRows: '1fr 1fr' },          // 2x2
    column:  { gridTemplateColumns: '1fr',             gridTemplateRows: '1fr 1fr 1fr 1fr' },  // 縦積み(1列x4行)
    row:     { gridTemplateColumns: '1fr 1fr 1fr 1fr', gridTemplateRows: '1fr' },              // 横並び(4列x1行)
} as const;

/**
 * #06/28-3:58-8: ウィンドウ(コンテナ)サイズとマップのアスペクト比から、4ペインを
 * 2x2 / 縦1x4 / 横4x1 のどれで並べるとマップが最大表示になるかを判定し、
 * grid-template を返す。各レイアウトでのセル内マップ高さ(= min(cellW/aspect, cellH))を比較する。
 */
export const useResponsiveQuadGrid = (ref: RefObject<HTMLElement | null>): QuadGridStyle => {
    const [style, setStyle] = useState<QuadGridStyle>(LAYOUTS.grid);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const compute = () => {
            const W = el.clientWidth;
            const H = el.clientHeight;
            if (W <= 0 || H <= 0) return;
            const a = MAP_ASPECT;

            // 各配置でのマップ表示高さ(大きいほどマップが大きく見える)
            const scoreGrid   = Math.min((W / 2) / a, H / 2);  // 2x2:   セル W/2 x H/2
            const scoreColumn = Math.min(W / a,       H / 4);  // 1x4縦: セル W   x H/4
            const scoreRow    = Math.min((W / 4) / a, H);      // 4x1横: セル W/4 x H

            const best = Math.max(scoreGrid, scoreColumn, scoreRow);
            const next = best === scoreColumn ? LAYOUTS.column
                       : best === scoreRow    ? LAYOUTS.row
                       : LAYOUTS.grid;

            setStyle(prev => (prev.gridTemplateColumns === next.gridTemplateColumns && prev.gridTemplateRows === next.gridTemplateRows) ? prev : next);
        };

        compute();
        const obs = new ResizeObserver(compute);
        obs.observe(el);
        return () => obs.disconnect();
    }, [ref]);

    return style;
};
