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

// 各ページのクイックスタート（ヘルプの "Quick Start" タブ）。
// このアプリの機能（Edit Map Graph=高度なマップ編集 を除く）をひととおり説明する。
export interface QuickStartCard {
    page: 'create' | 'animate' | 'note' | 'general';
    title: string;
    points: string[];
}

export const QUICK_START: QuickStartCard[] = [
    {
        page: 'general',
        title: 'はじめに — 3つのページ',
        points: [
            'サイドバーで Create／Animate／Note を切り替えます。',
            'Create で登場人物の行動経路をつくり、Animate で再生して検証、Note で推理を整理します。',
            '作業内容は自動保存され、再読み込みしても復元されます。',
            '右下の「?」ボタン・F1・Shift+/ でこのヘルプをいつでも開けます。',
        ],
    },
    {
        page: 'create',
        title: 'Create — 行動経路をつくる',
        points: [
            'ICONS からキャラを選択（Shift+クリックで複数選択）。',
            'マップは 2F／1F／B1 を同時表示。ホバーしたペインが編集対象フロアです。',
            '地点をクリックして Start→Goal を指定。右の地点一覧からも選べ、選ぶと次の入力欄へ自動で進みます。',
            '「Add Stop」で経由地を追加し、各地点の滞在時間も設定できます。',
            '「Save Path」で選択キャラの行動として保存（キャラ未選択なら保存先を選ぶウィンドウが出ます）。',
            'sync（⏱）で他キャラとの「すれ違い／合流／同行」を設定し、到達時刻を合わせられます（同じ地点の2回目の訪問も指定可）。',
            'どくろ（💀）でキャラを死亡設定（B1の牢獄に表示）。別ページへ移ると自動解除されます。',
            '未保存の経路があるまま移動しようとすると保存確認が出ます。元に戻すは Ctrl+Z。',
        ],
    },
    {
        page: 'animate',
        title: 'Animate — 再生して検証する',
        points: [
            'Space または操作盤の ▶ で再生／一時停止。操作盤はドラッグで移動でき、プリセット・速度・再生位置・全体時間を表示します。',
            'マップは全フロア同時表示。ウィンドウ幅に応じて 2x2／縦1x4 に自動レイアウトします。',
            'キャラは経路どおりに移動し、階段で別フロアへ、死亡キャラは B1 牢獄に表示されます。',
            '右下の「事件ノート」Canvas に状況メモを重ねられます（左のツールで図形/テキスト/画像、画像一覧から立ち絵も配置）。',
        ],
    },
    {
        page: 'note',
        title: 'Note — 推理を整理する',
        points: [
            '4種類: 全体ノート／事件ノート／キャラクターノート／メモ。サイドバーから切替。',
            'ツール: テキスト・ペン（フリーハンド）・図形（円/三角/四角/直線/矢印/曲線）・画像。',
            '画像は「Images」（追加分）と「Character Images」（全キャラの立ち絵）から配置。図形はドラッグでサイズ指定、画像はクリックで比率維持配置。',
            '選択: クリック／Shift+クリックで複数選択。Ctrl+G グループ化／Ctrl+Shift+G 解除。',
            '編集: コピー/切り取り/貼り付け（Ctrl+C/X/V）・削除（Del）・元に戻す（Ctrl+Z）。',
            'テキストはダブルクリックで編集、Enter で確定・Shift+Enter で改行。',
            '4ペイン表示で4枚を並べて編集（W/S・↑/↓でペイン切替）。キャラノートは A/D・←/→でキャラ切替、立ち絵がデフォルト配置されます。',
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
