import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect, Arrow, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, NoteObject, NoteObjectType, NoteTargetType } from '../../store';
import { NOTE_CANVAS } from '../../constants';
import { putAsset } from '../../services/assetStore';
import { toast } from '../../services/toast';
import { downloadDataUrl } from '../../utils/download';
import { HANDWRITING_FONT, applyChaikin, CHARACTER_PORTRAITS, ExtendedNoteObjectType, FreehandSettings, PlacementMode, genObjId, PLACEMENT_LABELS } from './noteConstants';
import { getImageSizeFromUrl, processFile } from '../../utils/imageUtils';
import { URLImage, EditableText, ShapeObject } from './NoteObjectComponents';
import { ImageGalleryWindow } from './ImageGalleryWindow';
import { CompactToolbar } from './CompactToolbar';
import { ShapeContextMenu, ShapeContextMenuState } from './ShapeContextMenu';
import { NoteToolsSidebar } from './NoteToolsSidebar';
import { SelectionContextBar } from './SelectionContextBar';
import { useNoteClipboard } from '../../hooks/useNoteClipboard';
import { useNoteKeyboard } from '../../hooks/useNoteKeyboard';
import { useTextEditing } from '../../hooks/useTextEditing';
import { useNoteHistoryBatch } from '../../hooks/useNoteHistoryBatch';
import { useViewport } from '../../hooks/useViewport';

// 論理キャンバスの基準サイズ・compact ツールバー最小幅は constants.ts の NOTE_CANVAS に集約（#A-8-6）。
const COMPACT_SIDE_MIN = NOTE_CANVAS.COMPACT_SIDE_MIN;
const CANVAS_BASE_W = NOTE_CANVAS.W;
const CANVAS_BASE_H = NOTE_CANVAS.H;

// ドラッグ描画確定前の一時形状データ（R8: any禁止のため NoteObject 準拠 + 内部専用フィールドのみに限定）。
interface DrawingShapeInfo {
    id?: string;
    type: ExtendedNoteObjectType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: number[];
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    lineStyle?: 'normal' | 'marker' | 'pen';
    canvasIndex?: number;
    content?: string;
    // rect/circle/triangle のドラッグ開始点（確定時の位置計算に使う内部専用フィールド）
    _startX?: number;
    _startY?: number;
}

export interface CanvasWorkspaceProps {
    targetType: NoteTargetType;
    targetId: string;
    titleNode?: React.ReactNode;
    // Toolsサイドバーの最上部に差し込むコントロール（プリセット選択/メモ操作/キャラアイコン等）。
    // これによりCanvas上部のトップバーを廃止し、操作をTools上に集約する。#06/28-3:58-3,4,5
    sidebarHeader?: React.ReactNode;
    // sidebarHeader 下の境界線を描くか（既定 true）。キャラノートは見出しの h3 自身が
    // border を持つため false にして二重線・位置ずれを防ぐ。#06/30-3
    sidebarHeaderDivider?: boolean;
    compactMode?: boolean;
    // compact 時にキャンバス上部へ出す横並びヘッダ（モバイルのプリセット/キャラ選択用）。smartphone.md M1
    headerBar?: React.ReactNode;
    // F3: ノート全文検索からのジャンプ先オブジェクトID。マウント/切替時に選択状態へ反映する。
    initialSelectId?: string;
    // キャラクターノートのみ渡される。A/D・←/→でのキャラ切替（revise2 №15: 描画中の誤発火防止のため
    // useNoteKeyboard の既存ガードに統合する）。
    onSwitchChar?: (dir: -1 | 1) => void;
}

