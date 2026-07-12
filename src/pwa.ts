import { registerSW } from 'virtual:pwa-register';

// 新SWを検知したら確認なしで即座に反映する（完全自動更新）。
// updateSW(true) は SKIP_WAITING を送った後、controllerchange で自動リロードする。
// Tauri では vite.config.ts の disable により no-op の registerSW が返る。
const updateSW = registerSW({
    onNeedRefresh() {
        void updateSW(true);
    },
});
