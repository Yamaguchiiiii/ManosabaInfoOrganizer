import { create } from 'zustand';

// 汎用の非モーダル警告バナー基盤（revise No.5・No.15で共用）。
// ConflictBanner（他タブ更新検知）とは別枠で、IDBブロック通知やPWA更新通知などを1件だけ出す。
export interface AppBanner {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const useAppBanner = create<{ banner: AppBanner | null }>(() => ({ banner: null }));

export const showAppBanner = (b: AppBanner): void => useAppBanner.setState({ banner: b });
export const hideAppBanner = (): void => useAppBanner.setState({ banner: null });
