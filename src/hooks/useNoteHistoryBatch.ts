import { useRef, useCallback, useEffect } from 'react';

export interface UseNoteHistoryBatchResult {
    saveHistoryOnceThenSkip: () => void;
    commitThrottled: (fn: () => void) => void;
}

// 連続操作(ドラッグ/カラーピッカー/スライダー)のundo履歴・コミットを間引く。
export const useNoteHistoryBatch = (saveNoteHistory: () => void): UseNoteHistoryBatchResult => {
    // 高速連続操作（ドラッグ等）を1回のundo履歴に融合する。バッチ先頭でのみ履歴を保存する。
    const batchSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveHistoryOnceThenSkip = useCallback(() => {
        if (!batchSaveRef.current) {
            // バッチ先頭: 変更前の現在状態を保存
            saveNoteHistory();
        } else {
            clearTimeout(batchSaveRef.current);
        }
        batchSaveRef.current = setTimeout(() => {
            batchSaveRef.current = null;
        }, 300);
    }, [saveNoteHistory]);

    // カラーピッカー/スライダーなど「連続入力」のコミットを間引く（先頭で即時1回＋末尾で最終値）。
    // これをしないと、ドラッグ中に毎フレーム updateNoteObject→キャンバス全再描画が走り、
    // 極めて重く・OOM になっていた（永続化側は store の debounce で別途対策済み）。
    const propCommitRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; last: (() => void) | null }>({ timer: null, last: null });
    const commitThrottled = useCallback((fn: () => void) => {
        const r = propCommitRef.current;
        r.last = fn;
        if (r.timer) return;
        const run = () => {
            if (r.last) { const f = r.last; r.last = null; r.timer = setTimeout(run, 100); f(); }
            else { r.timer = null; }
        };
        run();
    }, []);

    // アンマウント時、間引き中の最終コミットを flush してからタイマーを破棄する（値落ち/リーク防止）。refactoring A-8-1
    useEffect(() => () => {
        const r = propCommitRef.current;
        if (r.timer) { clearTimeout(r.timer); r.timer = null; }
        if (r.last) { const f = r.last; r.last = null; f(); }
    }, []);

    return { saveHistoryOnceThenSkip, commitThrottled };
};
