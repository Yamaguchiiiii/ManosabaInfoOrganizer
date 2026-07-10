import { registerSW } from 'virtual:pwa-register';
import { showAppBanner, hideAppBanner } from './services/appBanner';

// revise No.15: 新SWへの無言差し替え（autoUpdate）をやめ、更新をバナーで通知してから
// ユーザー操作で反映する。Tauri では vite.config.ts の disable により no-op の registerSW が返る。
const updateSW = registerSW({
    onNeedRefresh() {
        showAppBanner({
            message: '新しいバージョンがあります。',
            actionLabel: '更新して再読み込み',
            onAction: () => { hideAppBanner(); void updateSW(true); },
        });
    },
});
