import { create } from 'zustand';
import { setPersistPhaseListener, PersistPhase } from '../persistStorage';

// 保存状態インジケータ（refactoring B-3）。persist の書き込みフェーズを購読して UI に見せる。
// persist 本体（永続化対象ストア）とは分離した軽量ストア（これ自体は永続化しない）。
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface PersistStatusState { status: SaveStatus; }

export const usePersistStatus = create<PersistStatusState>(() => ({ status: 'idle' }));

let idleTimer: ReturnType<typeof setTimeout> | null = null;

// モジュール読込時にリスナー登録（このファイルを import するコンポーネントが1つでもあれば有効）。
setPersistPhaseListener((p: PersistPhase) => {
    usePersistStatus.setState({ status: p });
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    // 「保存済み」は2秒表示してから idle（非表示）へ戻す。error/saving/pending は保持。
    if (p === 'saved') {
        idleTimer = setTimeout(() => usePersistStatus.setState({ status: 'idle' }), 2000);
    }
});
