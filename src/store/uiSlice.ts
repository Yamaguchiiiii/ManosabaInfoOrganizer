import { FloorId, SliceCreator, DialogRequest } from './types';
import { runNavigationGuard } from '../services/navigationGuard';

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

    // Create/Animate で選択中のキャラアイコン（R1・旧 App ローカル state。persist除外）
    selectedIcons: string[];
    selectIcon: (icon: string, multi: boolean) => Promise<void>;
    clearIconSelection: () => void;

    // キャラクターノートで開いているキャラ（ICON_FILES の index）。20.md #07/04-7（persist＝前回開いていたキャラを記憶）
    noteCharIndex: number; setNoteCharIndex: (i: number) => void;

    // モバイルの文脈シート（下から出すシート）の開閉（R1・旧 MobileShell ローカル state。persist除外）
    mobileSheetOpen: boolean; setMobileSheetOpen: (v: boolean) => void;

    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
}

// ダイアログの Promise resolver はモジュールスコープに保持する（永続化対象外にするため）
let dialogResolver: ((value: string) => void) | null = null;

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
    dialog: null,
    showDialog: (req) => new Promise<string>((resolve) => {
        // 既存ダイアログが残っていれば空文字でクローズしてから差し替える
        if (dialogResolver) { const prev = dialogResolver; dialogResolver = null; prev(''); }
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
        dialogResolver = null;
        set({ dialog: null });
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

    selectedIcons: [],
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

    _hasHydrated: false,
    setHasHydrated: (state) => set({ _hasHydrated: state }),
});
