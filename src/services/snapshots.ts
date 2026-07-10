// F4: 手動スナップショット（バージョン退避）。バックアップのエクスポート/インポートと同じ
// 変換（画像Blob⇔dataURL）を使い、IndexedDB内に直近5件だけ保持する簡易バージョニング。
import { idbGetString, idbPutString, idbPut, idbGet, idbGetAll, idbDelete, REV_KEY, SNAPSHOT_STORE } from '../store/persistStorage';
import { flushPersistNow } from '../store';
import { STORAGE_KEY, blobToDataUrl, dataUrlToBlob } from './backup';
import { listAssetKeys, getAssetBlob, putAssetAtKey } from './assetStore';

const MAX_SNAPSHOTS = 5;

interface Snapshot {
    id: string;
    name: string;
    createdAt: string;
    payload: string;
    assets: Record<string, string>;
}

export interface SnapshotMeta {
    id: string;
    name: string;
    createdAt: string;
}

/** 現在の状態をスナップショットとして保存する。6件目以降は最古のものから削除する。 */
export const saveSnapshot = async (name: string): Promise<void> => {
    await flushPersistNow();
    const payload = await idbGetString(STORAGE_KEY);
    if (!payload) throw new Error('保存データがありません');

    const assets: Record<string, string> = {};
    for (const key of await listAssetKeys()) {
        const blob = await getAssetBlob(key);
        if (blob) assets[key] = await blobToDataUrl(blob);
    }

    const snap: Snapshot = { id: `snap_${Date.now()}`, name, createdAt: new Date().toISOString(), payload, assets };
    await idbPut(SNAPSHOT_STORE, snap, snap.id);

    const all = await idbGetAll<Snapshot>(SNAPSHOT_STORE);
    all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .slice(0, Math.max(0, all.length - MAX_SNAPSHOTS))
        .forEach(s => void idbDelete(SNAPSHOT_STORE, s.id));
};

export const listSnapshots = async (): Promise<SnapshotMeta[]> => {
    const all = await idbGetAll<Snapshot>(SNAPSHOT_STORE);
    return all
        .map(({ id, name, createdAt }) => ({ id, name, createdAt }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // 新しい順
};

/** スナップショットを復元し、rehydrate経路に乗せるためリロードする。 */
export const restoreSnapshot = async (id: string): Promise<void> => {
    const s = await idbGet<Snapshot>(SNAPSHOT_STORE, id);
    if (!s) throw new Error('スナップショットが見つかりません');
    for (const [key, dataUrl] of Object.entries(s.assets)) {
        try { await putAssetAtKey(key, await dataUrlToBlob(dataUrl)); } catch { /* 個別失敗は許容 */ }
    }
    // revise No.20: rev も進めておく（他タブが復元前のrevで書き込もうとしたら弾かれる）
    const currentRev = Number(await idbGetString(REV_KEY)) || 0;
    await idbPutString(REV_KEY, String(currentRev + 1));
    await idbPutString(STORAGE_KEY, s.payload);
    location.reload();
};

export const deleteSnapshot = async (id: string): Promise<void> => {
    await idbDelete(SNAPSHOT_STORE, id);
};
