import { useState, useEffect } from 'react';

// 画面幅から viewport 種別を返す（smartphone.md M0）。
// 境界: <768px mobile / <1100px tablet / それ以上 desktop。
// レイアウトの出し分けにのみ使い、ビジネスロジックは共通フックに置く（CLAUDE.md 準拠）。
export type Viewport = 'mobile' | 'tablet' | 'desktop';

const compute = (): Viewport => {
    if (typeof window === 'undefined') return 'desktop';
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 横向きスマホ対策: 主ポインタが指(coarse)かつ高さが極端に低い端末は幅に関わらず mobile。
    // w < 1000 の条件でタブレット横(1024+)を除外する。
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (w < 768 || (coarse && h < 500 && w < 1000)) return 'mobile';
    if (w < 1100) return 'tablet';
    return 'desktop';
};

export const useViewport = (): Viewport => {
    const [vp, setVp] = useState<Viewport>(compute);
    useEffect(() => {
        // visualViewport も監視（モバイルのソフトキーボード/回転で innerWidth 変化を拾う）
        const onResize = () => setVp(compute());
        window.addEventListener('resize', onResize);
        window.visualViewport?.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.visualViewport?.removeEventListener('resize', onResize);
        };
    }, []);
    return vp;
};
