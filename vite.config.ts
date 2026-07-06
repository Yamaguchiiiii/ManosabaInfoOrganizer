import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// Tauri ビルド時は SW 不要（デスクトップアプリのため）。Web ビルドのみ PWA を有効化する。
// @ts-expect-error process is a nodejs global
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // konva を単一インスタンスに束ねる（"Several Konva instances detected" 警告の解消）。
  // 直接 import の konva と react-konva 同梱の konva が別実体になるのを防ぐ。
  resolve: { dedupe: ["konva", "react-konva"] },
  plugins: [
    react(),
    ...(isTauri ? [] : [VitePWA({
      registerType: "autoUpdate",
      // dev では SW を動かさない（HMR 干渉・キャッシュ混乱を避ける）。本番 web ビルドでのみ有効。
      devOptions: { enabled: false },
      workbox: {
        // コードのみ precache（巨大な logo.png 等は入れない）。データは IndexedDB なので対象外。
        globPatterns: ["**/*.{js,css,html}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      // includeAssets は指定しない（アイコンは manifest で参照。オフライン時はブラウザキャッシュ任せ）
      manifest: {
        name: "魔法少女の魔女裁判 推理ノート",
        short_name: "まのさばノート",
        description: "魔法少女の魔女裁判の推理整理・キャラクターノートアプリ",
        display: "standalone",
        background_color: "#1e1e1e",
        theme_color: "#1e1e1e",
        icons: [
          // TODO: 192/512 に最適化した専用アイコンに差し替える（現状は logo.png を流用）
          { src: "logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
        ],
      },
    })]),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
