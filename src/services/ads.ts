// 広告アダプタ。Web版のみ Google AdSense を出し、デスクトップ(Tauri)や未設定時は無効化する。
// 実IDは環境変数（VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT）で注入し、コードに埋め込まない。
import { isWeb } from './platform';

export interface AdConfig {
    client: string; // 例: ca-pub-XXXXXXXXXXXXXXXX
    slot: string;   // 広告ユニットのスロットID
}

const ADSENSE_SCRIPT_ID = 'adsense-sdk';

/** 環境変数から AdSense 設定を取得（未設定なら null）。 */
export const getAdConfig = (): AdConfig | null => {
    const client = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim();
    const slot = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined)?.trim();
    if (!client || !slot) return null;
    return { client, slot };
};

/** Web かつ設定済みのときだけ AdSense を表示する。デスクトップはローカルオリジンのため不可。 */
export const isWebAdsEnabled = (): boolean => isWeb() && getAdConfig() !== null;

/** AdSense ローダースクリプトを一度だけ <head> に注入する（Web のみ・冪等）。 */
export const ensureAdSenseLoaded = (): void => {
    if (!isWebAdsEnabled()) return;
    if (typeof document === 'undefined') return;
    if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
    const cfg = getAdConfig();
    if (!cfg) return;
    const s = document.createElement('script');
    s.id = ADSENSE_SCRIPT_ID;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.client)}`;
    document.head.appendChild(s);
};

/** 1つの <ins class="adsbygoogle"> に広告を1回だけ要求する。 */
export const pushAd = (): void => {
    if (!isWebAdsEnabled()) return;
    try {
        const w = window as unknown as { adsbygoogle?: unknown[] };
        (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
        // スクリプト未ロード等は無視（次回マウントで再試行）
    }
};
