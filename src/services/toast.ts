import { create } from 'zustand';

// 非ブロッキングの操作フィードバック（ui.md P1）。保存/コピー/貼り付け等の無音操作に通知を出す。
// DialogHost（モーダル確認）とは別物。永続化しない軽量ストア。
export interface ToastItem {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
}

interface ToastState { toasts: ToastItem[]; }

export const useToastStore = create<ToastState>(() => ({ toasts: [] }));

let seq = 0;

const show = (message: string, type: ToastItem['type'] = 'info', durationMs = 2500): void => {
    const id = ++seq;
    useToastStore.setState(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
        useToastStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, durationMs);
};

export const toast = {
    show,
    info: (m: string) => show(m, 'info'),
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error', 4000),
};
