import { useState, useEffect } from 'react';

// 画像のモジュールキャッシュ（refactoring A-7）。
// use-image はコンポーネントのアンマウントで画像を解放するため、ページ遷移やペイン再マウントの
// たびに map/アイコン画像の再デコードが走り、遷移が重くなる。ここでデコード済み HTMLImageElement を
// モジュールスコープに保持して使い回す（マップ3枚＋アイコン15枚＝固定枚数なのでメモリも一定）。
const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();

// data: URL は巨大かつ一時的なのでキャッシュしない（blob:/静的パスは対象）。
const cacheable = (src: string) => !src.startsWith('data:');

export const getImage = (src: string): Promise<HTMLImageElement> => {
    const hit = cache.get(src);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(src);
    if (pending) return pending;

    const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            try { if (img.decode) await img.decode(); } catch { /* decode 非対応でも onload で描画可 */ }
            if (cacheable(src)) cache.set(src, img);
            inflight.delete(src);
            resolve(img);
        };
        img.onerror = () => { inflight.delete(src); reject(new Error(`image load failed: ${src}`)); };
        img.src = src;
    });
    if (cacheable(src)) inflight.set(src, p);
    return p;
};

// use-image 互換（画像のみ返す。status が要る用途は use-image を使う）。
export const useCachedImage = (src: string | undefined): HTMLImageElement | undefined => {
    const [img, setImg] = useState<HTMLImageElement | undefined>(() => (src ? cache.get(src) : undefined));
    useEffect(() => {
        if (!src) { setImg(undefined); return; }
        const hit = cache.get(src);
        if (hit) { setImg(hit); return; }
        let alive = true;
        getImage(src).then(i => { if (alive) setImg(i); }).catch(() => { if (alive) setImg(undefined); });
        return () => { alive = false; };
    }, [src]);
    return img;
};
