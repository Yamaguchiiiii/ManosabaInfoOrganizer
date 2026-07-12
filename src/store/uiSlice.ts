import { FloorId, SliceCreator, DialogRequest, NoteObject, NoteTargetType, ICON_FILES } from './types';
import { runNavigationGuard } from '../services/navigationGuard';

// F3: ノート全文検索のジャンプ先。NoteView が消費してタブ/IDを同期し、
// 対象の CanvasWorkspace が initialSelectId として選択状態を復元する。
export interface PendingNoteFocus {
    targetType: NoteTargetType;
    targetId: string;
    objId?: string;
}

export interface UiSlice {
    // オーバーレイダイアログ
    dialog: DialogRequest | null;
    showDialog: (req: DialogRequest) => Promise<string>;
    showAlert: (message: string, title?: string) => Promise<void>;
    showConfirm: (message: string, title?: string) => Promise<boolean>;
    closeDialog: (value: string) => void;

    activeFloor: FloorId; setActiveFloor: (floor: FloorId) => void;
    mode: 'create' | 'animate' | 'note'; setMode: (mode: 'create' | 'animate' | 'note') => void;
    // モード切替を1回の set にまとめる（setMode+setGraphEditMode+setSkullMode の3連発を排除）。#06/30-10
    enterMode: (mode: 'create' | 'animate' | 'note') => void;
    activeNoteTab: 'overview' | 'preset' | 'character' | 'misc'; setActiveNoteTab: (tab: 'overview' | 'preset' | 'character' | 'misc') => void;

    isGraphEditMode: boolean; setGraphEditMode: (isEdit: boolean) => void;
    isSkullMode: boolean; setSkullMode: (v: boolean) => void;
    // Animate: ContextPanel のイベント一覧のキャラフィルタ（20.md #10・persist除外）
    eventFilterChar: string | null; setEventFilterChar: (id: string | null) => void;
    // チュートリアル: 初回スポットライトツアーを見たか（persist）
    tutorialSeen: boolean; setTutorialSeen: (v: boolean) => void;
    sidebarWidth: number; setSidebarWidth: (width: number) => void;
    // ContextPanel（旧サイドバー本体）の折りたたみ状態（persist）。ui.md P2
    contextPanelCollapsed: boolean; setContextPanelCollapsed: (v: boolean) => void;

    // F6: DOM UIのテーマ（persist）。Konva内の色・紙面(#ECD2B3)は対象外。
    theme: 'dark' | 'sepia'; setTheme: (t: 'dark' | 'sepia') => void;

    // U2: Animate再生盤の配置モード（persist）。true=下部固定ドック（既定）、false=旧フローティング互換。
    playbackPinned: boolean; setPlaybackPinned: (v: boolean) => void;

    // Create/Animate で選択中のキャラアイコン（R1・旧 App ローカル state。persist除外）
    selectedIcons: string[];
    selectIcon: (icon: string, multi: boolean) => Promise<void>;
    clearIconSelection: () => void;

    // キャラクターノートで開いているキャラ（ICON_FILES の index）。20.md #07/04-7（persist＝前回開いていたキャラを記憶）
    noteCharIndex: number; setNoteCharIndex: (i: number) => void;

    // モバイルの文脈シート（下から出すシート）の開閉（R1・旧 MobileShell ローカル state。persist除外）
    mobileSheetOpen: boolean; setMobileSheetOpen: (v: boolean) => void;

    // Note のクリップボード（revise No.10）。旧 CanvasWorkspace ローカル state。
    // store化によりノート種別を跨いだ貼り付け・切替時の保持が可能になる（persist除外）。
    noteClipboard: NoteObject[]; setNoteClipboard: (objs: NoteObject[]) => void;

    // F3: ノート全文検索のジャンプ先（persist除外・NoteViewが消費後にnullへ戻す）
    pendingNoteFocus: PendingNoteFocus | null; setPendingNoteFocus: (f: PendingNoteFocus | null) => void;

    // ヘルプドロワー/チュートリアルツアーが開いているか（persist除外）。開いている間は
    // 背後のキャンバスショートカット(Delete/Ctrl+Z等)を無効化する（revise3 A-12）。
    helpOverlayOpen: boolean; setHelpOverlayOpen: (v: boolean) => void;

    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
}

