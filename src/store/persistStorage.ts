// カスタム PersistStorage（zustand persist 用）。
// createJSONStorage を使うと set() のたびに全 state を JSON.stringify するため、
// base64 画像を含む巨大 state ではフレーム落ち・GC 圧の主因になっていた（resolve_error/19.md 共通原因A）。
// ここではオブジェクト参照を受け取り、変更検知はトップレベルキーの参照比較のみで行い、
// 実際の直列化(JSON.stringify)は debounce 後・アイドル時に最大1回だけ実行する。
//
// ⚠ 重要: この設計は「store 内でイミュータブル更新（spread）する」ことが前提。
//   スライスを直接ミューテートすると参照が変わらず変更が persist されない。直接変更は禁止。

import { PersistStorage, StorageValue } from 'zustand/middleware';
import { notifyPersistWrote } from '../services/persistCoordinator';

const DB_NAME = 'mystery-map-db';
const STORE_NAME = 'app-state';
// 画像実体(Blob)を state から分離して置くストア（P2）。openDB はこの1ファイルに集約する
// （別バージョンで同一DBを開くと VersionError になるため、ここが唯一の open 地点）。
export const ASSET_STORE = 'note-assets';
const DB_VERSION = 2;
const PERSIST_DEBOUNCE_MS = 500;

export const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
        };
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
};

// 生の文字列 get/put（バックアップ機能などからも使う）
export const idbGetString = async (name: string): Promise<string | null> => {
    try {
        const db = await openDB();
        const value = await new Promise<string | undefined>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        if (value) return value;

        // 旧 localStorage 保存分があれば IDB へ移行して返す。
        // TODO(2026-09): この移行パスを削除（2026-06 以前の localStorage 保存ユーザーの移行猶予）
        const localValue = localStorage.getItem(name);
        if (localValue) {
            await idbPutString(name, localValue);
            localStorage.removeItem(name);
            return localValue;
        }
        return null;
    } catch {
        return null;
    }
};

export const idbPutString = async (name: string, value: string): Promise<void> => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const idbDelete = async (name: string): Promise<void> => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// 保存状態インジケータ用（refactoring.md B-3）。未購読の間は no-op。
export type PersistPhase = 'pending' | 'saving' | 'saved' | 'error';
let notifyPhase: (p: PersistPhase) => void = () => {};
export const setPersistPhaseListener = (fn: (p: PersistPhase) => void): void => { notifyPhase = fn; };

export interface IdbPersistStorage<S> extends PersistStorage<S> {
    /** 未書き込み分を同期的に確定させる（バックアップのエクスポート前・タブ離脱時に使う） */
    flushNow: () => Promise<void>;
}

export const createIdbPersistStorage = <S>(): IdbPersistStorage<S> => {
    let pending: { name: string; value: StorageValue<S> } | null = null;
    let lastWritten: StorageValue<S> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // トップレベルキーの参照比較。partialize は毎回新オブジェクトを返すが、変更のなかった
    // スライス（notes/presets/nodes…）は同一参照のままなので「全キー同一参照」なら何もしない。
    const changed = (prev: StorageValue<S> | null, next: StorageValue<S>): boolean => {
        if (!prev) return true;
        if (prev.version !== next.version) return true;
        const a = prev.state as Record<string, unknown>;
        const b = next.state as Record<string, unknown>;
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) if (!Object.is(a[k], b[k])) return true;
        return false;
    };

    const writeNow = async (): Promise<void> => {
        timer = null;
        if (!pending) return;
        const { name, value } = pending;
        pending = null;
        notifyPhase('saving');
        try {
            const str = JSON.stringify(value); // ← 唯一の stringify 地点（最大1回/500ms・アイドル時）
            await idbPutString(name, str);
            lastWritten = value;
            notifyPhase('saved');
            notifyPersistWrote(); // 他タブ/インスタンスへ「保存した」ことを通知（E1 競合検知）
        } catch {
            pending = pending ?? { name, value }; // 失敗時は次回同じ値でも再試行できるようにする
            notifyPhase('error');
        }
    };

    const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => { void writeNow(); }, { timeout: 1000 });
            } else {
                void writeNow(); // WebView2 等のフォールバック
            }
        }, PERSIST_DEBOUNCE_MS);
    };

    const flushNow = async (): Promise<void> => {
        if (timer) { clearTimeout(timer); timer = null; }
        await writeNow();
    };

    // タブ非表示/離脱時に未書き込みをベストエフォートで保存する
    if (typeof window !== 'undefined') {
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') void flushNow();
        });
        window.addEventListener('pagehide', () => { void flushNow(); });
    }

    return {
        getItem: async (name) => {
            const str = await idbGetString(name);
            if (!str) return null;
            try { return JSON.parse(str) as StorageValue<S>; } catch { return null; }
        },
        setItem: (name, value) => {
            if (!changed(pending?.value ?? lastWritten, value)) return; // 参照比較のみ・stringify しない
            notifyPhase('pending');
            pending = { name, value };
            schedule();
        },
        removeItem: async (name) => { await idbDelete(name); },
        flushNow,
    };
};
