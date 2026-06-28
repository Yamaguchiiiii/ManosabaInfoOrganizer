import { isMac } from '../services/platform';

// アプリ内ショートカットの唯一の定義元。Kbd/HelpDrawer/Tour すべてここを参照する。
// keys は表記用トークン。'Mod' は OS により ⌘ / Ctrl に整形される。

export interface ShortcutItem {
    /** 表示するキー群（複数行の組み合わせは ' / ' を含む文字列1つにせず、keys 配列で1コンボを表す） */
    keys: string[];
    /** 説明 */
    desc: string;
}

export interface ShortcutGroup {
    page: 'note' | 'create' | 'animate';
    title: string;
    items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        page: 'note',
        title: 'ノート（Canvas）',
        items: [
            { keys: ['Mod', 'Z'], desc: '元に戻す（Undo）' },
            { keys: ['Mod', 'C'], desc: 'コピー' },
            { keys: ['Mod', 'X'], desc: '切り取り' },
            { keys: ['Mod', 'V'], desc: '貼り付け' },
            { keys: ['Delete'], desc: '選択を削除（Backspace も可）' },
            { keys: ['Mod', 'G'], desc: 'グループ化（2個以上選択時）' },
            { keys: ['Mod', 'Shift', 'G'], desc: 'グループ解除' },
            { keys: ['Shift', 'Click'], desc: '複数選択（トグル）' },
            { keys: ['W'], desc: '前のCanvasペインへ（↑ も可）' },
            { keys: ['S'], desc: '次のCanvasペインへ（↓ も可）' },
            { keys: ['A'], desc: '前のキャラへ（キャラノート、← も可）' },
            { keys: ['D'], desc: '次のキャラへ（キャラノート、→ も可）' },
            { keys: ['Esc'], desc: '配置モード解除／テキスト編集を終了' },
        ],
    },
    {
        page: 'create',
        title: 'Create（経路作成）',
        items: [
            { keys: ['Mod', 'Z'], desc: '元に戻す（グラフ編集モード時）' },
            { keys: ['Esc'], desc: 'ノード接続をキャンセル' },
            { keys: ['Hover'], desc: 'ホバー中のペインが編集対象フロア' },
            { keys: ['Shift', 'Click'], desc: 'ICONSで複数キャラを選択' },
        ],
    },
    {
        page: 'animate',
        title: 'Animate（再生）',
        items: [
            { keys: ['Space'], desc: '再生 / 一時停止' },
        ],
    },
];

// 各ページのクイックスタート（ヘルプの "Quick Start" タブ）
export interface QuickStartCard {
    page: 'create' | 'animate' | 'note';
    title: string;
    points: string[];
}

export const QUICK_START: QuickStartCard[] = [
    {
        page: 'create',
        title: 'Create — 経路をつくる',
        points: [
            'マップは2F/1F/B1の4ペイン。ホバーしたペインが編集対象。',
            '編集モードでノードを置き、クリックで接続して経路網を作る。',
            'キャラを選んでStart/Goalを指定し、Save Pathで行動を保存。',
        ],
    },
    {
        page: 'animate',
        title: 'Animate — 再生する',
        points: [
            'Space または再生操作盤の▶でアニメーションを再生／停止。',
            '操作盤はドラッグで移動でき、速度や再生位置も変更できる。',
            '右下の事件ノートCanvasで状況メモを重ねられる。',
        ],
    },
    {
        page: 'note',
        title: 'Note — 推理を整理する',
        points: [
            '全体／事件／キャラクター／メモの4種類のノート。',
            'Canvasに図形・テキスト・画像（立ち絵）を配置できる。',
            'コピー/貼り付け・グループ化・Undoに対応（ショートカット参照）。',
        ],
    },
];

/** 'Mod' を OS に応じて整形し、表示用のキー配列を返す。 */
export const formatKeys = (keys: string[]): string[] =>
    keys.map(k => {
        if (k === 'Mod') return isMac() ? '⌘' : 'Ctrl';
        if (k === 'Shift') return isMac() ? '⇧' : 'Shift';
        if (k === 'Space') return '␣ Space';
        if (k === 'Delete') return 'Del';
        return k;
    });
