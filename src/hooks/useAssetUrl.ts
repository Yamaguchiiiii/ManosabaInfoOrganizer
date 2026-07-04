import { useEffect, useState } from 'react';
import { isAssetKey, resolveAssetUrl, peekAssetUrl } from '../services/assetStore';

// NoteObject.content / assets の src を表示可能な URL に解決するフック（P2）。
// asset:// キーは IndexedDB の Blob から object URL を得る。静的パス / data: はそのまま返す。
export const useAssetUrl = (src?: string): string | undefined => {
    const [url, setUrl] = useState<string | undefined>(() => peekAssetUrl(src));

    useEffect(() => {
        if (!src) { setUrl(undefined); return; }
        if (!isAssetKey(src)) { setUrl(src); return; }
        let alive = true;
        resolveAssetUrl(src)
            .then(u => { if (alive) setUrl(u); })
            .catch(() => { if (alive) setUrl(undefined); });
        return () => { alive = false; };
    }, [src]);

    return url;
};