export const CanvasWorkspace = React.memo(({ targetType, targetId, sidebarHeader, sidebarHeaderDivider = true, compactMode = false, headerBar, initialSelectId, onSwitchChar }: CanvasWorkspaceProps) => {

    const [displayTargetId, setDisplayTargetId] = useState(targetId);
    const [canvasOpacity, setCanvasOpacity] = useState(1);

    const targetData = useAppStore(state => {
        if (targetType === 'overview') return state.notes.overviewCanvas;
        if (targetType === 'preset') return state.notes.presets?.[displayTargetId];
        if (targetType === 'character') return state.notes.characters?.[displayTargetId];
        if (targetType === 'misc') return state.notes.miscPages?.find(p => p.id === displayTargetId)?.canvas;
        return undefined;
    });

    const addNoteObject = useAppStore(state => state.addNoteObject);
    const updateNoteObject = useAppStore(state => state.updateNoteObject);
    const updateNoteObjects = useAppStore(state => state.updateNoteObjects);
    const removeNoteObjects = useAppStore(state => state.removeNoteObjects);
    const addNoteAsset = useAppStore(state => state.addNoteAsset);
    const removeNoteAsset = useAppStore(state => state.removeNoteAsset);
    const reorderNoteObject = useAppStore(state => state.reorderNoteObject);
    const undoNote = useAppStore(state => state.undoNote);
    const redoNote = useAppStore(state => state.redoNote);
    const saveNoteHistory = useAppStore(state => state.saveNoteHistory);
    const showDialog = useAppStore(state => state.showDialog);

    const [currentCanvasIndex, setCurrentCanvasIndex] = useState(0);
    const [isGridMode, setIsGridMode] = useState(false);
    const [isGridEditMode, setIsGridEditMode] = useState(false);
    const [hoveredCanvasIndex, setHoveredCanvasIndex] = useState<number | null>(null);
    // Animate(compact)の画像ギャラリー floating window の表示状態
    const [showImageGallery, setShowImageGallery] = useState(false);
    // 画像ギャラリーはドラッグで移動可能にする（Canvasに被ると使いにくいため）。null=既定の右下。
    const [galleryPos, setGalleryPos] = useState<{ x: number, y: number } | null>(null);
    const [isDraggingGallery, setIsDraggingGallery] = useState(false);
    const galleryDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
    // revise3 B-6: mousedown+mousemove はタッチで動かせないため Pointer Events へ統一
    const handleGalleryDragStart = (e: React.PointerEvent) => {
        const start = galleryPos ?? { x: window.innerWidth - 222, y: window.innerHeight - 16 - Math.round(window.innerHeight * 0.45) };
        setIsDraggingGallery(true);
        galleryDragRef.current = { x: e.clientX, y: e.clientY, posX: start.x, posY: start.y };
        if (!galleryPos) setGalleryPos(start);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    useEffect(() => {
        if (!isDraggingGallery) return;
        const onMove = (e: PointerEvent) => {
            const dx = e.clientX - galleryDragRef.current.x;
            const dy = e.clientY - galleryDragRef.current.y;
            setGalleryPos({ x: galleryDragRef.current.posX + dx, y: galleryDragRef.current.posY + dy });
        };
        const onUp = () => setIsDraggingGallery(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [isDraggingGallery]);

    // ウィンドウを縮めても画像一覧が画面外に取り残されないようにする（revise2 №18）
    useEffect(() => {
        const onResize = () => {
            setGalleryPos(p => p && ({
                x: Math.min(Math.max(0, p.x), window.innerWidth - 60),
                y: Math.min(Math.max(0, p.y), window.innerHeight - 40),
            }));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const {
        editingTextId, setEditingTextId, editingTextValue, setEditingTextValue,
        editingTextValueRef, editingTextIdRef, editingTextBoundsRef, finishTextEditing,
    } = useTextEditing(targetType, displayTargetId, updateNoteObject, saveNoteHistory);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    // 0711_2 #1: 縮尺(effScale)の基準寸。ウィンドウ自体のリサイズ（ブラウザズーム含む）と
    // ノート切替のときだけ更新し、パネル開閉などウィンドウ不変のコンテナ変化では据え置く。
    // 据え置き中は縮尺を変えず、紙面は常にセルいっぱいに描く（差分は紙面の広がり/隠れで吸収）。
    const [stableSize, setStableSize] = useState({ width: 0, height: 0, winW: 0, winH: 0 });

    const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
    const [freehandSettings, setFreehandSettings] = useState<FreehandSettings>({
        color: '#000000',
        strokeWidth: 3,
        lineStyle: 'pen',
        stabilization: 2,
    });
    // F5: グリッドスナップ（配置/移動確定を方眼(24px)ピッチに吸着させる）
    const [snapOn, setSnapOn] = useState(false);

    const isDrawingMode = !!placementMode;

    const [selectionRect, setSelectionRect] = useState({ startX: 0, startY: 0, w: 0, h: 0, visible: false, canvasIndex: 0 });

    const isDrawingRef = useRef(false);
    // ドラッグ描画中(rect/circle/triangle/line/arrow/curve/freehand)の一時形状データ。
    // 確定前のみ存在し、種別ごとに使うフィールドが異なるため NoteObject に準じた任意項目を持つ。
    const drawingShapeInfoRef = useRef<DrawingShapeInfo | null>(null);
    // 上記に対応する、描画中プレビュー用の Konva ノード（Line/Rect/Arrow のいずれか）。
    const drawingNodeRef = useRef<Konva.Shape | null>(null);
    // 各ペインの Konva.Stage 参照。ブラウザズーム時に pixelRatio を再適用して画質劣化(#6)を防ぐ。
    const stageRefs = useRef<(Konva.Stage | null)[]>([null, null, null, null]);
    // 複数/グループドラッグ確定の冪等性のため、ドラッグ開始時点の座標を基準として固定する。
    // ドラッグ中に store が更新される（色ドラッグの遅延コミット等）と closure の obj/objects が
    // 新しくなり、同一 mouseup 内の複数 dragend で差分が二重適用され得るため（revise2 №16）。
    const dragBaseRef = useRef<Map<string, { x: number; y: number }> | null>(null);

    const { saveHistoryOnceThenSkip, commitThrottled } = useNoteHistoryBatch(saveNoteHistory);
    const [drawingActive, setDrawingActive] = useState(false);

    const [shapeContextMenu, setShapeContextMenu] = useState<ShapeContextMenuState | null>(null);
    const [assetContextMenu, setAssetContextMenu] = useState<{ asset: string, x: number, y: number } | null>(null);

    // ノート切替時に前ノートの選択・編集・メニュー状態を持ち越さない（revise3 A-3）。
    // finishTextEditing は displayTargetId で closure しているため、setDisplayTargetId の
    // 「直前」に呼び、旧ノートの編集内容が旧IDのうちにコミットされるようにする。
    useEffect(() => {
        if (targetId !== displayTargetId) {
            setCanvasOpacity(0);
            const timer = setTimeout(() => {
                finishTextEditing();          // 旧ノートの編集を旧IDのうちに確定
                setSelectedIds([]);
                setShapeContextMenu(null);
                setAssetContextMenu(null);
                setPlacementMode(null);
                setDisplayTargetId(targetId);
                setTimeout(() => setCanvasOpacity(1), 50);
            }, 200);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetId, displayTargetId, finishTextEditing]);

    const [isFontLoaded, setIsFontLoaded] = useState(false);

    // revise3 B-3: モバイルの Canvas にピンチズーム/パンを追加する。effScale はそのまま（デスクトップの
    // 「全体が常に見える」レイアウトは崩さない）で、compactMode(タッチ)時だけ Layer に合成適用する。
    const [touchView, setTouchView] = useState({ scale: 1, x: 0, y: 0 });
    const pinchRef = useRef<{ startDist: number, startScale: number, startMidX: number, startMidY: number, startViewX: number, startViewY: number } | null>(null);
    const lastTapRef = useRef(0);
    useEffect(() => { setTouchView({ scale: 1, x: 0, y: 0 }); }, [displayTargetId, currentCanvasIndex]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const trRefs = useRef<(Konva.Transformer | null)[]>([null, null, null, null]);
    // 4ペインそれぞれの DOM 要素。ペインをまたぐドラッグ移動(#4)のヒットテストに使う
    const paneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
    // revise3 B-9: 4面ペインのダブルクリック/ダブルタップ判定用
    const lastPaneTapRef = useRef<{ index: number, t: number }>({ index: -1, t: 0 });
    // revise3 B-4: 図形の長押し（500ms）で ShapeContextMenu を開くための共有タイマー
    const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null, x: number, y: number }>({ timer: null, x: 0, y: 0 });

    const objects = targetData?.objects || [];
    const assets = targetData?.assets || [];

    // 画像パレット/ギャラリーに出す画像。事件ノート(preset)では全キャラの立ち絵を常時利用可能にする。
    const portraitPalette = targetType === 'preset' ? CHARACTER_PORTRAITS : [];
    // モバイルの画像一覧(ImageGalleryWindow)。デスクトップは preset の "Images" と
    // 非preset の "Character Images" に分かれて全キャラ立ち絵が常に出る。モバイルは単一の一覧
    // なので、種別を問わず立ち絵(CHARACTER_PORTRAITS)＋アップロード画像(assets)を常時出す。
    const availableImages = useMemo(
        () => [...CHARACTER_PORTRAITS, ...assets],
        [assets]
    );

    const currentCanvasObjects = useMemo(() => objects.filter(o => (o.canvasIndex || 0) === currentCanvasIndex), [objects, currentCanvasIndex]);
    const objectsLength = objects.length;

    // F3: ノート全文検索からのジャンプ先を選択状態へ反映する。対象が別ペイン(canvasIndex)に
    // あればそのペインへ切り替え、4ペイン表示中なら単一表示へ戻して見えるようにする。
    useEffect(() => {
        if (!initialSelectId || displayTargetId !== targetId) return;
        const target = objects.find(o => o.id === initialSelectId);
        if (!target) return;
        setSelectedIds([initialSelectId]);
        setCurrentCanvasIndex(target.canvasIndex || 0);
        setIsGridMode(false);
    }, [initialSelectId, displayTargetId, targetId, objects]);

    const { clipboard, handleCopySelected, handleCutSelected, handlePasteClipboard } = useNoteClipboard(
        targetType, displayTargetId, currentCanvasIndex, selectedIds, currentCanvasObjects, setSelectedIds,
    );


    useEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;

        // ノート切替で新しい紙面に合わせ直す（stableSize を初期化）
        setStableSize({ width: 0, height: 0, winW: 0, winH: 0 });

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = Math.round(entry.contentRect.width);
                const newHeight = Math.round(entry.contentRect.height);
                // revise3 A-13: 完全一致のみスキップ（2px 閾値だとリサイザーを1px刻みで動かした際に
                // Stage とコンテナが最大2px弱ズレたままになる。Math.round 済みなので同値スキップで十分）。
                setCanvasSize(prev => (prev.width === newWidth && prev.height === newHeight) ? prev : { width: newWidth, height: newHeight });
                setStableSize(prev => {
                    const winW = window.innerWidth, winH = window.innerHeight;
                    if (prev.width === 0 || prev.winW !== winW || prev.winH !== winH) {
                        return { width: newWidth, height: newHeight, winW, winH };
                    }
                    return prev;    // ウィンドウ不変のコンテナ変化（パネル開閉等）→ 縮尺据え置き
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [targetType, targetId]);

    useEffect(() => {
        let done = false;
        const finish = () => { if (!done) { done = true; setIsFontLoaded(true); } };
        // FontFaceSet で明示ロード。1.5s で諦めて代替フォントのまま描画を開始する（revise3 A-9）
        document.fonts.load('24px "Yomogi"').then(finish).catch(finish);
        const t = setTimeout(finish, 1500);
        return () => clearTimeout(t);
    }, []);

    // #06/28-3:58-6: ブラウザのズームイン時、Konvaキャンバスのバックバッファ解像度(pixelRatio)は
    // マウント時のdevicePixelRatioで固定されるため、ズームインで拡大表示されると画像がボケる
    // （再読み込みで直る = その時点のdprで描き直されるから）。
    // dpr変化を検知して各StageのLayer canvasにsetPixelRatioし直し、再描画する。
    useEffect(() => {
        const applyPixelRatio = () => {
            const dpr = window.devicePixelRatio || 1;
            stageRefs.current.forEach(stage => {
                if (!stage) return;
                let changed = false;
                stage.getLayers().forEach(layer => {
                    const canvas = layer.getCanvas();
                    if (Math.abs(canvas.getPixelRatio() - dpr) > 0.01) {
                        canvas.setPixelRatio(dpr);
                        changed = true;
                    }
                });
                if (changed) stage.batchDraw();
            });
        };
        // resolution メディアクエリは現在のdprでのみマッチし、dpr変化時に一度だけ change を発火する。
        let mq: MediaQueryList | null = null;
        const onChange = () => { applyPixelRatio(); subscribe(); };
        const subscribe = () => {
            mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            mq.addEventListener('change', onChange, { once: true });
        };
        subscribe();
        applyPixelRatio();
        return () => { mq?.removeEventListener('change', onChange); };
    }, []);

    // 1ペインを「選択枠なし」で dataURL 化する（紙面背景はまだ乗せない）。事件ノート(preset)は
    // 論理1200×800を常に2400×1600で出力（ズーム非依存）。それ以外は表示範囲を2倍解像度で出力。
    const capturePane = useCallback((index: number): { url: string; k: number } | null => {
        const stage = stageRefs.current[index];
        const layer = stage?.getLayers()[0];
        if (!stage || !layer) return null;
        const s = layer.scaleX() || 1;
        // 選択枠(Transformer/インジケータ)を一時非表示にして描画物だけを出力する
        const excluded = stage.find('.__export_exclude');
        excluded.forEach(n => n.visible(false));
        layer.batchDraw();
        try {
            // fill系(全体/キャラ/メモ)も preset 同様、論理基準(2/s)で出力する。旧: pixelRatio 2 固定は
            // Stage の物理px がウィンドウ寸に依存するため、同じノートでも書き出し解像度が
            // ウィンドウサイズで変わっていた（revise2 №19）。21§A の安定化と合わせてウィンドウ非依存になる。
            // revise3 A-10: 論理×2 を基本に、出力長辺が 4096px を超える場合は縮める（巨大ウィンドウでの
            // メモリ急増/toDataURL失敗対策）。drawPaper の方眼ピッチを出力と一致させるため k を返す。
            const logicalW = stage.width() / s, logicalH = stage.height() / s;
            const ratio = Math.min(2, 4096 / Math.max(logicalW, logicalH));
            return { url: stage.toDataURL({ pixelRatio: ratio / s, mimeType: 'image/png' }), k: ratio };
        } finally {
            excluded.forEach(n => n.visible(true));
            layer.batchDraw();
        }
    }, [targetType]);

    // dataURL(透明背景) → 紙面色を敷いた canvas に載せ替えるための画像ロード
    const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });

    // 0711_2 #5: 紙面（方眼つき）を 2D canvas に描く。k = 出力px/論理px。
    // capturePane の pixelRatio(2/s) と Layer scale(s) が相殺するため、書き出しは常に k=2。
    // 見た目は画面の CSS 背景（24pxピッチ・3-3破線・#C2B2A1・各セルの上辺/左辺）に一致させる。
    const drawPaper = (ctx: CanvasRenderingContext2D, w: number, h: number, k: number) => {
        ctx.fillStyle = '#ECD2B3';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#C2B2A1';
        ctx.lineWidth = k;
        ctx.setLineDash([3 * k, 3 * k]);
        for (let x = 0; x <= w; x += 24 * k) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y <= h; y += 24 * k) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.setLineDash([]);
    };

    // キャンバスを PNG として書き出す（B-4 / 20.md #2）。4ペイン表示中は「4ペイン全体 / 現在のペイン」を選べる。
    // 紙面(方眼色)背景は CSS 背景で toDataURL に写らないため、2D canvas で合成する
    // （react-konva と別インスタンスの new Konva.* は使わない）。
    const handleExportPng = useCallback(async () => {
        let mode: 'current' | 'all' = 'current';
        if (isGridMode) {
            const v = await showDialog({
                title: 'PNG書き出し',
                message: '書き出す範囲を選んでください。',
                buttons: [
                    { label: '4ペイン全体', value: 'all', variant: 'primary' },
                    { label: '現在のペイン', value: 'current' },
                    { label: 'キャンセル', value: 'cancel' },
                ],
            });
            if (v !== 'all' && v !== 'current') return; // '' = ESC/差し替え も中止
            mode = v;
        }
        try {
            if (mode === 'current') {
                const cap = capturePane(currentCanvasIndex);
                if (!cap) return;
                const img = await loadImage(cap.url);
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                const ctx = c.getContext('2d')!;
                drawPaper(ctx, c.width, c.height, cap.k);
                ctx.drawImage(img, 0, 0);
                downloadDataUrl(c.toDataURL('image/png'), `manosaba-note-${targetType}-${Date.now()}.png`);
            } else {
                const caps = [0, 1, 2, 3].map(capturePane);
                if (caps.some(u => !u)) { toast.error('ペインの取得に失敗しました'); return; }
                const validCaps = caps as { url: string; k: number }[];
                const imgs = await Promise.all(validCaps.map(cap => loadImage(cap.url)));
                // グリッド中は4ペインのセル寸が同一 → 出力も同一サイズ
                const w = imgs[0].naturalWidth, h = imgs[0].naturalHeight, GAP = 8;
                const c = document.createElement('canvas');
                c.width = w * 2 + GAP; c.height = h * 2 + GAP;
                const ctx = c.getContext('2d')!;
                ctx.fillStyle = '#444'; ctx.fillRect(0, 0, c.width, c.height); // 区切り線
                imgs.forEach((img, i) => {
                    const col = i % 2, row = Math.floor(i / 2);
                    const x = col * (w + GAP), y = row * (h + GAP);
                    ctx.save();
                    ctx.translate(x, y);
                    drawPaper(ctx, w, h, validCaps[i].k);
                    ctx.restore();
                    ctx.drawImage(img, x, y);
                });
                downloadDataUrl(c.toDataURL('image/png'), `manosaba-note-${targetType}-all-${Date.now()}.png`);
            }
            toast.success('PNGを書き出しました');
        } catch {
            toast.error('PNG書き出しに失敗しました');
        }
    }, [isGridMode, currentCanvasIndex, targetType, showDialog, capturePane]);

    // オブジェクトのドラッグ確定処理（#4: 4ペインをまたぐ移動に対応）。
    // グリッド編集中に別ペイン上でドロップされたら、対象（グループなら全メンバー）を
    // 移動先キャンバスへ付け替える。同一ペイン内なら通常の移動として確定する。
    // revise3 A-11: ドラッグ中はフローティングテキストツールバーの位置が Konva ノードの再レンダリングに
    // 追従しないため、ドラッグ中だけ非表示にする（旧位置に残る不具合の最小修正）。
    const [draggingSelection, setDraggingSelection] = useState(false);

    const handleObjectDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>, obj: NoteObject, sourceIndex: number, _scale: number) => {
        setDraggingSelection(false);
        const evt: MouseEvent | undefined = e?.evt;
        const rawX = e.target.x();
        const rawY = e.target.y();
        // 事件ノート(preset)のみ基準範囲[0,1200]×[0,800]外へ出さない。それ以外(fill)は自由配置。
        // クランプは「最終配置位置」に対して行う（ドラッグ途中値をクランプすると跨ぎ移動の計算が壊れるため）。
        const clampRange = targetType === 'preset';
        const clampX = (v: number) => clampRange ? Math.max(0, Math.min(CANVAS_BASE_W, v)) : v;
        const clampY = (v: number) => clampRange ? Math.max(0, Math.min(CANVAS_BASE_H, v)) : v;

        // ドラッグ開始時点の座標を基準にする（revise2 №16）。onDragStart で必ず設定されるが、
        // 万一未設定なら現在の store 値へフォールバックする。
        const baseOf = (id: string, cur: { x?: number; y?: number }) =>
            dragBaseRef.current?.get(id) ?? { x: cur.x ?? 0, y: cur.y ?? 0 };
        const objBase = baseOf(obj.id, obj);

        // dx,dy だけ移動する。グループならグループ全員（同ペイン）、それ以外は自分のみ。
        // extra に canvasIndex を含めると移動先ペインへ付け替える。
        const applyMove = (dx: number, dy: number, extra: Partial<NoteObject> = {}) => {
            saveHistoryOnceThenSkip();
            if (obj.groupId) {
                const groupObjs = objects.filter(o => (o.canvasIndex || 0) === sourceIndex && o.groupId === obj.groupId);
                updateNoteObjects(targetType, displayTargetId,
                    groupObjs.map(m => { const b = baseOf(m.id, m); return { id: m.id, attrs: { x: b.x + dx, y: b.y + dy, ...extra } }; }));
            } else {
                updateNoteObject(targetType, displayTargetId, obj.id, { x: objBase.x + dx, y: objBase.y + dy, ...extra }, true);
            }
        };

        if (isGridMode && isGridEditMode && evt) {
            const targetPane = paneRefs.current.findIndex(div => {
                if (!div) return false;
                const r = div.getBoundingClientRect();
                return evt.clientX >= r.left && evt.clientX <= r.right && evt.clientY >= r.top && evt.clientY <= r.bottom;
            });

            if (targetPane !== -1 && targetPane !== sourceIndex) {
                // 跨ぎ移動: 「見えている画面位置のまま」移動先ペインの論理座標へ変換する。
                // Stageコンテナの画面矩形とLayerのscale/offsetを使って正確に変換（#06/28-14:47-1）。
                const srcStage = stageRefs.current[sourceIndex];
                const tgtStage = stageRefs.current[targetPane];
                const sLayer = srcStage?.getLayers()[0];
                const tLayer = tgtStage?.getLayers()[0];
                if (srcStage && tgtStage && sLayer && tLayer) {
                    const srcBox = srcStage.container().getBoundingClientRect();
                    const tgtBox = tgtStage.container().getBoundingClientRect();
                    // オブジェクト原点の画面座標（ドラッグ後の生の論理座標 rawX を使う＝クランプ前）
                    const screenX = srcBox.left + rawX * sLayer.scaleX() + sLayer.x();
                    const screenY = srcBox.top + rawY * sLayer.scaleY() + sLayer.y();
                    // 画面→移動先Layerの論理座標
                    const newX = clampX((screenX - tgtBox.left - tLayer.x()) / tLayer.scaleX());
                    const newY = clampY((screenY - tgtBox.top - tLayer.y()) / tLayer.scaleY());
                    applyMove(newX - objBase.x, newY - objBase.y, { canvasIndex: targetPane });
                    return;
                }
            }
        }

        // 同一ペイン内: 通常の移動として確定（最終位置をクランプ）。
        // F5: スナップONなら方眼(24px)ピッチに丸める（跨ぎ移動の画面座標変換には使わない rawX/Y のみ対象）。
        const snappedX = snapOn ? Math.round(rawX / 24) * 24 : rawX;
        const snappedY = snapOn ? Math.round(rawY / 24) * 24 : rawY;
        applyMove(clampX(snappedX) - objBase.x, clampY(snappedY) - objBase.y);
    }, [isGridMode, isGridEditMode, compactMode, objects, updateNoteObject, updateNoteObjects, targetType, displayTargetId, snapOn]);

    useNoteKeyboard({
        editingTextId, setPlacementMode, undoNote, redoNote,
        selectedIds, setSelectedIds, updateNoteObjects, removeNoteObjects, targetType, displayTargetId,
        handleCopySelected, handleCutSelected, handlePasteClipboard, clipboard,
        placementMode, shapeContextMenu, isDrawingRef, setCurrentCanvasIndex, onSwitchChar,
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            [0, 1, 2, 3].forEach(index => {
                const tr = trRefs.current[index];
                if (tr) {
                    const stage = tr.getStage();
                    if (stage) {
                        const nodes = selectedIds
                            .map(id => stage.findOne(`#${id}`))
                            .filter((node): node is Konva.Node => {
                                if (!node) return false;
                                // 複数選択時はテキストをTransformerから除外（スケール変形防止）
                                if (selectedIds.length > 1) return node.getClassName() !== 'Text';
                                // 単独選択時はテキストも含める（バウンディングボックス表示のため）
                                return true;
                            });
                        tr.nodes(nodes);
                        tr.getLayer()?.batchDraw();
                    }
                }
            });
        }, 50);
        return () => clearTimeout(timer);
    }, [selectedIds, objectsLength, currentCanvasIndex, isGridMode, isGridEditMode]);

    // revise3 B-1: 同じツールをもう一度押すと解除するトグル化。フリーハンド描き終え後も
    // placementMode が残る仕様のため、ソフトキーボードの無いタッチ端末で解除できなくなるのを防ぐ。
    const startPlacement = (type: ExtendedNoteObjectType, data?: string) => {
        setPlacementMode(prev => (prev?.type === type && prev?.data === data) ? null : { type, data });
        setSelectedIds([]);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!(e.target.files && e.target.files[0])) return;
        try {
            // base64 を state に載せず、Blob を IDB に保存して asset:// キーだけを扱う（P2）
            const { blob } = await processFile(e.target.files[0]);
            const key = await putAsset(blob);
            addNoteAsset(targetType, displayTargetId, key);
            startPlacement('image', key);
        } catch {
            // revise No.4: QuotaExceededError 等で無反応+unhandled rejectionになるのを防ぐ
            toast.error('画像を保存できませんでした（空き容量不足の可能性）。ヘルプからバックアップの書き出しをおすすめします。');
            void import('../../services/storageHealth').then(m => m.checkStorageHealth());
        } finally {
            e.target.value = ''; // 同じファイルの再選択を可能に
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (!(files && files.length > 0 && files[0].type.startsWith('image/'))) return;

        // ドロップされた画面座標を、該当ペインの Layer 論理座標へ変換する（revise3 A-1）。
        // 旧: offsetX/Y（コンテナ画面px）をそのまま論理座標にしていたため、縮尺ぶんズレていた。
        let dropIndex = currentCanvasIndex;
        let pos = { x: 100, y: 100 };   // 変換不能時のフォールバック
        const paneHit = paneRefs.current.findIndex(div => {
            if (!div) return false;
            const r = div.getBoundingClientRect();
            return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        if (paneHit !== -1) dropIndex = paneHit;
        const stage = stageRefs.current[dropIndex];
        const layer = stage?.getLayers()[0];
        if (stage && layer) {
            const box = stage.container().getBoundingClientRect();
            pos = {
                x: (e.clientX - box.left - layer.x()) / (layer.scaleX() || 1),
                y: (e.clientY - box.top - layer.y()) / (layer.scaleY() || 1),
            };
        }
        if (targetType === 'preset') {   // 基準範囲クランプ（クリック配置と同じ制約）
            pos.x = Math.max(0, Math.min(CANVAS_BASE_W, pos.x));
            pos.y = Math.max(0, Math.min(CANVAS_BASE_H, pos.y));
        }
        try {
            const { blob, width, height } = await processFile(files[0]);
            const key = await putAsset(blob);
            addNoteAsset(targetType, displayTargetId, key);
            addNoteObject(targetType, displayTargetId, {
                id: genObjId('img'),
                type: 'image',
                x: pos.x, y: pos.y,
                width, height,
                content: key,
                rotation: 0, scaleX: 1, scaleY: 1,
                keepRatio: true,
                canvasIndex: dropIndex
            });
        } catch {
            toast.error('画像を保存できませんでした（空き容量不足の可能性）。ヘルプからバックアップの書き出しをおすすめします。');
            void import('../../services/storageHealth').then(m => m.checkStorageHealth());
        }
    };

    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, index: number, _scale: number) => {
        // TouchEvent には button が無く undefined になる。タッチは常に許可し、マウスは左クリックのみ許可する
        // （revise2 №22: 旧実装は button!==0 が常に真になりタッチ操作が全て無視されていた）。
        const isTouch = typeof TouchEvent !== 'undefined' && e.evt instanceof TouchEvent;
        if (isTouch && (e.evt as TouchEvent).touches.length > 1) return;   // マルチタッチはジェスチャ予約（revise3 A-15）
        if (!isTouch && (e.evt as MouseEvent).button !== 0) return;

        if (placementMode) {
            // レイヤーのローカル(=論理)座標。Layerのscale(compactの基準範囲フィット)を自動で吸収する。
            const layer = e.target.getStage()?.getLayers()[0];
            const pos = layer?.getRelativePointerPosition();
            if (!pos) return;
            // F5: グリッドスナップON時は方眼と同ピッチ(24px)に配置位置を吸着させる
            if (snapOn) {
                pos.x = Math.round(pos.x / 24) * 24;
                pos.y = Math.round(pos.y / 24) * 24;
            }
            // 事件ノート(preset)のみ基準範囲[0,1200]×[0,800]外への配置を禁止（Animateとの整合）。
            // それ以外(fillの全体/キャラ/メモ)はコンテナ全体に配置可。
            if (targetType === 'preset') {
                pos.x = Math.max(0, Math.min(CANVAS_BASE_W, pos.x));
                pos.y = Math.max(0, Math.min(CANVAS_BASE_H, pos.y));
            }

            if (['line', 'arrow', 'curve', 'curve_arrow', 'freehand'].includes(placementMode.type as string)) {
                isDrawingRef.current = true;
                const isFreehand = placementMode.type === 'freehand';
                drawingShapeInfoRef.current = {
                    id: genObjId(placementMode.type),
                    type: placementMode.type,
                    x: pos.x, y: pos.y,
                    points: isFreehand ? [0, 0] : [0, 0, 0, 0],
                    stroke: isFreehand ? freehandSettings.color : '#000000',
                    strokeWidth: isFreehand ? freehandSettings.strokeWidth : 3,
                    rotation: 0, scaleX: 1, scaleY: 1,
                    lineStyle: isFreehand ? freehandSettings.lineStyle : 'normal',
                    canvasIndex: index
                };
                setDrawingActive(true);
                return;
            }

            // 画像はドラッグによるサイズ指定を行わず、クリック位置へアスペクト比を維持して即配置する
            if (placementMode.type === 'image') {
                const content = placementMode.data as string;
                const px = pos.x, py = pos.y;
                getImageSizeFromUrl(content, 300).then(({ width, height }) => {
                    addNoteObject(targetType, displayTargetId, {
                        id: genObjId('image'), type: 'image',
                        x: px, y: py, width, height, content,
                        rotation: 0, scaleX: 1, scaleY: 1, keepRatio: true, canvasIndex: index,
                    });
                });
                setPlacementMode(null);
                return;
            }

            if (['rect', 'circle', 'triangle'].includes(placementMode.type as string)) {
                isDrawingRef.current = true;
                drawingShapeInfoRef.current = {
                    type: placementMode.type,
                    x: pos.x, y: pos.y,
                    width: 0, height: 0,
                    fill: '#A8D5BA', stroke: '#000000', strokeWidth: 2,
                    rotation: 0, scaleX: 1, scaleY: 1,
                    canvasIndex: index,
                    _startX: pos.x, _startY: pos.y,
                };
                setDrawingActive(true);
                return;
            }

            // text のみ即時配置
            const baseId = genObjId(placementMode.type);
            let newObj: NoteObject | null = null;
            if (placementMode.type === 'text') {
                newObj = { id: baseId, type: 'text', x: pos.x, y: pos.y, text: 'Text', fontSize: 24, fontWeight: 'normal', fill: '#000000', rotation: 0, scaleX: 1, scaleY: 1 };
            }

            if (newObj) {
                newObj.canvasIndex = index;
                addNoteObject(targetType, displayTargetId, newObj);
            }
            setPlacementMode(null);
            return;
        }

        if (e.target === e.target.getStage()) {
            setSelectedIds([]);
            // 編集中テキストは破棄せず確定してから閉じる（mousedown が onBlur より先に走るため）。#06/28-17:04-3
            finishTextEditing();
            setShapeContextMenu(null);
            setAssetContextMenu(null);

            const layer = e.target.getStage()?.getLayers()[0];
            const lp = layer?.getRelativePointerPosition();
            if (lp) {
                setSelectionRect({ startX: lp.x, startY: lp.y, w: 0, h: 0, visible: true, canvasIndex: index });
            }
        } else {
            setShapeContextMenu(null);
            setAssetContextMenu(null);
        }
    };

    const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, index: number, _scale: number) => {
        const isTouchMove = typeof TouchEvent !== 'undefined' && e.evt instanceof TouchEvent;
        if (isTouchMove && (e.evt as TouchEvent).touches.length > 1) return;   // revise3 A-15
        // revise3 B-4: 10px以上動いたら長押し判定をキャンセル（ドラッグ開始とみなす）
        if (isTouchMove && longPressRef.current.timer) {
            const t = (e.evt as TouchEvent).touches[0];
            if (t && Math.hypot(t.clientX - longPressRef.current.x, t.clientY - longPressRef.current.y) > 10) {
                clearTimeout(longPressRef.current.timer);
                longPressRef.current.timer = null;
            }
        }
        if (isDrawingRef.current && drawingShapeInfoRef.current && drawingShapeInfoRef.current.canvasIndex === index) {
            const layer = e.target.getStage()?.getLayers()[0];
            const logicalPos = layer?.getRelativePointerPosition();
            if (!logicalPos) return;
            const type = drawingShapeInfoRef.current.type as string;

            if (['rect', 'circle', 'triangle'].includes(type)) {
                const startX = drawingShapeInfoRef.current._startX as number;
                const startY = drawingShapeInfoRef.current._startY as number;
                const newX = Math.min(logicalPos.x, startX);
                const newY = Math.min(logicalPos.y, startY);
                const newW = Math.abs(logicalPos.x - startX);
                const newH = Math.abs(logicalPos.y - startY);
                drawingShapeInfoRef.current.x = newX;
                drawingShapeInfoRef.current.y = newY;
                drawingShapeInfoRef.current.width = newW;
                drawingShapeInfoRef.current.height = newH;
                if (drawingNodeRef.current) {
                    drawingNodeRef.current.x(newX);
                    drawingNodeRef.current.y(newY);
                    drawingNodeRef.current.width(newW);
                    drawingNodeRef.current.height(newH);
                    drawingNodeRef.current.getLayer()?.batchDraw();
                }
                return;
            }

            if (!drawingNodeRef.current) return;
            // freehand/line/arrow/curve/curve_arrow はいずれも Konva.Line(Arrowも継承) が描画中ノード。
            const lineNode = drawingNodeRef.current as Konva.Line;
            const dx = logicalPos.x - drawingShapeInfoRef.current.x;
            const dy = logicalPos.y - drawingShapeInfoRef.current.y;

            if (type === 'freehand') {
                drawingShapeInfoRef.current.points?.push(dx, dy);
                lineNode.points(drawingShapeInfoRef.current.points ?? []);
                lineNode.getLayer()?.batchDraw();
            } else {
                let newPoints = [0, 0, dx, dy];
                if (['curve', 'curve_arrow'].includes(type)) {
                    newPoints = [0, 0, dx / 2, dy / 2 - 50, dx, dy];
                }
                lineNode.points(newPoints);
                lineNode.getLayer()?.batchDraw();
                drawingShapeInfoRef.current.points = newPoints;
            }
            return;
        }

        if (!selectionRect.visible || selectionRect.canvasIndex !== index) return;
        const layer = e.target.getStage()?.getLayers()[0];
        const lp = layer?.getRelativePointerPosition();
        if (lp) {
            setSelectionRect(prev => ({
                ...prev,
                w: lp.x - prev.startX,
                h: lp.y - prev.startY
            }));
        }
    };

    // 描画中の図形/フリーハンドを確定する（revise3 A-5: Stage 上の mouseup と window 側の
    // フォールバック mouseup/touchend の両方から呼べるよう handleStageMouseUp から抽出）。
    const commitDrawing = async (index: number) => {
        if (!(isDrawingRef.current && drawingShapeInfoRef.current)) return;
        isDrawingRef.current = false;
        const type = drawingShapeInfoRef.current.type as string;

        if (['rect', 'circle', 'triangle', 'image'].includes(type)) {
            const dragW = drawingShapeInfoRef.current.width as number;
            const dragH = drawingShapeInfoRef.current.height as number;
            const isDrag = dragW >= 5 && dragH >= 5;
            const baseId = genObjId(type);
            const startX = drawingShapeInfoRef.current._startX as number;
            const startY = drawingShapeInfoRef.current._startY as number;
            let newObj: NoteObject;

            if (isDrag) {
                // Circle/RegularPolygon は x,y が中心座標のためバウンディングボックス左上から補正
                const isCentered = type === 'circle' || type === 'triangle';
                const d = Math.min(dragW, dragH);   // 正円/正三角の直径（revise3 A-7）
                newObj = {
                    id: baseId,
                    type: type as NoteObjectType,
                    x: isCentered
                        ? (drawingShapeInfoRef.current.x as number) + dragW / 2
                        : (drawingShapeInfoRef.current.x as number),
                    y: isCentered
                        ? (drawingShapeInfoRef.current.y as number) + dragH / 2
                        : (drawingShapeInfoRef.current.y as number),
                    width: isCentered ? d : dragW,
                    height: isCentered ? d : dragH,
                    fill: '#A8D5BA',
                    stroke: '#000000',
                    strokeWidth: 2,
                    rotation: 0, scaleX: 1, scaleY: 1,
                    canvasIndex: index,
                    content: type === 'image' ? drawingShapeInfoRef.current.content as string : undefined,
                    keepRatio: type === 'image' ? true : undefined,
                };
            } else if (type === 'image') {
                const content = drawingShapeInfoRef.current.content as string;
                const { width, height } = await getImageSizeFromUrl(content, 300);
                newObj = { id: baseId, type: 'image', x: startX, y: startY, width, height, content, rotation: 0, scaleX: 1, scaleY: 1, keepRatio: true, canvasIndex: index };
            } else {
                newObj = { id: baseId, type: type as NoteObjectType, x: startX, y: startY, fill: '#A8D5BA', stroke: '#000000', strokeWidth: 2, rotation: 0, scaleX: 1, scaleY: 1, canvasIndex: index };
            }

            drawingShapeInfoRef.current = null;
            setDrawingActive(false);
            addNoteObject(targetType, displayTargetId, newObj);
            setPlacementMode(null);
            return;
        }

        const isFreehand = type === 'freehand';
        const finalPoints = (isFreehand && freehandSettings.stabilization > 0)
            ? applyChaikin(drawingShapeInfoRef.current.points as number[], freehandSettings.stabilization)
            : drawingShapeInfoRef.current.points;
        addNoteObject(targetType, displayTargetId, {
            ...drawingShapeInfoRef.current,
            id: genObjId(type),
            points: finalPoints
        });
        drawingShapeInfoRef.current = null;
        setDrawingActive(false);

        if (type !== 'freehand') {
            setPlacementMode(null);
        }
    };

    // Stage 外で指/ボタンが離された場合も描画・範囲選択を確定する（revise3 A-5）
    useEffect(() => {
        if (!drawingActive && !selectionRect.visible) return;
        const finish = () => {
            if (isDrawingRef.current && drawingShapeInfoRef.current) {
                void commitDrawing(drawingShapeInfoRef.current.canvasIndex ?? currentCanvasIndex);
            }
            setSelectionRect(prev => prev.visible ? { ...prev, visible: false } : prev);
        };
        window.addEventListener('mouseup', finish);
        window.addEventListener('touchend', finish);
        return () => { window.removeEventListener('mouseup', finish); window.removeEventListener('touchend', finish); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawingActive, selectionRect.visible]);

    const handleStageMouseUp = async (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, index: number, _scale: number) => {
        // revise3 B-4: 指が離れたら長押し判定を打ち切る
        if (longPressRef.current.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current.timer = null; }
        if (isDrawingRef.current && drawingShapeInfoRef.current) {
            await commitDrawing(index);
            return;
        }

        if (!selectionRect.visible || selectionRect.canvasIndex !== index) return;
        setSelectionRect(prev => ({ ...prev, visible: false }));

        // selectionRect は論理座標で保持しているため、ここでの /scale 変換は不要。
        const box = {
            x: Math.min(selectionRect.startX, selectionRect.startX + selectionRect.w),
            y: Math.min(selectionRect.startY, selectionRect.startY + selectionRect.h),
            width: Math.abs(selectionRect.w),
            height: Math.abs(selectionRect.h)
        };

        if (box.width === 0 || box.height === 0) return;

        const newSelectedIds: string[] = [];
        const objs = objects.filter(o => (o.canvasIndex || 0) === index);
        const layer = e.target.getStage()?.getLayers()[0];
        objs.forEach(obj => {
            const node = e.target.getStage()?.findOne(`#${obj.id}`);
            if (!node || !layer) return;
            // 論理座標系（Layer 相対）の実寸ボックスで交差判定（回転・スケール・種別差を吸収）。
            // 旧: オブジェクト原点(x,y)の包含判定だったため、矩形の右下だけ囲む・線の途中だけ囲む・
            // 回転済み図形などで「見えているのに選択されない」不具合があった（revise2 №13）。
            const r = node.getClientRect({ relativeTo: layer });
            const hit = r.x < box.x + box.width && r.x + r.width > box.x
                     && r.y < box.y + box.height && r.y + r.height > box.y;
            if (hit) newSelectedIds.push(obj.id);
        });
        setSelectedIds(newSelectedIds);
    };

    const handleShapeContextMenu = (e: Konva.KonvaEventObject<PointerEvent>, shapeObj: NoteObject) => {
        e.evt.preventDefault();
        setShapeContextMenu({
            id: shapeObj.id, type: shapeObj.type as ExtendedNoteObjectType,
            x: e.evt.clientX, y: e.evt.clientY,
            stroke: shapeObj.stroke || '#000000',
            strokeWidth: shapeObj.strokeWidth || 2,
            fill: shapeObj.fill,
            lineStyle: shapeObj.lineStyle || 'normal'
        });
    };

    const selectedObject = currentCanvasObjects.find(obj => obj.id === selectedIds[0]);
    const selectedGroupId = (() => {
        if (selectedIds.length < 2) return null;
        const first = currentCanvasObjects.find(o => o.id === selectedIds[0])?.groupId;
        if (!first) return null;
        return selectedIds.every(id => currentCanvasObjects.find(o => o.id === id)?.groupId === first) ? first : null;
    })();
    // トップバーは廃止（操作はTools上の sidebarHeader に集約）。常に単一行レイアウト。#06/28-3:58-3,4,5

    // F5: オブジェクト整列（複数選択時）。line系(points基準)は対象外＝選択に含まれていても無視する。
    const alignableSelected = () => currentCanvasObjects.filter(o => selectedIds.includes(o.id) && (o.width !== undefined || o.type === 'text'));
    const handleAlignLeft = () => {
        const targets = alignableSelected();
        if (targets.length < 2) return;
        const minX = Math.min(...targets.map(o => o.x));
        updateNoteObjects(targetType, displayTargetId, targets.map(o => ({ id: o.id, attrs: { x: minX } })));
    };
    const handleAlignTop = () => {
        const targets = alignableSelected();
        if (targets.length < 2) return;
        const minY = Math.min(...targets.map(o => o.y));
        updateNoteObjects(targetType, displayTargetId, targets.map(o => ({ id: o.id, attrs: { y: minY } })));
    };
    const handleDistributeHorizontal = () => {
        const targets = alignableSelected();
        if (targets.length < 2) return;
        const sorted = [...targets].sort((a, b) => a.x - b.x);
        const span = sorted[sorted.length - 1].x - sorted[0].x;
        const step = span / (sorted.length - 1);
        updateNoteObjects(targetType, displayTargetId, sorted.map((o, i) => ({ id: o.id, attrs: { x: sorted[0].x + step * i } })));
    };
    const handleDistributeVertical = () => {
        const targets = alignableSelected();
        if (targets.length < 2) return;
        const sorted = [...targets].sort((a, b) => a.y - b.y);
        const span = sorted[sorted.length - 1].y - sorted[0].y;
        const step = span / (sorted.length - 1);
        updateNoteObjects(targetType, displayTargetId, sorted.map((o, i) => ({ id: o.id, attrs: { y: sorted[0].y + step * i } })));
    };

    // U3: 選択中オブジェクトの一括操作。CompactToolbar/NoteToolsSidebar/SelectionContextBar の
    // 3箇所で同じ挙動を共有するため、名前付き関数として一本化する（従来は各呼び出し側に同一ロジックを複製していた）。
    const handleReorderSelected = (dir: 'front' | 'up' | 'down' | 'back') => {
        reorderNoteObject(targetType, displayTargetId, selectedIds[0], dir);
    };
    const handleToggleKeepRatioSelected = (checked: boolean) => {
        updateNoteObject(targetType, displayTargetId, selectedIds[0], { keepRatio: checked });
    };
    const handleGroupSelected = () => {
        const newGroupId = genObjId('group');
        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
    };
    const handleUngroupSelected = () => {
        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
        setSelectedIds([]);
    };
    const handleDeleteSelected = () => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); };

    // revise2 №20: fill系ノートは広いウィンドウで置いたオブジェクトが、狭いウィンドウでは
    // ビューポート外＝見えない/クリック不能になる。21§A の論理ビューポートと同じ基準寸から
    // 現在ペインのビューポート外にあるオブジェクトを画面内へ回収する。
    const handleGatherOutside = () => {
        let viewW = CANVAS_BASE_W, viewH = CANVAS_BASE_H;
        if (targetType !== 'preset') {
            const useStable = !compactMode && stableSize.width > 0;
            const baseAreaW = Math.max(1, useStable ? stableSize.width : canvasSize.width);
            const baseAreaH = Math.max(1, useStable ? stableSize.height : canvasSize.height);
            const logicalScale = Math.min(baseAreaW / CANVAS_BASE_W, baseAreaH / CANVAS_BASE_H);
            // 0711_2 #1: 回収先は「現在実際に見えている論理範囲」= コンテナ実寸 / 安定縮尺
            viewW = Math.max(1, canvasSize.width) / logicalScale;
            viewH = Math.max(1, canvasSize.height) / logicalScale;
        }
        const outside = currentCanvasObjects.filter(o =>
            (o.x ?? 0) < 0 || (o.y ?? 0) < 0 || (o.x ?? 0) > viewW - 40 || (o.y ?? 0) > viewH - 40);
        if (outside.length === 0) { toast.info('画面外のオブジェクトはありません'); return; }
        saveHistoryOnceThenSkip();
        updateNoteObjects(targetType, displayTargetId, outside.map(o => ({
            id: o.id,
            attrs: { x: Math.min(Math.max(0, o.x ?? 0), viewW - 100), y: Math.min(Math.max(0, o.y ?? 0), viewH - 60) },
        })), true);
        setSelectedIds(outside.map(o => o.id));
        toast.success(`${outside.length}件を画面内へ回収しました`);
    };

    // U3: SelectionContextBar の「色」「線幅」代表値と一括変更。text は fill、図形/線系は stroke を
    // 色として扱う（image は対象外）。ドラッグ中の間引きは ShapeContextMenu と同じ commitThrottled を使う。
    const colorTargets = currentCanvasObjects.filter(o => selectedIds.includes(o.id) && o.type !== 'image');
    const widthTargets = currentCanvasObjects.filter(o => selectedIds.includes(o.id) && o.type !== 'image' && o.type !== 'text');
    const selectionColorValue = colorTargets.length === 0 ? null : ((colorTargets[0].type === 'text' ? colorTargets[0].fill : colorTargets[0].stroke) || '#000000');
    const selectionWidthValue = widthTargets.length === 0 ? null : (widthTargets[0].strokeWidth ?? 3);
    const handleSelectionColorChange = (val: string) => {
        if (colorTargets.length === 0) return;
        saveHistoryOnceThenSkip();
        commitThrottled(() => updateNoteObjects(targetType, displayTargetId, colorTargets.map(o => ({
            id: o.id, attrs: o.type === 'text' ? { fill: val } : { stroke: val }
        })), true));
    };
    const handleSelectionWidthChange = (val: number) => {
        if (widthTargets.length === 0) return;
        saveHistoryOnceThenSkip();
        commitThrottled(() => updateNoteObjects(targetType, displayTargetId, widthTargets.map(o => ({ id: o.id, attrs: { strokeWidth: val } })), true));
    };

    // 0711 #4: portal 先スロット（ContextBar 内）。マウント後に一度だけ解決する
    const [selectionSlot, setSelectionSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (compactMode) return;
        setSelectionSlot(document.getElementById('context-bar-selection-slot'));
    }, [compactMode]);

    // 0711_2 #2: compact(モバイルAnimate)では折りたたみ行内のスロットへ portal する。
    // スロットが無い環境(デスクトップAnimateセル・モバイルNote)は従来の overlay。
    const [compactSlot, setCompactSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (!compactMode) return;
        setCompactSlot(document.getElementById('animate-note-selection-slot'));
    }, [compactMode]);

    const selectionBar = selectedIds.length > 0 ? (
        <SelectionContextBar
            variant="topbar"
            count={selectedIds.length}
            colorValue={selectionColorValue}
            onColorChange={handleSelectionColorChange}
            widthValue={selectionWidthValue}
            onWidthChange={handleSelectionWidthChange}
            canReorder={selectedIds.length === 1 && !!selectedObject}
            onReorderBack={() => handleReorderSelected('down')}
            onReorderFront={() => handleReorderSelected('up')}
            canGroup={selectedIds.length >= 2}
            onGroup={handleGroupSelected}
            canUngroup={!!selectedGroupId}
            onUngroup={handleUngroupSelected}
            onDelete={handleDeleteSelected}
            keepRatioVisible={selectedIds.length === 1 && selectedObject?.type === 'image'}
            keepRatioChecked={selectedObject?.keepRatio ?? true}
            onToggleKeepRatio={handleToggleKeepRatioSelected}
            onCopy={handleCopySelected}
            onCut={handleCutSelected}
            onPaste={handlePasteClipboard}
            pasteEnabled={clipboard.length > 0}
        />
    ) : null;

    const getNodeScreenPosition = (id: string): { x: number; y: number; width: number } | null => {
        for (const tr of trRefs.current) {
            if (!tr) continue;
            const stage = tr.getStage();
            if (!stage) continue;
            const node = stage.findOne(`#${id}`);
            if (node) {
                const rect = node.getClientRect();
                const container = stage.container().getBoundingClientRect();
                return { x: container.left + rect.x, y: container.top + rect.y, width: rect.width };
            }
        }
        return null;
    };

    // スマホでは Konva Text のダブルタップが発火しづらく本文編集に入れないため、選択中テキストの
    // 操作バーから明示的にインライン編集を開始できるようにする（onToggleEdit のタッチ版）。
    const startTextEditing = (objId: string) => {
        const obj = currentCanvasObjects.find(o => o.id === objId);
        if (!obj || obj.type !== 'text') return;
        // 編集textareaの幅は画面px基準。ノードの実スケール(レイヤー縮尺込み)から算出する。
        let width = 200;
        for (const tr of trRefs.current) {
            const node = tr?.getStage()?.findOne(`#${objId}`);
            if (node) { width = Math.max(50, node.width() * node.getAbsoluteScale().x); break; }
        }
        editingTextBoundsRef.current = { width };
        setEditingTextValue(obj.text ?? '');
        editingTextValueRef.current = obj.text ?? '';
        editingTextIdRef.current = objId;
        setEditingTextId(objId);
        setSelectedIds([]);
    };

    const renderFloatingTextToolbar = () => {
        if (draggingSelection) return null;
        if (selectedIds.length !== 1 || selectedObject?.type !== 'text') return null;
        const pos = getNodeScreenPosition(selectedIds[0]);
        if (!pos) return null;
        const tbTop = Math.max(10, pos.y - 50);
        const tbLeft = Math.min(window.innerWidth - 220, pos.x);
        return createPortal(
            <div style={{
                position: 'fixed',
                top: tbTop, left: tbLeft,
                background: 'rgba(30,30,30,0.97)',
                border: '1px solid var(--border-strong, #555)',
                borderRadius: '8px',
                padding: '5px 10px',
                display: 'flex', gap: '10px', alignItems: 'center',
                zIndex: 999999,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                fontSize: '0.85rem', color: 'var(--text-secondary, #ccc)'
            }}>
                {/* スマホ: ダブルタップに頼らず本文を編集できる明示ボタン */}
                {isMobileVp && (
                    <button
                        onClick={() => startTextEditing(selectedIds[0])}
                        title="文字を編集"
                        style={{ background: '#007acc', border: 'none', color: '#fff', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap', minHeight: 32 }}
                    >✎ 文字</button>
                )}
                <label>Size:
                    <input type="number" min="8" max="200"
                        value={selectedObject.fontSize || 24}
                        onChange={e => {
                            saveHistoryOnceThenSkip();
                            updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontSize: +e.target.value }, true);
                        }}
                        style={{ width: '50px', background: '#222', border: '1px solid var(--border-strong, #555)', color: 'white', borderRadius: '3px', padding: '2px 5px', marginLeft: '5px' }}
                    />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input type="checkbox"
                        checked={selectedObject.fontWeight === 'bold'}
                        onChange={e => {
                            saveHistoryOnceThenSkip();
                            updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontWeight: e.target.checked ? 'bold' : 'normal' }, true);
                        }}
                    />
                    Bold
                </label>
                <input type="color"
                    value={selectedObject.fill || '#000000'}
                    onChange={e => {
                        // ドラッグ中の連続 onChange を間引く（コンテキストメニュー側と統一）。#06/30-4, refactoring A-8-2
                        const val = e.target.value;
                        const id = selectedIds[0];
                        saveHistoryOnceThenSkip();
                        commitThrottled(() => updateNoteObject(targetType, displayTargetId, id, { fill: val }, true));
                    }}
                    title="Text Color"
                    style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
                />
            </div>,
            document.body
        );
    };

    // Noteページの Tools 同様、テキスト付きの横長ボタン（compactの左ツールバー用）
    const toolTextBtnStyle = (isActive: boolean, disabled = false): React.CSSProperties => ({
        background: isActive ? 'rgba(0, 122, 204, 0.2)' : 'var(--surface-3, #333)',
        border: isActive ? '1px solid #007acc' : '1px solid #555',
        color: disabled ? '#666' : (isActive ? '#66b3ff' : 'var(--text-secondary, #ccc)'),
        boxShadow: isActive ? '0 0 8px rgba(0, 122, 204, 0.5)' : 'none',
        fontSize: '0.8rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '5px 6px',
        borderRadius: '4px',
        transition: 'all 0.2s',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'center',
        whiteSpace: 'nowrap'
    });

    // revise3 B-2: ツールバーの Undo/Redo ボタン用（useNoteKeyboard の Ctrl+Z/Y と同じ挙動）
    const handleUndo = () => { undoNote(); setSelectedIds([]); };
    const handleRedo = () => { redoNote(); setSelectedIds([]); };

    const renderPortalUI = () => {
        if (!compactMode) return null;

        return (
            <>
                <CompactToolbar
                    onUploadClick={() => fileInputRef.current?.click()}
                    showImageGallery={showImageGallery}
                    onToggleImageGallery={() => setShowImageGallery(v => !v)}
                    placementMode={placementMode}
                    onStartPlacement={(type) => startPlacement(type)}
                    onPaste={handlePasteClipboard}
                    clipboardEmpty={clipboard.length === 0}
                    onExportPng={handleExportPng}
                    freehandSettings={freehandSettings}
                    onFreehandSettingsChange={setFreehandSettings}
                    toolTextBtnStyle={toolTextBtnStyle}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    orientation={isMobileVp ? 'horizontal' : 'vertical'}
                />

                {showImageGallery && (
                    <ImageGalleryWindow
                        galleryPos={galleryPos}
                        isDraggingGallery={isDraggingGallery}
                        onDragStart={handleGalleryDragStart}
                        availableImages={availableImages}
                        onClose={() => setShowImageGallery(false)}
                        onSelectImage={(src) => { startPlacement('image', src); setShowImageGallery(false); }}
                    />
                )}
            </>
        );
    };


    // #06/28-14:10-5: compact(Animate)では単一/4ペインのどちらでも左にツールバーを常設する。
    // ツールバー幅を一度だけ計算し、ペイン領域(panesW)をその分だけ狭める。
    // 単一表示: 3:2を高さフィットした残り幅をツールバーに（余白を埋める）。4ペイン: 固定幅。
    const COMPACT_ASPECT = CANVAS_BASE_W / CANVAS_BASE_H; // 1.5
    // revise3 B-18: モバイルビューポートでは左ドックを畳み、下部の横スクロール列にツールを出す
    // （ただでさえ狭い紙面を左ドックがさらに削るのを避ける）。
    const isMobileVp = useViewport() === 'mobile';
    let compactToolbarW = 0;
    if (compactMode && !isMobileVp) {
        if (isGridMode) {
            compactToolbarW = Math.round(Math.min(150, Math.max(COMPACT_SIDE_MIN, canvasSize.width * 0.16)));
        } else {
            const canvasWAtHeightFit = canvasSize.height * COMPACT_ASPECT;
            // revise3 B-19: 横長セルで余白がすべてツールバーに回ると間延びする。上限180pxで止め、
            // 余りはペイン側のレターボックス余白（--canvas-margin）に回す。
            compactToolbarW = Math.min(180, Math.max(COMPACT_SIDE_MIN, Math.round(canvasSize.width - canvasWAtHeightFit)));
        }
    }
    const panesW = Math.max(0, canvasSize.width - compactToolbarW);

    // U3: 表示モード(単一/4面/編集)セグメント + 現在ペイン番号。desktop/compact-desktop は
    // Canvas右下のフロート、モバイルは上部バー/事件ノート折りたたみ行の横へ portal する。
    // compact=true で上部バーに収まるよう一段小さいサイズにする。
    const renderViewSegment = (compact = false) => (
        <>
            {([
                { key: 'single', label: '1面', title: '単一表示', onSelect: () => { setIsGridMode(false); setIsGridEditMode(false); } },
                { key: 'grid', label: '4面', title: '4ペイン表示', onSelect: () => { setIsGridMode(true); setIsGridEditMode(false); } },
                { key: 'edit', label: '編集', title: '4ペインをまとめて編集', onSelect: () => { setIsGridMode(true); setIsGridEditMode(true); } },
            ] as const).map(seg => {
                const active = seg.key === 'single' ? !isGridMode : seg.key === 'grid' ? (isGridMode && !isGridEditMode) : (isGridMode && isGridEditMode);
                return (
                    <button
                        key={seg.key}
                        onClick={seg.onSelect}
                        title={seg.title}
                        style={{
                            background: active ? '#007acc' : 'transparent',
                            border: 'none', color: active ? '#fff' : '#aaa',
                            borderRadius: '5px', padding: compact ? '3px 7px' : '6px 10px',
                            fontSize: compact ? '0.72rem' : '0.78rem', cursor: 'pointer',
                            fontWeight: active ? 'bold' : 'normal', minHeight: compact ? '28px' : '36px',
                            flexShrink: 0,
                        }}
                    >
                        {seg.label}
                    </button>
                );
            })}
            {/* revise3 B-12: 単一表示では左上ラベルの代わりに現在ペイン番号を小さく表示 */}
            {!isGridMode && (
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: compact ? '0.66rem' : '0.72rem', color: '#888', whiteSpace: 'nowrap' }}>
                    Canvas {currentCanvasIndex + 1}
                </span>
            )}
        </>
    );

    // モバイル: 表示モードセグメントは専用行をやめ、上部バー（Note）/事件ノート折りたたみ行（Animate）の
    // 横へ portal する。スロットは Animate 側を優先し、無ければ上部バーへ。
    // getElementById は初回描画時にまだ DOM 未コミットのことがあるため effect で解決する（compactSlot と同じ流儀）。
    const [viewSegSlot, setViewSegSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (!(compactMode && isMobileVp)) { setViewSegSlot(null); return; }
        setViewSegSlot(document.getElementById('animate-note-viewseg-slot') ?? document.getElementById('mobile-appbar-slot'));
    }, [compactMode, isMobileVp, targetType, displayTargetId]);

    return (
        <div
            className={compactMode ? "" : "character-canvas-layout"}
            style={compactMode ? { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } : { width: '100%', height: '100%', gridTemplateRows: '1fr' }}
        >
            {/* compact のCanvas操作ツールバーは pane の左余白にドックする（下の pane 内で renderPortalUI を描画） */}
            {renderFloatingTextToolbar()}
            {compactMode && <input type="file" ref={fileInputRef} style={{display:'none'}} accept="image/*" onChange={handleImageUpload} />}

            {/* モバイル: プリセット/キャラ選択の横並びヘッダ（smartphone.md M1） */}
            {compactMode && headerBar && (
                <div style={{ flexShrink: 0, display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', overflowX: 'auto', background: 'var(--surface-2, #252526)', borderBottom: '1px solid var(--border-default, #333)' }}>
                    {headerBar}
                </div>
            )}

            {!compactMode && (
                <NoteToolsSidebar
                    sidebarHeader={sidebarHeader}
                    sidebarHeaderDivider={sidebarHeaderDivider}
                    fileInputRef={fileInputRef}
                    onImageUpload={handleImageUpload}
                    placementMode={placementMode}
                    onStartPlacement={startPlacement}
                    freehandSettings={freehandSettings}
                    onFreehandSettingsChange={setFreehandSettings}
                    snapOn={snapOn}
                    onToggleSnap={() => setSnapOn(v => !v)}
                    selectedIds={selectedIds}
                    onAlignLeft={handleAlignLeft}
                    onAlignTop={handleAlignTop}
                    onDistributeHorizontal={handleDistributeHorizontal}
                    onDistributeVertical={handleDistributeVertical}
                    onExportPng={handleExportPng}
                    onGatherOutside={handleGatherOutside}
                    portraitPalette={portraitPalette}
                    assets={assets}
                    targetType={targetType}
                    characterPortraits={CHARACTER_PORTRAITS}
                    onAssetContextMenu={(asset, x, y) => setAssetContextMenu({ asset, x, y })}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                />
            )}

            <div
                className="char-canvas-wrapper"
                ref={canvasContainerRef}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{
                    backgroundColor: 'var(--canvas-margin, #1e1e1e)',
                    backgroundImage: 'none',
                    // ▼ 修正: 外側の不要なパディングを0にして、キャンバスを枠いっぱいに広げる
                    padding: 0,
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: canvasOpacity,
                    transition: 'opacity 0.2s ease-in-out',
                    gridRow: '1 / -1',
                    position: 'relative', // compact時のSelectionContextBar overlay(absolute)の基準
                }}
            >
                {/* revise3 B-10: 配置モード中であることの常時表示 + 即時解除手段。
                    タッチにはカーソル(crosshair)が無いため、今どのモードかを見た目で示す。 */}
                {placementMode && (
                    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
                                  display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,122,204,0.9)', color: '#fff',
                                  borderRadius: 16, padding: '4px 12px', fontSize: '0.78rem', pointerEvents: 'auto' }}>
                        <span>{PLACEMENT_LABELS[placementMode.type] ?? placementMode.type} 配置中</span>
                        <button onClick={() => setPlacementMode(null)}
                            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}
                            title="解除 (Esc)">✕</button>
                    </div>
                )}
                {/* 0711 #4: 選択中オブジェクトの操作バー。desktopはContextBar中央スロットへportal
                    （選択の有無でレイアウトが動かない）、compactはCanvas上端へabsolute overlay
                    （Canvas高さを変えない。旧: 通常フロー挿入で36px分押し下げていた）。 */}
                {compactMode ? (
                    compactSlot
                        ? (selectedIds.length > 0 && createPortal(selectionBar, compactSlot))
                        : (
                            // revise3 B-7: モバイル Note（+ compact だがスロット無しの全環境）では
                            // overlay ではなく常設の高さ36px行に置く（選択の出没でキャンバスが動かない・被らない）。
                            <div style={{ flexShrink: 0, height: 36, display: 'flex', alignItems: 'center', overflowX: 'auto',
                                          background: 'var(--surface-2)', borderBottom: '1px solid var(--border-default)' }}>
                                {selectedIds.length > 0 ? selectionBar : (
                                    <span style={{ padding: '0 10px', fontSize: '0.72rem', color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>
                                        オブジェクトをタップで選択 / ツールをもう一度タップで解除
                                    </span>
                                )}
                            </div>
                        )
                ) : (
                    selectedIds.length > 0 && selectionSlot && createPortal(selectionBar, selectionSlot)
                )}
                <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
                {/* compact: 左にCanvas操作ツールバーを常設（単一表示でも4ペインでも）。#06/28-14:10-5
                    revise3 B-18: モバイルビューポートでは左ドックを畳み、下部の横スクロール列へ移す。 */}
                {compactMode && !isMobileVp && compactToolbarW > 4 && (
                    <div style={{ width: `${compactToolbarW}px`, flexShrink: 0, height: '100%', overflowY: 'auto', background: 'var(--surface-1, #1a1a1a)', borderRight: '1px solid var(--surface-3, #333)', display: 'flex', flexDirection: 'column' }}>
                        {renderPortalUI()}
                    </div>
                )}
                <div style={{
                    display: isGridMode ? 'grid' : 'flex',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
                    // ▼ 修正: 4ペイン表示の時は、ペイン間のみ隙間(gap)を設定する
                    gap: isGridMode ? '4px' : '0px',
                    width: compactMode ? `${panesW}px` : '100%',
                    height: '100%',
                    flex: compactMode ? '0 0 auto' : 1,
                    position: 'relative'
                }}>
                    {panesW > 0 && [0, 1, 2, 3].map(index => {
                        if (!isGridMode && currentCanvasIndex !== index) return null;

                        const isCurrent = currentCanvasIndex === index;
                        const isHovered = hoveredCanvasIndex === index;

                        // 外側のパディングをなくしたため、幅の計算から引くのはgap分のみ
                        // compactではツールバー分を除いたペイン領域幅(panesW)を基準にする。
                        const gapWidth = isGridMode ? 4 : 0;
                        const areaW = compactMode ? panesW : canvasSize.width;
                        const cellWidth = isGridMode ? (areaW - gapWidth) / 2 : areaW;
                        const cellHeight = isGridMode ? (canvasSize.height - gapWidth) / 2 : canvasSize.height;

                        const borderWidth = (isGridMode && !compactMode) ? 2 : 0;
                        const stageWidth = Math.max(0, cellWidth - (borderWidth * 2));
                        const stageHeight = Math.max(0, cellHeight - (borderWidth * 2));

                        // compact/非compact 共通の論理キャンバスサイズ (1200×800)
                        // ズームやウィンドウリサイズでも論理座標系が変わらないよう scale で吸収する
                        const CANVAS_BASE_WIDTH = CANVAS_BASE_W;
                        const CANVAS_BASE_HEIGHT = CANVAS_BASE_H;
                        // 単一表示・4ペイン表示とも「ステージ(=セル)いっぱいにフィット」で統一する。
                        // stageWidth/stageHeight は単一表示ならコンテナ、グリッドなら各セルの実寸。
                        // コンテナ/セルは width/height 100% ＝物理サイズ一定なので、ブラウザの Ctrl+/− ズームで
                        // 内部のCSSピクセルが変わってもキャンバスは埋め続け、見かけ(物理)サイズが一定になる。
                        // （旧: 単一は min(...,1) の上限で非対称縮小、グリッドは固定0.5でズーム非対応だった）
                        const scale = Math.min(stageWidth / CANVAS_BASE_WIDTH, stageHeight / CANVAS_BASE_HEIGHT);
                        // ステージ(=描画キャンバス)は論理1200×800の比率を厳守し、セルに対して
                        // レターボックスで中央配置する。これにより Animate と 事件ノート で
                        // 「描画/可視領域(=1200×800)」が完全一致し、端に置いたオブジェクトも双方で見える。
                        // 周囲の暗色マージン(セルとの差分)が活用したい余白領域。
                        // Note/Animate を統一: 事件ノートの「基準範囲(1200×800, 3:2)」を Canvas領域へ
                        // アスペクト比維持でフィットさせる。Stage自体を基準範囲のフィット実寸にするので、
                        // 範囲外はクリック/配置できず、ウィンドウリサイズでも一様な拡大縮小（=レイアウト安定）になる。
                        // 事件ノート(preset)だけが基準範囲(3:2)フィット。Animateとの整合のため範囲外は配置不可。
                        // 全体/キャラクター/メモ(overview/character/misc)は「要素いっぱいに広げる(fill)」方式
                        // （ズームでサイズ変更しないが余白も作らない）。#06/28-3:58-1
                        // ツールバーはペイン外(左の常設ストリップ)に出したので、ここでは Stage をセル中央に配置する。
                        const useRangeFit = targetType === 'preset';
                        let effScale: number;
                        let stageRenderW: number;
                        let stageRenderH: number;
                        if (useRangeFit) {
                            // 基準範囲フィット（中央レターボックス）
                            effScale = Math.min(stageWidth / CANVAS_BASE_W, stageHeight / CANVAS_BASE_H);
                            stageRenderW = CANVAS_BASE_W * effScale;
                            stageRenderH = CANVAS_BASE_H * effScale;
                        } else {
                            // 0711_2 #1: 「fill × 縮尺安定」方式。
                            // - 縮尺(effScale)は stableSize（ウィンドウ基準の安定寸）だけから決める
                            //   → パネル開閉ではズームしない（ウィンドウ自体のリサイズ時のみ再フィット）。
                            // - 紙面(Stage)は常にセルいっぱい（レターボックスを作らない＝グレー余白を出さない）。
                            //   セルが安定寸より広ければ紙面がその分広がり、狭ければ右/下端がパネルの下に隠れる
                            //   （「机に固定された紙の上をパネルが滑る」挙動。隠れた分は 🧲回収 で戻せる）。
                            // - stableSize == 実寸のときは旧 fill と完全一致（compact は常にこちら＝従来どおり）。
                            const useStable = !compactMode && stableSize.width > 0;
                            const baseAreaW = useStable ? stableSize.width : areaW;
                            const baseAreaH = useStable ? stableSize.height : canvasSize.height;
                            const baseCellW = Math.max(1, (isGridMode ? (baseAreaW - gapWidth) / 2 : baseAreaW) - borderWidth * 2);
                            const baseCellH = Math.max(1, (isGridMode ? (baseAreaH - gapWidth) / 2 : baseAreaH) - borderWidth * 2);
                            effScale = Math.min(baseCellW / CANVAS_BASE_W, baseCellH / CANVAS_BASE_H);
                            stageRenderW = stageWidth;    // 常にセル実寸＝グレー余白なし
                            stageRenderH = stageHeight;
                        }
                        const stageOffsetX = (stageWidth - stageRenderW) / 2;
                        const stageOffsetY = (stageHeight - stageRenderH) / 2;
                        // revise3 B-3: compact(タッチ)時のみピンチズーム/パンを合成適用する。
                        // デスクトップ(非compact)は touchView が常に恒等のため無変化。
                        const layerScale = effScale * (compactMode ? touchView.scale : 1);
                        const layerX = compactMode ? touchView.x : 0;
                        const layerY = compactMode ? touchView.y : 0;

                        const objs = objects.filter(o => (o.canvasIndex || 0) === index);

                        return (
                            <div
                                key={index}
                                ref={(el) => { paneRefs.current[index] = el; }}
                                onMouseEnter={() => { if (isGridMode) setHoveredCanvasIndex(index); }}
                                onMouseLeave={() => { if (isGridMode) setHoveredCanvasIndex(null); }}
                                style={{
                                    width: '100%', height: '100%',
                                    position: 'relative',
                                    boxSizing: 'border-box',
                                    // 編集モード中はホバー効果(青枠の浮き上がり)を出さない。ペイン選択時のみホバーを示す。
                                    border: isGridMode ? (((isHovered && !isGridEditMode) || isCurrent) ? '2px solid #007acc' : '2px solid var(--border-default, #444)') : (compactMode ? 'none' : 'none'),
                                    boxShadow: isGridMode && isHovered && !isGridEditMode ? '0 0 12px rgba(0, 122, 204, 0.8)' : 'none',
                                    transition: 'all 0.2s',
                                    overflow: 'hidden',
                                    // Note/Animate統一: セル(pane)は暗色マージン、紙面(方眼)はStage(=基準範囲)側に表示し中央配置。
                                    backgroundColor: 'var(--canvas-margin, #1e1e1e)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title={isGridMode && !isGridEditMode ? 'ダブルクリックで拡大' : undefined}
                                onClick={(e) => {
                                    // revise3 B-9: シングルクリックは対象ペイン切替のみ。単一表示への拡大は
                                    // ダブルクリック/ダブルタップに限定する（4面を俯瞰用途で使うため、
                                    // 触れただけでモードが変わるのを防ぐ）。
                                    if (!(isGridMode && !isGridEditMode)) return;
                                    const now = performance.now();
                                    const isDouble = lastPaneTapRef.current.index === index && now - lastPaneTapRef.current.t < 350;
                                    lastPaneTapRef.current = { index, t: now };
                                    if (isDouble) {
                                        setCurrentCanvasIndex(index);
                                        setSelectedIds([]);
                                        setIsGridMode(false);
                                    } else {
                                        setCurrentCanvasIndex(index);   // 選択ペインの青枠だけ移動
                                    }
                                    e.stopPropagation();
                                }}
                            >
                                {/* revise3 B-12: 単一表示ではラベルが紙面左上を常時占有し描画物と重なるため、4面のみ表示 */}
                                {isGridMode && (
                                <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', zIndex: 10, pointerEvents: 'none' }}>
                                    Canvas {index + 1}
                                </div>
                                )}

                                <Stage
                                    ref={(node) => { stageRefs.current[index] = node; }}
                                    width={stageRenderW} height={stageRenderH}
                                    listening={!isGridMode || isGridEditMode}
                                    onMouseDown={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;

                                        if (isGridMode && isGridEditMode && !isCurrent) {
                                            setCurrentCanvasIndex(index);
                                            setSelectedIds([]);
                                        }

                                        handleStageMouseDown(e, index, scale);
                                    }}
                                    onMouseMove={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;
                                        handleStageMouseMove(e, index, scale);
                                    }}
                                    onMouseUp={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;
                                        handleStageMouseUp(e, index, scale);
                                    }}
                                    onTouchStart={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;
                                        if (isGridMode && isGridEditMode && !isCurrent) {
                                            setCurrentCanvasIndex(index);
                                            setSelectedIds([]);
                                        }
                                        // revise3 B-3: 2本指はピンチズーム/パンとして予約（A-15と同じ理由で描画系には渡さない）
                                        if (compactMode && e.evt.touches.length === 2) {
                                            e.evt.preventDefault();
                                            pinchRef.current = null; // 次の move で基準を初期化
                                            return;
                                        }
                                        handleStageMouseDown(e, index, scale);
                                    }}
                                    onTouchMove={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;
                                        if (compactMode && e.evt.touches.length === 2) {
                                            e.evt.preventDefault();
                                            const [t0, t1] = [e.evt.touches[0], e.evt.touches[1]];
                                            const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                                            const midX = (t0.clientX + t1.clientX) / 2;
                                            const midY = (t0.clientY + t1.clientY) / 2;
                                            if (!pinchRef.current) {
                                                pinchRef.current = { startDist: dist, startScale: touchView.scale, startMidX: midX, startMidY: midY, startViewX: touchView.x, startViewY: touchView.y };
                                                return;
                                            }
                                            const p = pinchRef.current;
                                            const newScale = Math.min(4, Math.max(1, p.startScale * (dist / Math.max(1, p.startDist))));
                                            const ratio = newScale / p.startScale;
                                            const rawX = midX - (p.startMidX - p.startViewX) * ratio;
                                            const rawY = midY - (p.startMidY - p.startViewY) * ratio;
                                            // 紙面が完全に画面外へ出ない範囲にクランプ
                                            const maxPanX = stageRenderW * newScale;
                                            const maxPanY = stageRenderH * newScale;
                                            setTouchView({
                                                scale: newScale,
                                                x: Math.min(stageRenderW * 0.5, Math.max(stageRenderW * 0.5 - maxPanX, rawX)),
                                                y: Math.min(stageRenderH * 0.5, Math.max(stageRenderH * 0.5 - maxPanY, rawY)),
                                            });
                                            return;
                                        }
                                        handleStageMouseMove(e, index, scale);
                                    }}
                                    onTouchEnd={(e) => {
                                        if (isGridMode && !isGridEditMode && !isCurrent) return;
                                        if (compactMode) {
                                            if (e.evt.touches.length < 2) pinchRef.current = null;
                                            if (e.evt.touches.length === 0) {
                                                // revise3 B-3: ダブルタップでリセット
                                                const now = performance.now();
                                                if (touchView.scale !== 1 && now - lastTapRef.current < 350) {
                                                    setTouchView({ scale: 1, x: 0, y: 0 });
                                                    lastTapRef.current = 0;
                                                } else {
                                                    lastTapRef.current = now;
                                                }
                                            }
                                        }
                                        handleStageMouseUp(e, index, scale);
                                    }}
                                    onContextMenu={(e) => e.evt.preventDefault()}
                                    style={{
                                        cursor: placementMode && isCurrent ? 'crosshair' : (isGridMode && !isGridEditMode ? 'pointer' : 'default'),
                                        // 紙面(方眼)はStage(=基準範囲1200×800)に表示。周囲のセルは暗色マージン。
                                        backgroundColor: '#ECD2B3',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 24 0 L 0 0 0 24' fill='none' stroke='%23C2B2A1' stroke-width='1' stroke-dasharray='3 3'/%3E%3C/svg%3E")`,
                                        backgroundSize: `${24 * effScale}px ${24 * effScale}px`
                                    }}
                                >
                                    <Layer scaleX={layerScale} scaleY={layerScale} x={layerX} y={layerY}>
                                        {isFontLoaded && objs.map((obj) => {
                                            if (obj.id === editingTextId) return null;

                                            // グループドラッグ: ドラッグ中に同グループの他メンバーを追従させる
                                            const groupDragHandlers = obj.groupId ? {
                                                onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
                                                    const dx = e.target.x() - (obj.x ?? 0);
                                                    const dy = e.target.y() - (obj.y ?? 0);
                                                    const stage = stageRefs.current[index];
                                                    objs
                                                        .filter(o => o.groupId === obj.groupId && o.id !== obj.id)
                                                        .forEach(member => {
                                                            const node = stage?.findOne(`#${member.id}`);
                                                            if (node) {
                                                                node.x((member.x ?? 0) + dx);
                                                                node.y((member.y ?? 0) + dy);
                                                            }
                                                        });
                                                    stage?.getLayers()[0]?.batchDraw();
                                                },
                                            } : {};

                                            const props = {
                                                obj,
                                                isDrawingMode,
                                                ...groupDragHandlers,
                                                // 最重要2: 複数選択の連動ドラッグ。Transformer の _proxyDrag は attach 済みノード（非テキスト）
                                                // 同士にしか効かないため、(a) 起点が何であれ選択中テキストへ、(b) 起点がテキストなら選択中
                                                // 非テキストへも、startDrag を伝播する。isDragging() ガードで二重開始しない。
                                                onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
                                                    setDraggingSelection(true);
                                                    // ドラッグ開始時点の座標を基準として固定（revise2 №16: dragend 二重適用防止）
                                                    const base = new Map<string, { x: number; y: number }>();
                                                    objs.forEach(o => base.set(o.id, { x: o.x ?? 0, y: o.y ?? 0 }));
                                                    dragBaseRef.current = base;

                                                    if (selectedIds.length < 2 || !selectedIds.includes(obj.id)) return;
                                                    const stage = stageRefs.current[index];
                                                    if (!stage) return;
                                                    objs.forEach(o => {
                                                        if (o.id === obj.id || !selectedIds.includes(o.id)) return;
                                                        // 起点が非テキストの場合、非テキスト同士は Transformer が連動させるので対象外
                                                        if (obj.type !== 'text' && o.type !== 'text') return;
                                                        const node = stage.findOne(`#${o.id}`);
                                                        if (node && !node.isDragging()) node.startDrag(e);
                                                    });
                                                },
                                                // ドラッグ確定はグループ/単体ともに統一ハンドラへ（#4 ペイン跨ぎ移動対応）
                                                onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleObjectDragEnd(e, obj, index, scale),
                                                onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;

                                                    if (isGridMode && isGridEditMode && !isCurrent) {
                                                        setCurrentCanvasIndex(index);
                                                    }

                                                    if (placementMode) return;
                                                    if (e.evt?.shiftKey) {
                                                        setSelectedIds(prev => prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]);
                                                    } else if (obj.groupId) {
                                                        setSelectedIds(currentCanvasObjects.filter(o => o.groupId === obj.groupId).map(o => o.id));
                                                    } else {
                                                        setSelectedIds([obj.id]);
                                                    }
                                                },
                                                onChange: (newAttrs: Partial<NoteObject>) => {
                                                    saveHistoryOnceThenSkip();
                                                    updateNoteObject(targetType, displayTargetId, obj.id, newAttrs, true);
                                                },
                                                onToggleEdit: () => {
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;
                                                    if (isGridMode && isGridEditMode && !isCurrent) setCurrentCanvasIndex(index);

                                                    const stage = trRefs.current[index]?.getStage();
                                                    const textNode = stage?.findOne(`#${obj.id}`);
                                                    editingTextBoundsRef.current = textNode
                                                        ? { width: Math.max(50, textNode.width() * effScale) }
                                                        : null;

                                                    setEditingTextValue(obj.text ?? '');
                                                    editingTextValueRef.current = obj.text ?? '';
                                                    editingTextIdRef.current = obj.id;
                                                    setEditingTextId(obj.id);
                                                    setSelectedIds([]);
                                                },
                                                onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;
                                                    if (isGridMode && isGridEditMode && !isCurrent) setCurrentCanvasIndex(index);

                                                    handleShapeContextMenu(e, obj);
                                                },
                                                // revise3 B-4: 長押し(500ms・移動10px未満)でタッチからも ShapeContextMenu を開く
                                                onTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => {
                                                    if (e.evt.touches.length !== 1) return;
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;
                                                    const t = e.evt.touches[0];
                                                    if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
                                                    longPressRef.current = {
                                                        x: t.clientX, y: t.clientY,
                                                        timer: setTimeout(() => {
                                                            setShapeContextMenu({
                                                                id: obj.id, type: obj.type as ExtendedNoteObjectType,
                                                                x: t.clientX, y: t.clientY,
                                                                stroke: obj.stroke || '#000000',
                                                                strokeWidth: obj.strokeWidth || 2,
                                                                fill: obj.fill,
                                                                lineStyle: obj.lineStyle || 'normal',
                                                            });
                                                        }, 500),
                                                    };
                                                },
                                            };

                                            if (obj.type === 'image') return <URLImage key={obj.id} {...props} />;
                                            if (obj.type === 'text') return <EditableText key={obj.id} {...props} />;
                                            return <ShapeObject key={obj.id} {...props} />;
                                        })}

                                        {/* 複数選択時、テキストノードの選択インジケーター（Transformerが除外するため個別描画）。
                                            実ノードの実寸を使う（旧: 固定推定値のため長文/改行テキストと食い違っていた。revise2 №17） */}
                                        {selectedIds.length > 1 && objs
                                            .filter(o => o.type === 'text' && selectedIds.includes(o.id))
                                            .map(o => {
                                                const node = stageRefs.current[index]?.findOne(`#${o.id}`);
                                                const w = node ? node.width() * (node.scaleX() || 1) : (o.width || 150);
                                                const h = node ? node.height() * (node.scaleY() || 1) : (o.fontSize || 24) * 1.5;
                                                return (
                                                    <Rect
                                                        key={`sel_indicator_${o.id}`}
                                                        name="__export_exclude"
                                                        x={(o.x ?? 0) - 2}
                                                        y={(o.y ?? 0) - 2}
                                                        width={w + 4}
                                                        height={h + 4}
                                                        stroke="#007acc"
                                                        strokeWidth={1 / effScale}
                                                        dash={[4 / effScale, 4 / effScale]}
                                                        fill="transparent"
                                                        listening={false}
                                                    />
                                                );
                                            })
                                        }

                                        {drawingActive && drawingShapeInfoRef.current && drawingShapeInfoRef.current.canvasIndex === index && (
                                            (drawingShapeInfoRef.current.type as string) === 'freehand' ? (
                                                <Line
                                                    ref={(node) => { drawingNodeRef.current = node; }}
                                                    x={drawingShapeInfoRef.current.x}
                                                    y={drawingShapeInfoRef.current.y}
                                                    points={drawingShapeInfoRef.current.points || []}
                                                    stroke={drawingShapeInfoRef.current.stroke}
                                                    strokeWidth={drawingShapeInfoRef.current.strokeWidth}
                                                    tension={0.5}
                                                    lineCap="round"
                                                    lineJoin="round"
                                                    listening={false}
                                                />
                                            ) : (['rect', 'circle', 'triangle', 'image'].includes(drawingShapeInfoRef.current.type as string)) ? (
                                                <Rect
                                                    ref={(node) => { drawingNodeRef.current = node; }}
                                                    x={drawingShapeInfoRef.current.x}
                                                    y={drawingShapeInfoRef.current.y}
                                                    width={drawingShapeInfoRef.current.width || 0}
                                                    height={drawingShapeInfoRef.current.height || 0}
                                                    fill="rgba(168, 213, 186, 0.25)"
                                                    stroke="#007acc"
                                                    strokeWidth={1.5}
                                                    dash={[6, 4]}
                                                    listening={false}
                                                />
                                            ) : (
                                                <Arrow
                                                    ref={(node) => { drawingNodeRef.current = node; }}
                                                    x={drawingShapeInfoRef.current.x}
                                                    y={drawingShapeInfoRef.current.y}
                                                    points={drawingShapeInfoRef.current.points || []}
                                                    stroke={drawingShapeInfoRef.current.stroke}
                                                    strokeWidth={drawingShapeInfoRef.current.strokeWidth}
                                                    pointerLength={['arrow', 'curve_arrow'].includes(drawingShapeInfoRef.current.type as string) ? 10 : 0}
                                                    pointerWidth={['arrow', 'curve_arrow'].includes(drawingShapeInfoRef.current.type as string) ? 10 : 0}
                                                    tension={['curve', 'curve_arrow'].includes(drawingShapeInfoRef.current.type as string) ? 0.5 : 0}
                                                    listening={false}
                                                />
                                            )
                                        )}

                                        {isCurrent && (() => {
                                            const isOnlyText = selectedIds.length === 1 && selectedObject?.type === 'text';
                                            return (
                                                <Transformer
                                                    ref={(el) => { trRefs.current[index] = el; }}
                                                    name="__export_exclude"
                                                    // revise3 B-20: Konva既定10pxではモバイルの縮小率と相まってハンドルが掴めない
                                                    anchorSize={compactMode ? 16 : 10}
                                                    anchorCornerRadius={compactMode ? 4 : 0}
                                                    rotateAnchorOffset={compactMode ? 36 : 50}
                                                    padding={compactMode ? 6 : 0}
                                                    boundBoxFunc={(oldBox, newBox) => {
                                                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                                                        return newBox;
                                                    }}
                                                    keepRatio={
                                                        selectedIds.length === 1
                                                            ? (selectedObject?.type === 'circle' || selectedObject?.type === 'triangle' ||
                                                               (selectedObject?.type === 'image' && (selectedObject?.keepRatio ?? true)))
                                                            // 複数選択に比率維持画像/円/三角が含まれるなら全体をkeepRatioにする。
                                                            // 旧: 単独選択しか見ておらず、複数選択に立ち絵が混ざると自由比率で伸縮され歪んでいた（revise2 №14）
                                                            : currentCanvasObjects.some(o => selectedIds.includes(o.id) &&
                                                               (o.type === 'circle' || o.type === 'triangle' || (o.type === 'image' && (o.keepRatio ?? true))))
                                                    }
                                                    enabledAnchors={isOnlyText ? [] : undefined}
                                                    rotateEnabled={!isOnlyText}
                                                />
                                            );
                                        })()}

                                        {selectionRect.visible && selectionRect.canvasIndex === index && (
                                            <Rect
                                                x={Math.min(selectionRect.startX, selectionRect.startX + selectionRect.w)}
                                                y={Math.min(selectionRect.startY, selectionRect.startY + selectionRect.h)}
                                                width={Math.abs(selectionRect.w)}
                                                height={Math.abs(selectionRect.h)}
                                                fill="rgba(0, 122, 204, 0.2)"
                                                stroke="#007acc"
                                                strokeWidth={1 / effScale}
                                                listening={false}
                                            />
                                        )}
                                    </Layer>
                                </Stage>

                                {/* compact のCanvas操作ツールバーはペイン外(左の常設ストリップ)へ移動済み(#06/28-14:10-5) */}

                                {isCurrent && editingTextId && (() => {
                                    const obj = objs.find(o => o.id === editingTextId);
                                    if (!obj || obj.type !== 'text') return null;
                                    const editWidth = editingTextBoundsRef.current?.width ?? 200;
                                    return (
                                        <textarea
                                            key={editingTextId}
                                            value={editingTextValue}
                                            ref={(el) => {
                                                if (el) {
                                                    el.style.height = 'auto';
                                                    el.style.height = `${el.scrollHeight}px`;
                                                }
                                            }}
                                            onChange={(e) => {
                                                // ローカル状態のみ更新（store コミットは確定時）。全再描画を避けフレーム落ちを防ぐ。
                                                setEditingTextValue(e.target.value);
                                                editingTextValueRef.current = e.target.value;
                                                const el = e.target;
                                                el.style.height = 'auto';
                                                el.style.height = `${el.scrollHeight}px`;
                                            }}
                                            onBlur={() => finishTextEditing()}
                                            onKeyDown={(e) => {
                                                // IME変換中（日本語入力中）は一切横取りしない。
                                                // 変換確定の Enter 等をアプリが奪ってローマ字強制になるのを防ぐ。
                                                if (e.nativeEvent.isComposing || e.keyCode === 229) {
                                                    e.stopPropagation();
                                                    return;
                                                }
                                                // #06/28-17:04-4: Enter で確定、Shift+Enter で改行。
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    finishTextEditing();
                                                } else if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    finishTextEditing();
                                                }
                                                e.stopPropagation();
                                            }}
                                            autoFocus
                                            style={{
                                                position: 'absolute',
                                                // revise3 B-3: ピンチズーム中もテキスト編集の位置/フォントサイズが追従する
                                                top: stageOffsetY + layerY + obj.y * layerScale,
                                                left: stageOffsetX + layerX + obj.x * layerScale,
                                                width: `${editWidth}px`,
                                                height: 'auto',
                                                minHeight: `${(obj.fontSize || 24) * 1.4 * layerScale}px`,
                                                fontSize: `${(obj.fontSize || 24) * layerScale}px`,
                                                fontWeight: obj.fontWeight || 'normal',
                                                fontFamily: HANDWRITING_FONT,
                                                color: obj.fill || 'black',
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px dashed #007acc',
                                                outline: 'none',
                                                resize: 'none',
                                                overflow: 'hidden',
                                                padding: '2px',
                                                transform: `rotate(${obj.rotation || 0}deg)`,
                                                transformOrigin: 'top left',
                                                zIndex: 100,
                                                boxSizing: 'border-box',
                                                lineHeight: '1.4',
                                            }}
                                        />
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
                </div>

                {/* モバイル: 表示モード切替(1面/4面/編集)は専用行をやめ、上部バー（Note）/
                    事件ノート折りたたみ行（Animate）の横へ portal する（縦の圧迫解消）。
                    スロットが未解決の初回のみ、従来の専用行にフォールバックする。 */}
                {compactMode && isMobileVp && (
                    viewSegSlot
                        ? createPortal(<div className="note-viewseg">{renderViewSegment(true)}</div>, viewSegSlot)
                        : (
                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                                          background: 'var(--surface-1, #1a1a1a)', borderTop: '1px solid var(--border-default, #333)' }}>
                                <div style={{ display: 'flex', gap: 2, backgroundColor: 'rgba(30, 30, 30, 0.85)', borderRadius: 8,
                                              padding: 3, border: '1px solid var(--border-default, #444)' }}>
                                    {renderViewSegment()}
                                </div>
                            </div>
                        )
                )}

                {/* revise3 B-18: モバイルビューポートでは左ドックの代わりに下部の横スクロール列にツールを出す。
                    末尾に FAB(ヘルプ?ボタン)幅ぶんのスペーサを置き、最後尾のツールが FAB の下に隠れないようにする。 */}
                {compactMode && isMobileVp && (
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'row', gap: 4, overflowX: 'auto',
                                  padding: '4px 6px', background: 'var(--surface-1, #1a1a1a)', borderTop: '1px solid var(--border-default, #333)',
                                  WebkitOverflowScrolling: 'touch' }}>
                        {renderPortalUI()}
                        <div aria-hidden style={{ flex: '0 0 52px' }} />
                    </div>
                )}

                {/* U3: 表示モードセグメント（desktop / compact-desktop は Canvas 右下のフロート）。
                    モバイルは上の専用行へ移設済みのため、ここでは非モバイル時のみ描画する。 */}
                {!(compactMode && isMobileVp) && (
                    <div style={{
                        position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000,
                        display: 'flex', backgroundColor: 'rgba(30, 30, 30, 0.85)', borderRadius: '8px',
                        padding: '3px', gap: '2px', border: '1px solid var(--border-default, #444)', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    }}>
                        {renderViewSegment()}
                    </div>
                )}

                {shapeContextMenu && (
                    <ShapeContextMenu
                        menu={shapeContextMenu}
                        setMenu={setShapeContextMenu}
                        targetType={targetType}
                        displayTargetId={displayTargetId}
                        updateNoteObject={updateNoteObject}
                        updateNoteObjects={updateNoteObjects}
                        commitThrottled={commitThrottled}
                        saveHistoryOnceThenSkip={saveHistoryOnceThenSkip}
                        reorderNoteObject={reorderNoteObject}
                        selectedIds={selectedIds}
                    />
                )}

                {assetContextMenu && (
                    <div
                        style={{
                            // revise3 B-5: 高さ固定(~36px)なので簡易クランプで画面外はみ出しを防ぐ
                            position: 'fixed', top: Math.min(assetContextMenu.y, window.innerHeight - 44), left: Math.min(assetContextMenu.x, window.innerWidth - 130),
                            background: 'var(--surface-3, #1e1e1e)', border: '1px solid var(--border-default, #444)', borderRadius: '4px', zIndex: 1000002
                        }}
                    >
                        <div
                            style={{ padding: '8px 12px', cursor: 'pointer', color: '#ff4444', fontSize: '0.9rem' }}
                            onClick={() => {
                                const idx = assets.indexOf(assetContextMenu.asset);
                                if (idx !== -1) removeNoteAsset(targetType, displayTargetId, idx);
                                else toast.info('この画像は既に削除されています');
                                setAssetContextMenu(null);
                            }}
                        >
                            Delete Image
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
