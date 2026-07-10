// 画像アセット（Blob）を IndexedDB の note-assets ストアに保持する（P2）。
// state には data URL(base64) の代わりに `asset://<id>` というキー文字列だけを置き、
// これで state の JSON サイズを桁で削減する（stringify/IDB put/GC 圧/undo履歴メモリの根治）。
//
// 静的パス（'./character/xxx.png' 等）と data:（旧データ）は asset:// ではないので、
// resolveAssetUrl はそれらをそのまま返す（表示側は分岐不要）。
import { openDB, ASSET_STORE } from '../store/persistStorage';

const PREFIX = 'asset://';

export const isAssetKey = (src?: string): src is string => !!src && src.startsWith(PREFIX);
const idOf = (key: string) => key.slice(PREFIX.length);

/** Blob を保存し `asset://<id>` キーを返す。 */
export const putAsset = async (blob: Blob): Promise<string> => {
    const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        tx.objectStore(ASSET_STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    return `${PREFIX}${id}`;
};

/** 既存キーに Blob を書き戻す（バックアップのインポートで元の asset:// キーを保つため）。 */
export const putAssetAtKey = async (key: string, blob: Blob): Promise<void> => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        tx.objectStore(ASSET_STORE).put(blob, idOf(key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getAssetBlob = async (key: string): Promise<Blob | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readonly');
        const req = tx.objectStore(ASSET_STORE).get(idOf(key));
        req.onsuccess = () => resolve((req.result as Blob) ?? null);
        req.onerror = () => reject(req.error);
    });
};

export const deleteAsset = async (key: string): Promise<void> => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        tx.objectStore(ASSET_STORE).delete(idOf(key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const listAssetKeys = async (): Promise<string[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readonly');
        const req = tx.objectStore(ASSET_STORE).getAllKeys();
        req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(k => `${PREFIX}${String(k)}`));
        req.onerror = () => reject(req.error);
    });
};

// asset:// → object URL（モジュールスコープでキャッシュし、同一キーで使い回す）。
const urlCache = new Map<string, string>();

export const resolveAssetUrl = async (src: string): Promise<string> => {
    if (!isAssetKey(src)) return src; // 静的パス / data: はそのまま
    const hit = urlCache.get(src);
    if (hit) return hit;
    const blob = await getAssetBlob(src);
    if (!blob) throw new Error(`missing asset: ${src}`);
    const url = URL.createObjectURL(blob);
    urlCache.set(src, url);
    return url;
};

// 同期版（初期表示用）。asset:// で未解決なら undefined を返す。
export const peekAssetUrl = (src?: string): string | undefined => {
    if (!src) return undefined;
    if (!isAssetKey(src)) return src;
    return urlCache.get(src);
};
