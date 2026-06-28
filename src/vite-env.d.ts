/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Google AdSense（Web版のみ）。未設定ならハウス枠にフォールバックする。
    readonly VITE_ADSENSE_CLIENT?: string; // 例: ca-pub-XXXXXXXXXXXXXXXX
    readonly VITE_ADSENSE_SLOT?: string;   // 広告ユニットのスロットID
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
