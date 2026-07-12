// data-tour 属性値の単一ソース。JSX 側（ハイライト対象に data-tour を付ける箇所）と
// STEPS 側（SpotlightTour の target）の両方がここを参照する。文字列の二重管理をやめ、
// UI 改修時のハイライト退行（#06/30-1: 古い版の上書きで data-tour が消えた事故）を防ぐ。
// ⚠ この属性はチュートリアルのハイライトに必須。UI を書き換えても必ず残すこと。
export const TOUR_TARGETS = {
    sidebarPages: 'sidebar-pages',
    sidebarIcons: 'sidebar-icons',
    noteTabs: 'note-tabs',
    createMaps: 'create-maps',
    animatePlayback: 'animate-playback',
    helpButton: 'help-button',
    // ガイド付きチュートリアル（#06/30-2 hands-on）で使う追加ターゲット
    noteCharacterPicker: 'note-character-picker',
    // モバイル: 上部バーの ☰（文脈シートを開くボタン）。0711_2 #3
    mobileMenu: 'mobile-menu',
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];
