import { toast } from './toast';

// ストレージの健全性チェック（smartphone.md E2）。
// iOS Safari の ITP による IndexedDB 退去や容量超過でデータ全損するのを予防する:
//  1) navigator.storage.persist() で「永続化」を要求（自動退去されにくくする）
//  2) estimate() で使用率をチェックし、逼迫していればバックアップ書き出しを促す
export const checkStorageHealth = async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    try {
        if (navigator.storage.persist) {
            await navigator.storage.persist();
        }
        if (navigator.storage.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            if (usage && quota && quota > 0) {
                const ratio = usage / quota;
                if (ratio > 0.8) {
                    toast.error(`保存容量が残りわずかです（約${Math.round(ratio * 100)}%使用）。ヘルプからバックアップを書き出しておくことをおすすめします。`);
                }
            }
        }
    } catch {
        /* 非対応環境（古いブラウザ等）は無視 */
    }
};
