import { create } from 'zustand';

// 複数タブ/インスタンス（PWA + ブラウザ等）の同時編集によるデータ全損を防ぐ調停役。smartphone.md E1
// 各インスタンスは書き込み時に BroadcastChannel で通知し、他インスタンスが書き込んだら
// 「別のタブでデータが更新された」フラグを立てて UI にバナーを出す（保存自体は止めず、
// ユーザーに再読み込みを促すことで最新状態の取り違えを防ぐ）。
const CHANNEL_NAME = 'manosaba-state';
const clientId = Math.random().toString(36).slice(2);

interface CoordinatorState {
    /** 他タブ/インスタンスがデータを更新したか（このタブのメモリ状態は古い可能性がある） */
    externalUpdate: boolean;
}

export const useCoordinator = create<CoordinatorState>(() => ({ externalUpdate: false }));

let channel: BroadcastChannel | null = null;
try {
    if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (e: MessageEvent) => {
            const data = e.data as { type?: string; clientId?: string } | null;
            if (data?.type === 'wrote' && data.clientId && data.clientId !== clientId) {
                // 既にフラグが立っていれば setState を繰り返さない（バナーの再描画抑制）
                if (!useCoordinator.getState().externalUpdate) {
                    useCoordinator.setState({ externalUpdate: true });
                }
            }
        };
    }
} catch { /* BroadcastChannel 非対応環境では単一タブ扱い */ }

/** 永続化書き込みが成功したときに呼ぶ（他タブへ通知）。 */
export const notifyPersistWrote = (): void => {
    try { channel?.postMessage({ type: 'wrote', clientId }); } catch { /* noop */ }
};

/** バナーを閉じる（ユーザーが警告を了解した）。 */
export const dismissExternalUpdate = (): void => {
    useCoordinator.setState({ externalUpdate: false });
};
