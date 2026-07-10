import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect, Arrow, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import { useAppStore, NoteObject, NoteObjectType, NoteTargetType } from '../../store';
import { NOTE_CANVAS } from '../../constants';
import { putAsset } from '../../services/assetStore';
import { toast } from '../../services/toast';
import { downloadDataUrl } from '../../utils/download';
import { HANDWRITING_FONT, applyChaikin, CHARACTER_PORTRAITS, ExtendedNoteObjectType, FreehandSettings, PlacementMode } from './noteConstants';
import { getImageSizeFromUrl, processFile } from '../../utils/imageUtils';
import { URLImage, EditableText, ShapeObject } from './NoteObjectComponents';
import { ImageGalleryWindow } from './ImageGalleryWindow';
import { CompactToolbar } from './CompactToolbar';
import { ShapeContextMenu, ShapeContextMenuState } from './ShapeContextMenu';
import { NoteToolsSidebar } from './NoteToolsSidebar';
import { useNoteClipboard } from '../../hooks/useNoteClipboard';
import { useNoteKeyboard } from '../../hooks/useNoteKeyboard';
import { useTextEditing } from '../../hooks/useTextEditing';
import { useNoteHistoryBatch } from '../../hooks/useNoteHistoryBatch';

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
}

export const CanvasWorkspace = React.memo(({ targetType, targetId, sidebarHeader, sidebarHeaderDivider = true, compactMode = false, headerBar, initialSelectId }: CanvasWorkspaceProps) => {

    const [displayTargetId, setDisplayTargetId] = useState(targetId);
    const [canvasOpacity, setCanvasOpacity] = useState(1);

    useEffect(() => {
        if (targetId !== displayTargetId) {
            setCanvasOpacity(0);
            const timer = setTimeout(() => {
                setDisplayTargetId(targetId);
                setTimeout(() => setCanvasOpacity(1), 50);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [targetId, displayTargetId]);

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
    const handleGalleryDragStart = (e: React.MouseEvent) => {
        const start = galleryPos ?? { x: window.innerWidth - 222, y: window.innerHeight - 16 - Math.round(window.innerHeight * 0.45) };
        setIsDraggingGallery(true);
        galleryDragRef.current = { x: e.clientX, y: e.clientY, posX: start.x, posY: start.y };
        if (!galleryPos) setGalleryPos(start);
    };
    useEffect(() => {
        if (!isDraggingGallery) return;
        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - galleryDragRef.current.x;
            const dy = e.clientY - galleryDragRef.current.y;
            setGalleryPos({ x: galleryDragRef.current.posX + dx, y: galleryDragRef.current.posY + dy });
        };
        const onUp = () => setIsDraggingGallery(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isDraggingGallery]);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const {
        editingTextId, setEditingTextId, editingTextValue, setEditingTextValue,
        editingTextValueRef, editingTextIdRef, editingTextBoundsRef, finishTextEditing,
    } = useTextEditing(targetType, displayTargetId, updateNoteObject, saveNoteHistory);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
    const [freehandSettings, setFreehandSettings] = useState<FreehandSettings>({
        color: '#000000',
        strokeWidth: 3,
        lineStyle: 'pen',
        stabilization: 2,
    });

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

    const { saveHistoryOnceThenSkip, commitThrottled } = useNoteHistoryBatch(saveNoteHistory);
    const [drawingActive, setDrawingActive] = useState(false);

    const [shapeContextMenu, setShapeContextMenu] = useState<ShapeContextMenuState | null>(null);
    const [assetContextMenu, setAssetContextMenu] = useState<{ index: number, x: number, y: number } | null>(null);

    const [isFontLoaded, setIsFontLoaded] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const trRefs = useRef<(Konva.Transformer | null)[]>([null, null, null, null]);
    // 4ペインそれぞれの DOM 要素。ペインをまたぐドラッグ移動(#4)のヒットテストに使う
    const paneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

    const objects = targetData?.objects || [];
    const assets = targetData?.assets || [];

    // 画像パレット/ギャラリーに出す画像。事件ノート(preset)では全キャラの立ち絵を常時利用可能にする。
    const portraitPalette = targetType === 'preset' ? CHARACTER_PORTRAITS : [];
    const availableImages = useMemo(
        () => [...(targetType === 'preset' ? CHARACTER_PORTRAITS : []), ...assets],
        [targetType, assets]
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

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = Math.round(entry.contentRect.width);
                const newHeight = Math.round(entry.contentRect.height);
                setCanvasSize(prev => {
                    if (Math.abs(prev.width - newWidth) < 2 && Math.abs(prev.height - newHeight) < 2) {
                        return prev;
                    }
                    return { width: newWidth, height: newHeight };
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [targetType, targetId]);

    useEffect(() => {
        if (!document.getElementById('yomogi-font')) {
            const link = document.createElement('link');
            link.id = 'yomogi-font';
            link.href = 'https://fonts.googleapis.com/css2?family=Yomogi&display=swap';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        document.fonts.ready.then(() => setIsFontLoaded(true));
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
    const capturePane = useCallback((index: number): string | null => {
        const stage = stageRefs.current[index];
        const layer = stage?.getLayers()[0];
        if (!stage || !layer) return null;
        const s = layer.scaleX() || 1;
        // 選択枠(Transformer/インジケータ)を一時非表示にして描画物だけを出力する
        const excluded = stage.find('.__export_exclude');
        excluded.forEach(n => n.visible(false));
        layer.batchDraw();
        try {
            return targetType === 'preset'
                ? stage.toDataURL({ pixelRatio: 2 / s, mimeType: 'image/png' })
                : stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
        } finally {
            excluded.forEach(n => n.visible(true));
            layer.batchDraw();
        }
    }, [targetType]);

    // dataURL(透明背景) → 紙面色を敷いた canvas に載せ替えるための画像ロード
    const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });

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
                const url = capturePane(currentCanvasIndex);
                if (!url) return;
                const img = await loadImage(url);
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                const ctx = c.getContext('2d')!;
                ctx.fillStyle = '#ECD2B3'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                downloadDataUrl(c.toDataURL('image/png'), `manosaba-note-${targetType}-${Date.now()}.png`);
            } else {
                const urls = [0, 1, 2, 3].map(capturePane);
                if (urls.some(u => !u)) { toast.error('ペインの取得に失敗しました'); return; }
                const imgs = await Promise.all((urls as string[]).map(loadImage));
                // グリッド中は4ペインのセル寸が同一 → 出力も同一サイズ
                const w = imgs[0].naturalWidth, h = imgs[0].naturalHeight, GAP = 8;
                const c = document.createElement('canvas');
                c.width = w * 2 + GAP; c.height = h * 2 + GAP;
                const ctx = c.getContext('2d')!;
                ctx.fillStyle = '#444'; ctx.fillRect(0, 0, c.width, c.height); // 区切り線
                imgs.forEach((img, i) => {
                    const col = i % 2, row = Math.floor(i / 2);
                    const x = col * (w + GAP), y = row * (h + GAP);
                    ctx.fillStyle = '#ECD2B3'; ctx.fillRect(x, y, w, h);
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
    const handleObjectDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>, obj: NoteObject, sourceIndex: number, _scale: number) => {
        const evt: MouseEvent | undefined = e?.evt;
        const rawX = e.target.x();
        const rawY = e.target.y();
        // 事件ノート(preset)のみ基準範囲[0,1200]×[0,800]外へ出さない。それ以外(fill)は自由配置。
        // クランプは「最終配置位置」に対して行う（ドラッグ途中値をクランプすると跨ぎ移動の計算が壊れるため）。
        const clampRange = targetType === 'preset';
        const clampX = (v: number) => clampRange ? Math.max(0, Math.min(CANVAS_BASE_W, v)) : v;
        const clampY = (v: number) => clampRange ? Math.max(0, Math.min(CANVAS_BASE_H, v)) : v;

        // dx,dy だけ移動する。グループならグループ全員（同ペイン）、それ以外は自分のみ。
        // extra に canvasIndex を含めると移動先ペインへ付け替える。
        const applyMove = (dx: number, dy: number, extra: Partial<NoteObject> = {}) => {
            saveHistoryOnceThenSkip();
            if (obj.groupId) {
                const groupObjs = objects.filter(o => (o.canvasIndex || 0) === sourceIndex && o.groupId === obj.groupId);
                updateNoteObjects(targetType, displayTargetId,
                    groupObjs.map(m => ({ id: m.id, attrs: { x: (m.x ?? 0) + dx, y: (m.y ?? 0) + dy, ...extra } })));
            } else {
                updateNoteObject(targetType, displayTargetId, obj.id, { x: (obj.x ?? 0) + dx, y: (obj.y ?? 0) + dy, ...extra }, true);
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
                    applyMove(newX - (obj.x ?? 0), newY - (obj.y ?? 0), { canvasIndex: targetPane });
                    return;
                }
            }
        }

        // 同一ペイン内: 通常の移動として確定（最終位置をクランプ）
        applyMove(clampX(rawX) - (obj.x ?? 0), clampY(rawY) - (obj.y ?? 0));
    }, [isGridMode, isGridEditMode, compactMode, objects, updateNoteObject, updateNoteObjects, targetType, displayTargetId]);

    useNoteKeyboard({
        editingTextId, setPlacementMode, undoNote, redoNote,
        selectedIds, setSelectedIds, updateNoteObjects, removeNoteObjects, targetType, displayTargetId,
        handleCopySelected, handleCutSelected, handlePasteClipboard, clipboard,
        placementMode, shapeContextMenu, isDrawingRef, setCurrentCanvasIndex,
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

    const startPlacement = (type: ExtendedNoteObjectType, data?: string) => {
        setPlacementMode({ type, data });
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
        try {
            const { blob, width, height } = await processFile(files[0]);
            const key = await putAsset(blob);
            addNoteAsset(targetType, displayTargetId, key);
            addNoteObject(targetType, displayTargetId, {
                id: `img_${Date.now()}`,
                type: 'image',
                x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                width, height,
                content: key,
                rotation: 0, scaleX: 1, scaleY: 1,
                keepRatio: true,
                canvasIndex: currentCanvasIndex
            });
        } catch {
            toast.error('画像を保存できませんでした（空き容量不足の可能性）。ヘルプからバックアップの書き出しをおすすめします。');
            void import('../../services/storageHealth').then(m => m.checkStorageHealth());
        }
    };

    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>, index: number, _scale: number) => {
        if (e.evt.button !== 0) return;

        if (placementMode) {
            // レイヤーのローカル(=論理)座標。Layerのscale(compactの基準範囲フィット)を自動で吸収する。
            const layer = e.target.getStage()?.getLayers()[0];
            const pos = layer?.getRelativePointerPosition();
            if (!pos) return;
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
                    id: `${placementMode.type}_${Date.now()}`,
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
                        id: `image_${Date.now()}`, type: 'image',
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
            const baseId = `${placementMode.type}_${Date.now()}`;
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

    const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>, index: number, _scale: number) => {
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

    const handleStageMouseUp = async (e: Konva.KonvaEventObject<MouseEvent>, index: number, _scale: number) => {
        if (isDrawingRef.current && drawingShapeInfoRef.current) {
            isDrawingRef.current = false;
            const type = drawingShapeInfoRef.current.type as string;

            if (['rect', 'circle', 'triangle', 'image'].includes(type)) {
                const dragW = drawingShapeInfoRef.current.width as number;
                const dragH = drawingShapeInfoRef.current.height as number;
                const isDrag = dragW >= 5 && dragH >= 5;
                const baseId = `${type}_${Date.now()}`;
                const startX = drawingShapeInfoRef.current._startX as number;
                const startY = drawingShapeInfoRef.current._startY as number;
                let newObj: NoteObject;

                if (isDrag) {
                    // Circle/RegularPolygon は x,y が中心座標のためバウンディングボックス左上から補正
                    const isCentered = type === 'circle' || type === 'triangle';
                    newObj = {
                        id: baseId,
                        type: type as NoteObjectType,
                        x: isCentered
                            ? (drawingShapeInfoRef.current.x as number) + dragW / 2
                            : (drawingShapeInfoRef.current.x as number),
                        y: isCentered
                            ? (drawingShapeInfoRef.current.y as number) + dragH / 2
                            : (drawingShapeInfoRef.current.y as number),
                        width: dragW,
                        height: dragH,
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
                id: `${type}_${Date.now()}`,
                points: finalPoints
            });
            drawingShapeInfoRef.current = null;
            setDrawingActive(false);

            if (type !== 'freehand') {
                setPlacementMode(null);
            }
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
        objs.forEach(obj => {
            const node = e.target.getStage()?.findOne(`#${obj.id}`);
            if (node) {
                if (obj.x >= box.x && obj.x <= box.x + box.width && obj.y >= box.y && obj.y <= box.y + box.height) {
                    newSelectedIds.push(obj.id);
                }
            }
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

    const renderFloatingTextToolbar = () => {
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
                border: '1px solid #555',
                borderRadius: '8px',
                padding: '5px 10px',
                display: 'flex', gap: '10px', alignItems: 'center',
                zIndex: 999999,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                fontSize: '0.85rem', color: '#ccc'
            }}>
                <label>Size:
                    <input type="number" min="8" max="200"
                        value={selectedObject.fontSize || 24}
                        onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontSize: +e.target.value }, true)}
                        onBlur={() => saveNoteHistory()}
                        style={{ width: '50px', background: '#222', border: '1px solid #555', color: 'white', borderRadius: '3px', padding: '2px 5px', marginLeft: '5px' }}
                    />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input type="checkbox"
                        checked={selectedObject.fontWeight === 'bold'}
                        onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontWeight: e.target.checked ? 'bold' : 'normal' }, true)}
                        onBlur={() => saveNoteHistory()}
                    />
                    Bold
                </label>
                <input type="color"
                    value={selectedObject.fill || '#000000'}
                    onChange={e => {
                        // ドラッグ中の連続 onChange を間引く（コンテキストメニュー側と統一）。#06/30-4, refactoring A-8-2
                        const val = e.target.value;
                        const id = selectedIds[0];
                        commitThrottled(() => updateNoteObject(targetType, displayTargetId, id, { fill: val }, true));
                    }}
                    onBlur={() => saveNoteHistory()}
                    title="Text Color"
                    style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
                />
            </div>,
            document.body
        );
    };

    const toolBtnStyle = (isActive: boolean): React.CSSProperties => ({
        background: isActive ? 'rgba(0, 122, 204, 0.4)' : 'transparent',
        border: isActive ? '1px solid #007acc' : '1px solid transparent',
        color: isActive ? '#66b3ff' : '#ccc',
        fontSize: '1rem',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '6px',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace'
    });

    // Noteページの Tools 同様、テキスト付きの横長ボタン（compactの左ツールバー用）
    const toolTextBtnStyle = (isActive: boolean, disabled = false): React.CSSProperties => ({
        background: isActive ? 'rgba(0, 122, 204, 0.2)' : '#333',
        border: isActive ? '1px solid #007acc' : '1px solid #555',
        color: disabled ? '#666' : (isActive ? '#66b3ff' : '#ccc'),
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
                    selectedIds={selectedIds}
                    onCopy={handleCopySelected}
                    onCut={handleCutSelected}
                    onPaste={handlePasteClipboard}
                    clipboardEmpty={clipboard.length === 0}
                    onDelete={() => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); }}
                    onExportPng={handleExportPng}
                    freehandSettings={freehandSettings}
                    onFreehandSettingsChange={setFreehandSettings}
                    selectedObject={selectedObject}
                    onToggleKeepRatio={(checked) => {
                        updateNoteObject(targetType, displayTargetId, selectedIds[0], { keepRatio: checked }, true);
                        saveNoteHistory();
                    }}
                    onReorder={(dir) => { reorderNoteObject(targetType, displayTargetId, selectedIds[0], dir); saveNoteHistory(); }}
                    selectedGroupId={selectedGroupId}
                    onGroup={() => {
                        const newGroupId = `group_${Date.now()}`;
                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                        saveNoteHistory();
                    }}
                    onUngroup={() => {
                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
                        setSelectedIds([]);
                        saveNoteHistory();
                    }}
                    toolBtnStyle={toolBtnStyle}
                    toolTextBtnStyle={toolTextBtnStyle}
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
    let compactToolbarW = 0;
    if (compactMode) {
        if (isGridMode) {
            compactToolbarW = Math.round(Math.min(150, Math.max(COMPACT_SIDE_MIN, canvasSize.width * 0.16)));
        } else {
            const canvasWAtHeightFit = canvasSize.height * COMPACT_ASPECT;
            compactToolbarW = Math.max(COMPACT_SIDE_MIN, Math.round(canvasSize.width - canvasWAtHeightFit));
        }
    }
    const panesW = Math.max(0, canvasSize.width - compactToolbarW);

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
                <div style={{ flexShrink: 0, display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', overflowX: 'auto', background: 'var(--surface-2, #252526)', borderBottom: '1px solid #333' }}>
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
                    selectedIds={selectedIds}
                    selectedObject={selectedObject}
                    onToggleKeepRatio={(checked) => {
                        updateNoteObject(targetType, displayTargetId, selectedIds[0], { keepRatio: checked }, true);
                        saveNoteHistory();
                    }}
                    onReorder={(dir) => { reorderNoteObject(targetType, displayTargetId, selectedIds[0], dir); saveNoteHistory(); }}
                    selectedGroupId={selectedGroupId}
                    onGroup={() => {
                        const newGroupId = `group_${Date.now()}`;
                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                        saveNoteHistory();
                    }}
                    onUngroup={() => {
                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
                        setSelectedIds([]);
                        saveNoteHistory();
                    }}
                    onDeleteSelected={() => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); }}
                    onExportPng={handleExportPng}
                    portraitPalette={portraitPalette}
                    assets={assets}
                    targetType={targetType}
                    characterPortraits={CHARACTER_PORTRAITS}
                    onAssetContextMenu={(index, x, y) => setAssetContextMenu({ index, x, y })}
                />
            )}

            <div
                className="char-canvas-wrapper"
                ref={canvasContainerRef}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{
                    backgroundColor: '#1e1e1e',
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
                    gridRow: '1 / -1'
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
                {/* compact: 左にCanvas操作ツールバーを常設（単一表示でも4ペインでも）。#06/28-14:10-5 */}
                {compactMode && compactToolbarW > 4 && (
                    <div style={{ width: `${compactToolbarW}px`, flexShrink: 0, height: '100%', overflowY: 'auto', background: '#1a1a1a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
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
                            // overview/character/misc: Stageをコンテナ実寸にして要素いっぱいに描画（fill, 余白なし）
                            effScale = Math.min(stageWidth / CANVAS_BASE_W, stageHeight / CANVAS_BASE_H);
                            stageRenderW = stageWidth;
                            stageRenderH = stageHeight;
                        }
                        const stageOffsetX = (stageWidth - stageRenderW) / 2;
                        const stageOffsetY = (stageHeight - stageRenderH) / 2;

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
                                    border: isGridMode ? (((isHovered && !isGridEditMode) || isCurrent) ? '2px solid #007acc' : '2px solid #444') : (compactMode ? 'none' : 'none'),
                                    boxShadow: isGridMode && isHovered && !isGridEditMode ? '0 0 12px rgba(0, 122, 204, 0.8)' : 'none',
                                    transition: 'all 0.2s',
                                    overflow: 'hidden',
                                    // Note/Animate統一: セル(pane)は暗色マージン、紙面(方眼)はStage(=基準範囲)側に表示し中央配置。
                                    backgroundColor: '#1e1e1e',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onClick={(e) => {
                                    // 4ペイン表示中はどのペインをクリックしても単一表示へ戻す。
                                    // 呼び出し元(現在)ペインも対象に含め、戻れない不具合を解消する。
                                    if (isGridMode && !isGridEditMode) {
                                        setCurrentCanvasIndex(index);
                                        setSelectedIds([]);
                                        setIsGridMode(false);
                                        e.stopPropagation();
                                    }
                                }}
                            >
                                <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', zIndex: 10, pointerEvents: 'none' }}>
                                    Canvas {index + 1}
                                </div>

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
                                    onContextMenu={(e) => e.evt.preventDefault()}
                                    style={{
                                        cursor: placementMode && isCurrent ? 'crosshair' : (isGridMode && !isGridEditMode ? 'pointer' : 'default'),
                                        // 紙面(方眼)はStage(=基準範囲1200×800)に表示。周囲のセルは暗色マージン。
                                        backgroundColor: '#ECD2B3',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 24 0 L 0 0 0 24' fill='none' stroke='%23C2B2A1' stroke-width='1' stroke-dasharray='3 3'/%3E%3C/svg%3E")`,
                                        backgroundSize: `${24 * effScale}px ${24 * effScale}px`
                                    }}
                                >
                                    <Layer scaleX={effScale} scaleY={effScale}>
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
                                                }
                                            };

                                            if (obj.type === 'image') return <URLImage key={obj.id} {...props} />;
                                            if (obj.type === 'text') return <EditableText key={obj.id} {...props} />;
                                            return <ShapeObject key={obj.id} {...props} />;
                                        })}

                                        {/* 複数選択時、テキストノードの選択インジケーター（Transformerが除外するため個別描画） */}
                                        {selectedIds.length > 1 && objs
                                            .filter(o => o.type === 'text' && selectedIds.includes(o.id))
                                            .map(o => (
                                                <Rect
                                                    key={`sel_indicator_${o.id}`}
                                                    name="__export_exclude"
                                                    x={(o.x ?? 0) - 2}
                                                    y={(o.y ?? 0) - 2}
                                                    width={(o.width || 150) + 4}
                                                    height={(o.fontSize || 24) * 1.5 + 4}
                                                    stroke="#007acc"
                                                    strokeWidth={1 / effScale}
                                                    dash={[4 / effScale, 4 / effScale]}
                                                    fill="transparent"
                                                    listening={false}
                                                />
                                            ))
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
                                                    boundBoxFunc={(oldBox, newBox) => {
                                                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                                                        return newBox;
                                                    }}
                                                    keepRatio={
                                                        selectedIds.length === 1 && (
                                                            selectedObject?.type === 'circle' ||
                                                            selectedObject?.type === 'triangle' ||
                                                            (selectedObject?.type === 'image' && (selectedObject?.keepRatio ?? true))
                                                        )
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
                                                top: stageOffsetY + obj.y * effScale,
                                                left: stageOffsetX + obj.x * effScale,
                                                width: `${editWidth}px`,
                                                height: 'auto',
                                                minHeight: `${(obj.fontSize || 24) * 1.4 * effScale}px`,
                                                fontSize: `${(obj.fontSize || 24) * effScale}px`,
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

                <div style={{ position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {isGridMode && (
                        <div
                            onClick={() => setIsGridEditMode(!isGridEditMode)}
                            style={{
                                backgroundColor: 'rgba(30, 30, 30, 0.8)', padding: '6px', borderRadius: '8px',
                                cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center',
                                width: '36px', height: '36px',
                                border: isGridEditMode ? '2px solid #007acc' : '1px solid #444',
                                boxShadow: isGridEditMode ? '0 0 8px rgba(0, 122, 204, 0.6)' : '0 4px 6px rgba(0,0,0,0.3)',
                                boxSizing: 'border-box',
                                color: isGridEditMode ? '#66b3ff' : '#aaa',
                                fontSize: '1.2rem',
                                transition: 'all 0.2s'
                            }}
                            title="Grid Edit Mode (Edit all canvases in 4-pane view)"
                        >
                            ✏️
                        </div>
                    )}

                    <div
                        onClick={() => {
                            const nextMode = !isGridMode;
                            setIsGridMode(nextMode);
                            if (!nextMode) setIsGridEditMode(false);
                        }}
                        style={{
                            backgroundColor: 'rgba(30, 30, 30, 0.8)', padding: '6px', borderRadius: '8px',
                            cursor: 'pointer', display: 'flex', flexWrap: 'wrap', width: '36px', height: '36px',
                            gap: '2px', border: '1px solid #444', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', boxSizing: 'border-box',
                        }}
                        title="Toggle 2x2 Grid Mode"
                    >
                        {[0,1,2,3].map(i => (
                            <div
                                key={i}
                                style={{
                                    width: 'calc(50% - 1px)', height: 'calc(50% - 1px)',
                                    backgroundColor: isGridMode
                                        ? (currentCanvasIndex === i ? '#007acc' : '#ccc')
                                        : (currentCanvasIndex === i ? '#007acc' : '#555'),
                                    borderRadius: '2px'
                                }}
                            />
                        ))}
                    </div>
                </div>

                {shapeContextMenu && (
                    <ShapeContextMenu
                        menu={shapeContextMenu}
                        setMenu={setShapeContextMenu}
                        targetType={targetType}
                        displayTargetId={displayTargetId}
                        updateNoteObject={updateNoteObject}
                        updateNoteObjects={updateNoteObjects}
                        commitThrottled={commitThrottled}
                        saveNoteHistory={saveNoteHistory}
                        reorderNoteObject={reorderNoteObject}
                        selectedIds={selectedIds}
                    />
                )}

                {assetContextMenu && (
                    <div
                        style={{
                            position: 'fixed', top: assetContextMenu.y, left: assetContextMenu.x,
                            background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', zIndex: 1000002
                        }}
                    >
                        <div
                            style={{ padding: '8px 12px', cursor: 'pointer', color: '#ff4444', fontSize: '0.9rem' }}
                            onClick={() => {
                                removeNoteAsset(targetType, displayTargetId, assetContextMenu.index);
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
