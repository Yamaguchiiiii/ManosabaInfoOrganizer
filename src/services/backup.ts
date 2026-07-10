// データのエクスポート/インポート（バックアップ）。refactoring B-1。
// 全データは単一 IndexedDB にあり、サイトデータ削除・iOS の退避・DB 破損で全損し得るため自衛手段を提供する。
//
// 実装は Web 標準（Blob + <a download> / <input type=file>）のみ。Tauri(WebView2) でもそのまま動く。
// ネイティブのファイルダイアログ（@tauri-apps/plugin-dialog/fs）はより良い UX の将来拡張として保留。
import { flushPersistNow } from '../store';
import { idbGetString, idbPutString, REV_KEY } from '../store/persistStorage';
import { listAssetKeys, getAssetBlob, putAssetAtKey } from './assetStore';

// F4: 手動スナップショットも同じ zustand persist キーを読み書きするため export して共用する。
export const STORAGE_KEY = 'mystery-map-storage';

// v2: 画像は state から分離され asset:// キーになったため、Blob 実体も base64 で同梱する。
// v1（画像が data URL で state 内）も import 可能（assets 無し扱い）。
interface BackupFile {
    app: 'manosaba-info-organizer';
    formatVersion: 1 | 2;
    exportedAt: string;                      // ISO8601
    storageKey: string;
    payload: string;                         // IDB に入っている JSON 文字列そのまま（zustand の StorageValue）
    assets?: Record<string, string>;         // v2: asset:// キー → data URL(base64)
}

// F4: 手動スナップショットでも同じ変換が必要なため export して共用する。
export const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

const pad = (n: number) => n.toString().padStart(2, '0');
const defaultFileName = () => {
    const d = new Date();
    return `manosaba-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
};

/** 現在の全データ（state + 画像アセット）を JSON ファイルとしてダウンロードする。 */
export const exportBackup = async (): Promise<void> => {
    await flushPersistNow(); // 未書き込みの編集を確定させてから読む
    const payload = await idbGetString(STORAGE_KEY);
    if (!payload) throw new Error('保存データがありません');

    // 画像アセット(Blob)を base64 で同梱する（state には asset:// キーしか無いため）
    const assets: Record<string, string> = {};
    for (const key of await listAssetKeys()) {
        const blob = await getAssetBlob(key);
        if (blob) assets[key] = await blobToDataUrl(blob);
    }

    const file: BackupFile = {
        app: 'manosaba-info-organizer',
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        storageKey: STORAGE_KEY,
        payload,
        assets,
    };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** バックアップJSONの中身を検証して IDB へ書き戻し、リロードで復元する。 */
export const importBackupFromText = async (text: string): Promise<void> => {
    let parsed: Partial<BackupFile>;
    try {
        parsed = JSON.parse(text) as Partial<BackupFile>;
    } catch {
        throw new Error('バックアップファイルの形式が不正です');
    }
    if (parsed.app !== 'manosaba-info-organizer' || typeof parsed.payload !== 'string') {
        throw new Error('バックアップファイルの形式が不正です');
    }
    try {
        JSON.parse(parsed.payload); // payload 自体の破損検査
    } catch {
        throw new Error('バックアップの内容が破損しています');
    }
    // v2: 画像アセットを元の asset:// キーのまま IDB へ復元する
    if (parsed.assets) {
        for (const [key, dataUrl] of Object.entries(parsed.assets)) {
            try { await putAssetAtKey(key, await dataUrlToBlob(dataUrl)); } catch { /* 個別失敗は許容 */ }
        }
    }
    // revise No.20: rev も進めておく（他タブがインポート前のrevで書き込もうとしたら弾かれる）
    const currentRev = Number(await idbGetString(REV_KEY)) || 0;
    await idbPutString(REV_KEY, String(currentRev + 1));
    await idbPutString(STORAGE_KEY, parsed.payload);
    // rehydrate 経路（migrate 含む）に確実に乗せるため、書き戻し後はリロードするのが最も安全。
    location.reload();
};

/** ファイル選択ダイアログを開き、選ばれた JSON のテキストを返す（キャンセル時 null）。 */
export const pickBackupFile = (): Promise<string | null> =>
    new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        };
        input.click();
    });
