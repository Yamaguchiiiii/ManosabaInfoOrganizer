// プラットフォーム判定アダプタ。
// UIコンポーネントから直接 window.__TAURI__ 等を参照しないための抽象化（CLAUDE.md 準拠）。

/** デスクトップ(Tauri/WebView2)上で動作しているか。 */
export const isTauri = (): boolean => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    // Tauri v2 は __TAURI_INTERNALS__ を注入する。v1/グローバル公開時の保険も併せて見る。
    return !!(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
};

/** ブラウザ(Web)上で動作しているか。 */
export const isWeb = (): boolean => !isTauri();