// ダイアログの Promise resolver はモジュールスコープに保持する（永続化対象外にするため）。
// revise No.7: 表示中に別のshowDialogが来たら強制差し替え(旧resolverを''で解決)していたため、
// 並行するshowConfirmの先行側がユーザー操作なしでfalse扱いになっていた。直列キュー化で解消する。
interface PendingDialog { req: DialogRequest; resolve: (v: string) => void; }
let dialogResolver: ((value: string) => void) | null = null;
const dialogQueue: PendingDialog[] = [];

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
    dialog: null,
    showDialog: (req) => new Promise<string>((resolve) => {
        if (dialogResolver) { dialogQueue.push({ req, resolve }); return; } // 表示中→待機
        dialogResolver = resolve;
        set({ dialog: req });
    }),
    showAlert: (message, title) => get().showDialog({
        message, title,
        buttons: [{ label: 'OK', value: 'ok', variant: 'primary' }]
    }).then(() => {}),
    showConfirm: (message, title) => get().showDialog({
        message, title,
        buttons: [
            { label: 'キャンセル', value: 'cancel' },
            { label: 'OK', value: 'ok', variant: 'primary' }
        ]
    }).then(v => v === 'ok'),
    closeDialog: (value) => {
        const r = dialogResolver;
        const next = dialogQueue.shift();
        if (next) {
            dialogResolver = next.resolve;
            set({ dialog: next.req }); // 続けて次を表示
        } else {
            dialogResolver = null;
            set({ dialog: null });
        }
        if (r) r(value);
    },

    activeFloor: '1F', setActiveFloor: (floor) => set({ activeFloor: floor }),
    mode: 'create', setMode: (mode) => set({ mode }),
    // Create 専用モード（どくろ/グラフ編集）は Create 以外へ入るとき必ず解除する。1回の set で完結。
    // イベントフィルタ（20.md #10）は Animate 以外へ移動したら解除する。
    enterMode: (mode) => set(mode !== 'create'
        ? { mode, isGraphEditMode: false, isSkullMode: false, ...(mode !== 'animate' ? { eventFilterChar: null } : {}) }
        : { mode, eventFilterChar: null }),
    activeNoteTab: 'overview', setActiveNoteTab: (tab) => set({ activeNoteTab: tab }),

    isGraphEditMode: false, setGraphEditMode: (isEdit) => set({ isGraphEditMode: isEdit }),
    isSkullMode: false, setSkullMode: (v) => set({ isSkullMode: v }),
    eventFilterChar: null, setEventFilterChar: (id) => set({ eventFilterChar: id }),
    tutorialSeen: false, setTutorialSeen: (v) => set({ tutorialSeen: v }),
    sidebarWidth: 200, setSidebarWidth: (width) => set({ sidebarWidth: width }),
    contextPanelCollapsed: false, setContextPanelCollapsed: (v) => set({ contextPanelCollapsed: v }),

    theme: 'dark', setTheme: (t) => set({ theme: t }),

    playbackPinned: true, setPlaybackPinned: (v) => set({ playbackPinned: v }),

    // 初期値は先頭キャラ(桜庭エマ)。未選択のまま経路作成すると機能が破綻するため、
    // 起動時は必ずどちらかのキャラが選択された状態にする（resolve_error/23）。
    selectedIcons: [ICON_FILES[0]],
    clearIconSelection: () => set({ selectedIcons: [] }),
    selectIcon: async (icon, multi) => {
        const { selectedIcons } = get();
        if (multi) {
            set({ selectedIcons: selectedIcons.includes(icon)
                ? selectedIcons.filter(i => i !== icon) : [...selectedIcons, icon] });
            return;
        }
        // 同じキャラの再選択は遷移扱いしない
        if (selectedIcons.length === 1 && selectedIcons[0] === icon) return;
        // 単一キャラへ切替: 未保存の経路があればガードで確認（中止ならキャンセル）
        if (!(await runNavigationGuard())) return;
        set({ selectedIcons: [icon] });
    },

    mobileSheetOpen: false, setMobileSheetOpen: (v) => set({ mobileSheetOpen: v }),

    noteCharIndex: 0, setNoteCharIndex: (i) => set({ noteCharIndex: i }),

    noteClipboard: [], setNoteClipboard: (objs) => set({ noteClipboard: objs }),

    pendingNoteFocus: null, setPendingNoteFocus: (f) => set({ pendingNoteFocus: f }),

    helpOverlayOpen: false, setHelpOverlayOpen: (v) => set({ helpOverlayOpen: v }),

    _hasHydrated: false,
    setHasHydrated: (state) => set({ _hasHydrated: state }),
});
