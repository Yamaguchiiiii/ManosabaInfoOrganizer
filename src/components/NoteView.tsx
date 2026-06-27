import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Image as KonvaImage, Text, Rect, Circle, RegularPolygon, Arrow, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { useAppStore, ICON_FILES, NoteObject, NoteObjectType, NoteTargetType } from '../store';
import '../styles/NoteView.scss';

const HANDWRITING_FONT = '"Yomogi", "Klee One", "Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';

type ExtendedNoteObjectType = NoteObjectType | 'freehand';

type FreehandSettings = {
    color: string;
    strokeWidth: number;
    lineStyle: 'pen' | 'marker';
    stabilization: number;
};

const applyChaikin = (points: number[], iterations: number): number[] => {
    if (iterations <= 0 || points.length < 4) return points;
    const result: number[] = [];
    for (let i = 0; i < points.length - 2; i += 2) {
        const x0 = points[i], y0 = points[i + 1];
        const x1 = points[i + 2], y1 = points[i + 3];
        result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
        result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    result.unshift(points[0], points[1]);
    result.push(points[points.length - 2], points[points.length - 1]);
    return applyChaikin(result, iterations - 1);
};

// キャラクターノートにデフォルト配置される立ち絵。全キャラぶんを事件ノート等の
// 画像パレット/ギャラリーから配置できるようにするための一覧。
const CHARACTER_PORTRAITS = ICON_FILES.map(icon => `./character/${icon}`);

// compact(Animate)で Canvas 左に置くツールバーの最小幅(px)。テキストボタンが収まる幅を確保。
// 実際の幅は 3:2フィットで生じる左の余白に合わせてレスポンシブに広がる。
const COMPACT_SIDE_MIN = 88;
// 論理キャンバスの基準サイズ(3:2)。オブジェクト未配置時のフォールバック表示に使う。
const CANVAS_BASE_W = 1200;
const CANVAS_BASE_H = 800;

// --- 画像コンポーネント (メモ化) ---
const URLImage = React.memo(({ imageObj, onSelect, onChange, onContextMenu, onDragMove, onDragEnd, isDrawingMode }: any) => {
    const [img] = useImage(imageObj.content || '');

    return (
        <KonvaImage
            id={imageObj.id}
            name="note-object"
            onClick={onSelect}
            onTap={onSelect}
            onContextMenu={onContextMenu}
            image={img}
            x={imageObj.x}
            y={imageObj.y}
            width={imageObj.width}
            height={imageObj.height}
            rotation={imageObj.rotation}
            scaleX={imageObj.scaleX}
            scaleY={imageObj.scaleY}
            draggable={!isDrawingMode}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd ?? ((e: any) => { onChange({ x: e.target.x(), y: e.target.y() }); })}
            onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                onChange({
                    x: node.x(),
                    y: node.y(),
                    width: node.width() * scaleX,
                    height: node.height() * scaleY,
                    rotation: node.rotation(),
                });
            }}
        />
    );
});

// --- テキストコンポーネント (メモ化) ---
const EditableText = React.memo(({ textObj, onSelect, onChange, onToggleEdit, onDragMove, onDragEnd, isDrawingMode }: any) => {
    return (
        <Text
            id={textObj.id}
            name="note-object"
            onClick={onSelect}
            onTap={onSelect}
            onDblClick={onToggleEdit}
            text={textObj.text}
            x={textObj.x}
            y={textObj.y}
            fontSize={textObj.fontSize || 24}
            fontStyle={textObj.fontWeight || 'normal'}
            fontFamily={HANDWRITING_FONT}
            fill={textObj.fill}
            rotation={textObj.rotation}
            scaleX={textObj.scaleX}
            scaleY={textObj.scaleY}
            draggable={!isDrawingMode}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd ?? ((e: any) => { onChange({ x: e.target.x(), y: e.target.y() }); })}
        />
    );
});

// --- 図形コンポーネント (メモ化) ---
const ShapeObject = React.memo(({ shapeObj, onSelect, onChange, onContextMenu, onDragMove, onDragEnd, isDrawingMode }: any) => {
    const commonProps: any = {
        id: shapeObj.id,
        name: "note-object",
        onClick: onSelect,
        onTap: onSelect,
        onContextMenu: onContextMenu,
        x: shapeObj.x,
        y: shapeObj.y,
        rotation: shapeObj.rotation,
        scaleX: shapeObj.scaleX,
        scaleY: shapeObj.scaleY,
        draggable: !isDrawingMode,
        onDragMove: onDragMove,
        onDragEnd: onDragEnd ?? ((e: any) => onChange({ x: e.target.x(), y: e.target.y() })),
        onTransformEnd: (e: any) => {
            const node = e.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const type = shapeObj.type as string;
            if (type === 'rect') {
                onChange({
                    x: node.x(), y: node.y(),
                    width: Math.round((shapeObj.width || 100) * scaleX),
                    height: Math.round((shapeObj.height || 100) * scaleY),
                    scaleX: 1, scaleY: 1,
                    rotation: node.rotation(),
                });
            } else if (type === 'circle' || type === 'triangle') {
                const scale = Math.max(scaleX, scaleY);
                onChange({
                    x: node.x(), y: node.y(),
                    width: Math.round((shapeObj.width || 100) * scale),
                    height: Math.round((shapeObj.height || 100) * scale),
                    scaleX: 1, scaleY: 1,
                    rotation: node.rotation(),
                });
            } else {
                onChange({
                    x: node.x(), y: node.y(),
                    scaleX: 1, scaleY: 1,
                    rotation: node.rotation(),
                });
            }
        }
    };

    const getLineProps = () => {
        const props: any = { ...commonProps };
        if (shapeObj.lineStyle === 'marker') {
            props.opacity = 0.4;
            props.lineCap = 'round';
            props.lineJoin = 'round';
        } else if (shapeObj.lineStyle === 'pen') {
            props.lineCap = 'round';
            props.lineJoin = 'round';
        }
        props.hitStrokeWidth = Math.max(20, shapeObj.strokeWidth || 3);
        return props;
    };

    const isStrokeEnabled = shapeObj.strokeWidth !== 0;
    const linePoints = shapeObj.points || (shapeObj.type.includes('curve') ? [0, 0, 50, -50, 100, 0] : [0, 0, 100, 0]);

    return (
        <>
            {shapeObj.type === 'rect' && (
                <Rect {...commonProps} width={shapeObj.width || 100} height={shapeObj.height || 100} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {shapeObj.type === 'circle' && (
                <Circle {...commonProps} radius={(shapeObj.width || 100) / 2} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {shapeObj.type === 'triangle' && (
                <RegularPolygon {...commonProps} sides={3} radius={(shapeObj.width || 100) / 2} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {shapeObj.type === 'line' && (
                <Arrow {...getLineProps()} points={linePoints} pointerLength={0} pointerWidth={0} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 3} />
            )}
            {shapeObj.type === 'arrow' && (
                <Arrow {...getLineProps()} points={linePoints} pointerLength={10} pointerWidth={10} stroke={shapeObj.stroke} fill={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 3} />
            )}
            {shapeObj.type === 'curve' && (
                <Arrow {...getLineProps()} points={linePoints} tension={0.5} pointerLength={0} pointerWidth={0} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 3} />
            )}
            {shapeObj.type === 'curve_arrow' && (
                <Arrow {...getLineProps()} points={linePoints} tension={0.5} pointerLength={10} pointerWidth={10} stroke={shapeObj.stroke} fill={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 3} />
            )}
            {(shapeObj.type as string) === 'freehand' && (
                <Line 
                    {...getLineProps()} 
                    points={shapeObj.points || []} 
                    tension={0.5} 
                    stroke={shapeObj.stroke} 
                    strokeWidth={shapeObj.strokeWidth || 3} 
                />
            )}
        </>
    );
});

const getImageSizeFromUrl = (url: string, maxDimension = 500): Promise<{ width: number, height: number }> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > height) {
                if (width > maxDimension) { height *= maxDimension / width; width = maxDimension; }
            } else {
                if (height > maxDimension) { width *= maxDimension / height; height = maxDimension; }
            }
            resolve({ width, height });
        };
        img.onerror = () => resolve({ width: 200, height: 200 }); 
        img.src = url;
    });
};

const autocropTransparent = (
    originalBase64: string,
    imgWidth: number,
    imgHeight: number
): Promise<{ base64: string; width: number; height: number }> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve({ base64: originalBase64, width: imgWidth, height: imgHeight }); return; }
        const src = new Image();
        src.onload = () => {
            ctx.drawImage(src, 0, 0);
            const data = ctx.getImageData(0, 0, imgWidth, imgHeight).data;
            const ALPHA_THRESHOLD = 10;
            let minX = imgWidth, minY = imgHeight, maxX = 0, maxY = 0;
            for (let y = 0; y < imgHeight; y++) {
                for (let x = 0; x < imgWidth; x++) {
                    if (data[(y * imgWidth + x) * 4 + 3] > ALPHA_THRESHOLD) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < minX || maxY < minY) {
                resolve({ base64: originalBase64, width: imgWidth, height: imgHeight });
                return;
            }
            const cropW = maxX - minX + 1;
            const cropH = maxY - minY + 1;
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d')!;
            cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
            const maxDim = 500;
            let w = cropW, h = cropH;
            if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
            else       { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
            resolve({ base64: cropCanvas.toDataURL('image/png'), width: w, height: h });
        };
        src.onerror = () => resolve({ base64: originalBase64, width: imgWidth, height: imgHeight });
        src.src = originalBase64;
    });
};

const processFile = (file: File): Promise<{ base64: string, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                autocropTransparent(base64, img.width, img.height).then(resolve);
            };
            img.onerror = reject;
            img.src = base64;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export interface CanvasWorkspaceProps {
    targetType: NoteTargetType;
    targetId: string;
    titleNode?: React.ReactNode;
    compactMode?: boolean; 
}

export const CanvasWorkspace = React.memo(({ targetType, targetId, titleNode, compactMode = false }: CanvasWorkspaceProps) => {
    
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
    const addNoteObjects = useAppStore(state => state.addNoteObjects);
    const updateNoteObject = useAppStore(state => state.updateNoteObject);
    const updateNoteObjects = useAppStore(state => state.updateNoteObjects);
    const removeNoteObjects = useAppStore(state => state.removeNoteObjects);
    const addNoteAsset = useAppStore(state => state.addNoteAsset);
    const removeNoteAsset = useAppStore(state => state.removeNoteAsset);
    const reorderNoteObject = useAppStore(state => state.reorderNoteObject);
    const undoNote = useAppStore(state => state.undoNote);
    const saveNoteHistory = useAppStore(state => state.saveNoteHistory);

    const [currentCanvasIndex, setCurrentCanvasIndex] = useState(0);
    const [isGridMode, setIsGridMode] = useState(false);
    const [isGridEditMode, setIsGridEditMode] = useState(false);
    const [hoveredCanvasIndex, setHoveredCanvasIndex] = useState<number | null>(null);
    // Animate(compact)の画像ギャラリー floating window の表示状態
    const [showImageGallery, setShowImageGallery] = useState(false);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // コピー/ペースト用クリップボード（オブジェクトの属性を保持したまま複製する）
    const [clipboard, setClipboard] = useState<NoteObject[]>([]);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    type PlacementMode = { type: ExtendedNoteObjectType, data?: any } | null;
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
    const drawingShapeInfoRef = useRef<any>(null);
    const drawingNodeRef = useRef<any>(null);
    const batchSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveHistoryOnceThenSkip = () => {
        if (!batchSaveRef.current) {
            // バッチ先頭: 変更前の現在状態を保存
            saveNoteHistory();
        } else {
            clearTimeout(batchSaveRef.current);
        }
        batchSaveRef.current = setTimeout(() => {
            batchSaveRef.current = null;
        }, 300);
    };
    const [drawingActive, setDrawingActive] = useState(false);

    const [shapeContextMenu, setShapeContextMenu] = useState<{ id: string, type: ExtendedNoteObjectType, x: number, y: number, stroke: string, strokeWidth: number, fill?: string, lineStyle?: string } | null>(null);
    const [assetContextMenu, setAssetContextMenu] = useState<{ index: number, x: number, y: number } | null>(null);
    
    const [isFontLoaded, setIsFontLoaded] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const trRefs = useRef<(Konva.Transformer | null)[]>([null, null, null, null]);
    // 4ペインそれぞれの DOM 要素。ペインをまたぐドラッグ移動(#4)のヒットテストに使う
    const paneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
    const editingTextBoundsRef = useRef<{ width: number } | null>(null);

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


    useEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
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

    // 選択中オブジェクトをクリップボードへコピー（サイズ・色などの属性を維持）
    const handleCopySelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
    }, [selectedIds, currentCanvasObjects]);

    // クリップボードの内容を現在のキャンバスへ少しずらして貼り付ける（グループ構造も維持）
    const handlePasteClipboard = useCallback(() => {
        if (clipboard.length === 0) return;
        const stamp = Date.now();
        const groupIdMap: Record<string, string> = {};
        const newObjs: NoteObject[] = clipboard.map((o, i) => {
            let groupId = o.groupId;
            if (groupId) {
                if (!groupIdMap[groupId]) groupIdMap[groupId] = `group_${stamp}_${i}`;
                groupId = groupIdMap[groupId];
            }
            return {
                ...o,
                id: `${o.type}_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                x: (o.x || 0) + 20,
                y: (o.y || 0) + 20,
                canvasIndex: currentCanvasIndex,
                groupId,
                points: o.points ? [...o.points] : undefined,
            };
        });
        addNoteObjects(targetType, displayTargetId, newObjs);
        setSelectedIds(newObjs.map(o => o.id));
    }, [clipboard, currentCanvasIndex, addNoteObjects, targetType, displayTargetId]);

    // 選択中オブジェクトを切り取り（クリップボードへ退避してから削除する。属性は維持）
    const handleCutSelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
        removeNoteObjects(targetType, displayTargetId, selectedIds);
        setSelectedIds([]);
    }, [selectedIds, currentCanvasObjects, removeNoteObjects, targetType, displayTargetId]);

    // オブジェクトのドラッグ確定処理（#4: 4ペインをまたぐ移動に対応）。
    // グリッド編集中に別ペイン上でドロップされたら、対象（グループなら全メンバー）を
    // 移動先キャンバスへ付け替える。同一ペイン内なら通常の移動として確定する。
    const handleObjectDragEnd = useCallback((e: any, obj: NoteObject, sourceIndex: number, scale: number) => {
        const evt: MouseEvent | undefined = e?.evt;
        // 事件ノートの基準範囲[0,1200]×[0,800]外へ出さない。確定位置を範囲内にクランプする。
        const localX = Math.max(0, Math.min(CANVAS_BASE_W, e.target.x()));
        const localY = Math.max(0, Math.min(CANVAS_BASE_H, e.target.y()));
        // dx,dy だけ全体を平行移動する（グループは全メンバー、単体は自身）。
        // extra に canvasIndex を含めると移動先ペインへ付け替えられる。
        const applyMove = (dx: number, dy: number, extra: Partial<NoteObject> = {}) => {
            saveHistoryOnceThenSkip();
            if (obj.groupId) {
                const groupObjs = currentCanvasObjects.filter(o => o.groupId === obj.groupId);
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
                // ドロップ時にマウス位置へ原点を合わせると「掴んだ位置」のズレぶん飛んでしまう。
                // 代わりに、ドラッグ後のオブジェクト原点(localX)を保ったまま、
                // 元ペインと移動先ペインの画面上のオフセット差ぶんだけ論理座標を平行移動する。
                // これで「見えている位置のまま」移動先キャンバスへ付け替わる。
                const srcRect = paneRefs.current[sourceIndex]?.getBoundingClientRect();
                const tgtRect = paneRefs.current[targetPane]!.getBoundingClientRect();
                const offX = srcRect ? (srcRect.left - tgtRect.left) / scale : 0;
                const offY = srcRect ? (srcRect.top - tgtRect.top) / scale : 0;
                applyMove((localX - (obj.x ?? 0)) + offX, (localY - (obj.y ?? 0)) + offY, { canvasIndex: targetPane });
                setSelectedIds([]);
                return;
            }
        }

        // 同一ペイン内: 通常の移動として確定
        applyMove(localX - (obj.x ?? 0), localY - (obj.y ?? 0));
    }, [isGridMode, isGridEditMode, compactMode, currentCanvasObjects, updateNoteObject, updateNoteObjects, targetType, displayTargetId]);

    // カラーピッカー/スライダーなど「連続入力」のコミットを間引く（先頭で即時1回＋末尾で最終値）。
    // これをしないと、ドラッグ中に毎フレーム updateNoteObject→キャンバス全再描画が走り、
    // 極めて重く・OOM になっていた（永続化側は store の debounce で別途対策済み）。
    const propCommitRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; last: (() => void) | null }>({ timer: null, last: null });
    const commitThrottled = useCallback((fn: () => void) => {
        const r = propCommitRef.current;
        r.last = fn;
        if (r.timer) return;
        const run = () => {
            if (r.last) { const f = r.last; r.last = null; r.timer = setTimeout(run, 100); f(); }
            else { r.timer = null; }
        };
        run();
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPlacementMode(null);
                return;
            }
            if (e.target !== document.body) return;
            if (editingTextId) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoNote();
                setSelectedIds([]);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                if (selectedIds.length < 2) return;
                const newGroupId = `group_${Date.now()}`;
                updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                if (selectedIds.length === 0) return;
                updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
                setSelectedIds([]);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (selectedIds.length === 0) return;
                e.preventDefault();
                handleCopySelected();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
                if (selectedIds.length === 0) return;
                e.preventDefault();
                handleCutSelected();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (clipboard.length === 0) return;
                e.preventDefault();
                handlePasteClipboard();
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                removeNoteObjects(targetType, displayTargetId, selectedIds);
                setSelectedIds([]);
            }

            if (!placementMode && !shapeContextMenu && !isDrawingRef.current) {
                if (e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') {
                    setCurrentCanvasIndex(prev => (prev - 1 + 4) % 4);
                    setSelectedIds([]);
                }
                if (e.key.toLowerCase() === 's' || e.key === 'ArrowDown') {
                    setCurrentCanvasIndex(prev => (prev + 1) % 4);
                    setSelectedIds([]);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds, displayTargetId, targetType, updateNoteObjects, removeNoteObjects, editingTextId, placementMode, shapeContextMenu, undoNote, clipboard, handleCopySelected, handlePasteClipboard, handleCutSelected]);

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

    const startPlacement = (type: ExtendedNoteObjectType, data?: any) => {
        setPlacementMode({ type, data });
        setSelectedIds([]);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const { base64 } = await processFile(e.target.files[0]);
            addNoteAsset(targetType, displayTargetId, base64);
            startPlacement('image', base64);
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
            const { base64, width, height } = await processFile(files[0]);
            addNoteAsset(targetType, displayTargetId, base64);
            addNoteObject(targetType, displayTargetId, {
                id: `img_${Date.now()}`,
                type: 'image',
                x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                width, height,
                content: base64,
                rotation: 0, scaleX: 1, scaleY: 1,
                keepRatio: true,
                canvasIndex: currentCanvasIndex
            });
        }
    };

    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>, index: number, _scale: number) => {
        if (e.evt.button !== 0) return;

        if (placementMode) {
            // レイヤーのローカル(=論理)座標。Layerのscale(compactの基準範囲フィット)を自動で吸収する。
            const layer = e.target.getStage()?.getLayers()[0];
            const pos = layer?.getRelativePointerPosition();
            if (!pos) return;
            // 事件ノートの基準範囲[0,1200]×[0,800]外には配置しない
            pos.x = Math.max(0, Math.min(CANVAS_BASE_W, pos.x));
            pos.y = Math.max(0, Math.min(CANVAS_BASE_H, pos.y));

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
            setEditingTextId(null);
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
            const dx = logicalPos.x - drawingShapeInfoRef.current.x;
            const dy = logicalPos.y - drawingShapeInfoRef.current.y;

            if (type === 'freehand') {
                drawingShapeInfoRef.current.points?.push(dx, dy);
                drawingNodeRef.current.points(drawingShapeInfoRef.current.points);
                drawingNodeRef.current.getLayer()?.batchDraw();
            } else {
                let newPoints = [0, 0, dx, dy];
                if (['curve', 'curve_arrow'].includes(type)) {
                    newPoints = [0, 0, dx / 2, dy / 2 - 50, dx, dy];
                }
                drawingNodeRef.current.points(newPoints);
                drawingNodeRef.current.getLayer()?.batchDraw();
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
    const showTopbar = targetType === 'character' && !compactMode;

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
                    onChange={e => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fill: e.target.value }, true)}
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
                {/* Canvas操作ツールバー: Animateセルの左余白にドック（縦並び・幅はレスポンシブ） */}
                <div
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        backgroundColor: 'transparent',
                        padding: '5px 4px'
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                        <button title="画像をアップロードして配置" onClick={() => fileInputRef.current?.click()} style={toolTextBtnStyle(false)}>画像</button>
                        <button title="登録画像から配置" onClick={() => setShowImageGallery(v => !v)} style={toolTextBtnStyle(showImageGallery)}>画像一覧</button>
                        <button title="テキスト" onClick={() => startPlacement('text')} style={toolTextBtnStyle((placementMode?.type as string) === 'text')}>テキスト</button>
                        <button title="フリーハンド" onClick={() => startPlacement('freehand')} style={toolTextBtnStyle((placementMode?.type as string) === 'freehand')}>ペン</button>
                        <div style={{ height: '1px', backgroundColor: '#555', margin: '2px 0' }} />
                        <button title="円" onClick={() => startPlacement('circle')} style={toolTextBtnStyle((placementMode?.type as string) === 'circle')}>○ 円</button>
                        <button title="三角" onClick={() => startPlacement('triangle')} style={toolTextBtnStyle((placementMode?.type as string) === 'triangle')}>△ 三角</button>
                        <button title="四角" onClick={() => startPlacement('rect')} style={toolTextBtnStyle((placementMode?.type as string) === 'rect')}>□ 四角</button>
                        <button title="直線" onClick={() => startPlacement('line')} style={toolTextBtnStyle((placementMode?.type as string) === 'line')}>─ 直線</button>
                        <button title="矢印" onClick={() => startPlacement('arrow')} style={toolTextBtnStyle((placementMode?.type as string) === 'arrow')}>→ 矢印</button>
                        <button title="曲線" onClick={() => startPlacement('curve')} style={toolTextBtnStyle((placementMode?.type as string) === 'curve')}>～ 曲線</button>
                        <button title="曲線矢印" onClick={() => startPlacement('curve_arrow')} style={toolTextBtnStyle((placementMode?.type as string) === 'curve_arrow')}>↷ 曲線矢印</button>
                        <div style={{ height: '1px', backgroundColor: '#555', margin: '2px 0' }} />
                        <button
                            title="コピー (Ctrl+C)"
                            onClick={handleCopySelected}
                            disabled={selectedIds.length === 0}
                            style={toolTextBtnStyle(false, selectedIds.length === 0)}
                        >
                            コピー
                        </button>
                        <button
                            title="切り取り (Ctrl+X)"
                            onClick={handleCutSelected}
                            disabled={selectedIds.length === 0}
                            style={toolTextBtnStyle(false, selectedIds.length === 0)}
                        >
                            切り取り
                        </button>
                        <button
                            title="貼り付け (Ctrl+V)"
                            onClick={handlePasteClipboard}
                            disabled={clipboard.length === 0}
                            style={toolTextBtnStyle(false, clipboard.length === 0)}
                        >
                            貼り付け
                        </button>
                        <button
                            title="削除"
                            onClick={() => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); }}
                            disabled={selectedIds.length === 0}
                            style={{ ...toolTextBtnStyle(false, selectedIds.length === 0), color: selectedIds.length === 0 ? '#666' : '#ef4444' }}
                        >
                            削除
                        </button>
                    </div>
                    {(placementMode?.type as string) === 'freehand' && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                            <input type="color" value={freehandSettings.color} title="Stroke Color"
                                onChange={e => setFreehandSettings(s => ({ ...s, color: e.target.value }))}
                                style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
                            <input type="range" min="1" max="20" value={freehandSettings.strokeWidth} title={`Width: ${freehandSettings.strokeWidth}`}
                                onChange={e => setFreehandSettings(s => ({ ...s, strokeWidth: +e.target.value }))}
                                style={{ width: '70px' }} />
                            <select value={freehandSettings.lineStyle}
                                onChange={e => setFreehandSettings(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                                style={{ background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '2px 4px', fontSize: '0.8rem' }}>
                                <option value="pen">Pen</option>
                                <option value="marker">Marker</option>
                            </select>
                            <input type="range" min="0" max="5" value={freehandSettings.stabilization}
                                title={`補正: ${freehandSettings.stabilization}`}
                                onChange={e => setFreehandSettings(s => ({ ...s, stabilization: +e.target.value }))}
                                style={{ width: '70px' }} />
                            <span style={{ fontSize: '0.75rem', color: '#ccc', minWidth: '14px' }}>{freehandSettings.stabilization}</span>
                        </div>
                    )}
                    {selectedIds.length === 1 && selectedObject?.type === 'image' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#ccc' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedObject.keepRatio ?? true}
                                    onChange={(e) => {
                                        updateNoteObject(targetType, displayTargetId, selectedIds[0], { keepRatio: e.target.checked }, true);
                                        saveNoteHistory();
                                    }}
                                />
                                縦横比固定
                            </label>
                        </div>
                    )}
                    {selectedIds.length === 1 && selectedObject && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: '2px' }}>Layer:</span>
                            {(['front', 'up', 'down', 'back'] as const).map(dir => (
                                <button key={dir}
                                    onClick={() => { reorderNoteObject(targetType, displayTargetId, selectedIds[0], dir); saveNoteHistory(); }}
                                    style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                                >
                                    {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                                </button>
                            ))}
                        </div>
                    )}
                    {selectedIds.length >= 2 && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderTop: '1px solid #444', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: '2px' }}>Group:</span>
                            <button
                                onClick={() => {
                                    const newGroupId = `group_${Date.now()}`;
                                    updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                                    saveNoteHistory();
                                }}
                                style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                            >
                                グループ化
                            </button>
                            {selectedGroupId && (
                                <button
                                    onClick={() => {
                                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
                                        setSelectedIds([]);
                                        saveNoteHistory();
                                    }}
                                    style={{ ...toolBtnStyle(false), fontSize: '0.75rem', padding: '3px 6px' }}
                                >
                                    グループ解除
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {showImageGallery && createPortal(
                    // 登録画像ギャラリー。アニメ(マップ)が最大限見えるよう小さく、ノートセル側(右下)に配置。
                    <div style={{
                        position: 'fixed', right: '12px', bottom: '16px',
                        width: '210px', maxHeight: '45vh',
                        display: 'flex', flexDirection: 'column',
                        background: 'rgba(28,28,28,0.96)', border: '1px solid #555',
                        borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        zIndex: 1000000, padding: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#ccc' }}>画像を選んで配置</span>
                            <button onClick={() => setShowImageGallery(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                            {availableImages.length === 0 ? (
                                <div style={{ gridColumn: '1 / -1', color: '#666', fontSize: '0.75rem', textAlign: 'center', padding: '10px' }}>画像がありません</div>
                            ) : availableImages.map((src, idx) => (
                                <div
                                    key={idx}
                                    title="クリックして配置 → キャンバスをクリック"
                                    onClick={() => { startPlacement('image', src); setShowImageGallery(false); }}
                                    style={{ cursor: 'pointer', aspectRatio: '1 / 1', background: '#222', border: '1px solid #444', borderRadius: '6px', overflow: 'hidden' }}
                                >
                                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}

            </>
        );
    };

    return (
        <div 
            className={compactMode ? "" : "character-canvas-layout"} 
            style={compactMode ? { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } : { width: '100%', height: '100%', gridTemplateRows: showTopbar ? '60px 1fr' : '1fr' }}
        >
            {/* compact のCanvas操作ツールバーは pane の左余白にドックする（下の pane 内で renderPortalUI を描画） */}
            {renderFloatingTextToolbar()}
            {compactMode && <input type="file" ref={fileInputRef} style={{display:'none'}} accept="image/*" onChange={handleImageUpload} />}

            {!compactMode && (
                <div className="char-sidebar">
                    <h3>Tools</h3>
                    <div className="tool-buttons">
                        <button onClick={() => fileInputRef.current?.click()}>Image</button>
                        <input type="file" ref={fileInputRef} style={{display:'none'}} accept="image/*" onChange={handleImageUpload} />
                        <button className={(placementMode?.type as string) === 'text' ? 'active-tool' : ''} onClick={() => startPlacement('text')}>Text</button>
                        
                        <div className="shapes-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <button className={(placementMode?.type as string) === 'freehand' ? 'active-tool' : ''} onClick={() => startPlacement('freehand')}>✏️</button>
                            <button className={(placementMode?.type as string) === 'circle' ? 'active-tool' : ''} onClick={() => startPlacement('circle')}>○</button>
                            <button className={(placementMode?.type as string) === 'triangle' ? 'active-tool' : ''} onClick={() => startPlacement('triangle')}>△</button>
                            <button className={(placementMode?.type as string) === 'rect' ? 'active-tool' : ''} onClick={() => startPlacement('rect')}>■</button>
                            <button className={(placementMode?.type as string) === 'line' ? 'active-tool' : ''} onClick={() => startPlacement('line')}>─</button>
                            <button className={(placementMode?.type as string) === 'arrow' ? 'active-tool' : ''} onClick={() => startPlacement('arrow')}>→</button>
                            <button className={(placementMode?.type as string) === 'curve' ? 'active-tool' : ''} onClick={() => startPlacement('curve')}>~</button>
                            <button className={(placementMode?.type as string) === 'curve_arrow' ? 'active-tool' : ''} onClick={() => startPlacement('curve_arrow')}>↷</button>
                        </div>
                        {(placementMode?.type as string) === 'freehand' && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Pen Settings</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>Color</span>
                                    <input type="color" value={freehandSettings.color}
                                        onChange={e => setFreehandSettings(s => ({ ...s, color: e.target.value }))}
                                        style={{ width: '28px', height: '24px', border: 'none', cursor: 'pointer', background: 'none' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>Width</span>
                                    <input type="range" min="1" max="20" value={freehandSettings.strokeWidth}
                                        onChange={e => setFreehandSettings(s => ({ ...s, strokeWidth: +e.target.value }))}
                                        style={{ flex: 1 }} />
                                    <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '16px' }}>{freehandSettings.strokeWidth}</span>
                                </div>
                                <select value={freehandSettings.lineStyle}
                                    onChange={e => setFreehandSettings(s => ({ ...s, lineStyle: e.target.value as 'pen' | 'marker' }))}
                                    style={{ background: '#222', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '3px 6px', fontSize: '0.8rem' }}>
                                    <option value="pen">Pen</option>
                                    <option value="marker">Marker</option>
                                </select>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '36px' }}>補正</span>
                                    <input type="range" min="0" max="9" value={freehandSettings.stabilization}
                                        onChange={e => setFreehandSettings(s => ({ ...s, stabilization: +e.target.value }))}
                                        style={{ flex: 1 }} />
                                    <span style={{ fontSize: '0.8rem', color: '#ccc', minWidth: '16px' }}>{freehandSettings.stabilization}</span>
                                </div>
                            </div>
                        )}
                        {selectedIds.length === 1 && selectedObject?.type === 'image' && (
                            <div style={{ marginTop: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#ccc' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedObject.keepRatio ?? true}
                                        onChange={(e) => {
                                            updateNoteObject(targetType, displayTargetId, selectedIds[0], { keepRatio: e.target.checked }, true);
                                            saveNoteHistory();
                                        }}
                                    />
                                    アスペクト比を維持
                                </label>
                            </div>
                        )}
                        {selectedIds.length === 1 && selectedObject && (
                            <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Layer</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                    {(['front', 'up', 'down', 'back'] as const).map(dir => (
                                        <button key={dir}
                                            onClick={() => { reorderNoteObject(targetType, displayTargetId, selectedIds[0], dir); saveNoteHistory(); }}
                                            style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {selectedIds.length >= 2 && (
                            <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Group</div>
                                <button
                                    onClick={() => {
                                        const newGroupId = `group_${Date.now()}`;
                                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                                        saveNoteHistory();
                                    }}
                                    style={{ width: '100%', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    グループ化 (Ctrl+G)
                                </button>
                                {selectedGroupId && (
                                    <button
                                        onClick={() => {
                                            updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: undefined } })));
                                            setSelectedIds([]);
                                            saveNoteHistory();
                                        }}
                                        style={{ width: '100%', marginTop: '4px', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        グループ解除 (Ctrl+Shift+G)
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={() => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); }}
                            disabled={selectedIds.length === 0}
                            style={{ marginTop: '10px', background: selectedIds.length === 0 ? '#444' : '#ef4444', color: selectedIds.length === 0 ? '#888' : 'white', fontSize: '1rem', padding: '5px' }}
                        >
                            Delete Selected
                        </button>
                    </div>
                    <h3>Images</h3>
                    <div className="char-thumbnails">
                        {/* 事件ノートでは全キャラの立ち絵を常時パレット表示（クリックで配置） */}
                        {portraitPalette.map((src, idx) => (
                            <div
                                key={`portrait-${idx}`}
                                className={`thumb ${placementMode?.data === src ? 'active' : ''}`}
                                onClick={() => startPlacement('image', src)}
                            >
                                <img src={src} alt={`portrait-${idx}`} />
                            </div>
                        ))}
                        {assets.map((asset, idx) => (
                            <div
                                key={idx}
                                className={`thumb ${placementMode?.data === asset ? 'active' : ''}`}
                                onClick={() => startPlacement('image', asset)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setAssetContextMenu({ index: idx, x: e.clientX, y: e.clientY });
                                }}
                            >
                                <img src={asset} alt={`asset-${idx}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showTopbar && !compactMode && (
                <div className="char-topbar">
                    <div className="nav-controls">
                        {titleNode}
                    </div>
                </div>
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
                    gridRow: showTopbar ? 2 : '1 / -1' 
                }}
            >
                <div style={{
                    display: isGridMode ? 'grid' : 'flex',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
                    // ▼ 修正: 4ペイン表示の時は、ペイン間のみ隙間(gap)を設定する
                    gap: isGridMode ? '4px' : '0px',
                    width: '100%',
                    height: '100%',
                    flex: 1,
                    position: 'relative'
                }}>
                    {canvasSize.width > 0 && [0, 1, 2, 3].map(index => {
                        if (!isGridMode && currentCanvasIndex !== index) return null;
                        
                        const isCurrent = currentCanvasIndex === index;
                        const isHovered = hoveredCanvasIndex === index;
                        
                        // 外側のパディングをなくしたため、幅の計算から引くのはgap分のみ
                        const gapWidth = isGridMode ? 4 : 0;
                        const cellWidth = isGridMode ? (canvasSize.width - gapWidth) / 2 : canvasSize.width;
                        const cellHeight = isGridMode ? (canvasSize.height - gapWidth) / 2 : canvasSize.height;

                        const borderWidth = (isGridMode && !compactMode) ? 2 : 0;
                        const stageWidth = Math.max(0, cellWidth - (borderWidth * 2));
                        const stageHeight = Math.max(0, cellHeight - (borderWidth * 2));

                        // compact/非compact 共通の論理キャンバスサイズ (1200×800)
                        // ズームやウィンドウリサイズでも論理座標系が変わらないよう scale で吸収する
                        const CANVAS_BASE_WIDTH = 1200;
                        const CANVAS_BASE_HEIGHT = 800;
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
                        const isSidePanels = compactMode && !isGridMode;
                        let effScale: number;
                        let stageRenderW: number;
                        let stageRenderH: number;
                        let toolbarW = 0;        // compact: 左にドックするツールバー幅（=Canvasの左余白を全部埋める）
                        if (isSidePanels) {
                            // Canvasは高さ優先でフィットし、横の余白を全部ツールバーが埋める（空白を作らない）。
                            // 横幅が足りない(縦長セル)場合は幅優先にフォールバックし、最小ツールバー幅を確保。
                            const heightFit = stageHeight / CANVAS_BASE_H;
                            const canvasWAtHeightFit = CANVAS_BASE_W * heightFit;
                            if (canvasWAtHeightFit <= stageWidth - COMPACT_SIDE_MIN) {
                                effScale = heightFit;
                                stageRenderW = canvasWAtHeightFit;
                                stageRenderH = stageHeight;
                            } else {
                                const widthFit = Math.max(0, (stageWidth - COMPACT_SIDE_MIN)) / CANVAS_BASE_W;
                                effScale = widthFit;
                                stageRenderW = CANVAS_BASE_W * widthFit;
                                stageRenderH = CANVAS_BASE_H * widthFit;
                            }
                            toolbarW = Math.max(COMPACT_SIDE_MIN, stageWidth - stageRenderW);
                        } else {
                            effScale = Math.min(stageWidth / CANVAS_BASE_W, stageHeight / CANVAS_BASE_H);
                            stageRenderW = CANVAS_BASE_W * effScale;
                            stageRenderH = CANVAS_BASE_H * effScale;
                        }
                        // compact: Stageはツールバーの右隣に左寄せ配置（Y中央）。非compactはセル中央。
                        const stageOffsetX = isSidePanels ? toolbarW : (stageWidth - stageRenderW) / 2;
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
                                    // Note/Animate統一: セル(pane)は暗色マージン、紙面(方眼)はStage(=基準範囲)側に表示。
                                    // compactは左の余白(toolbarW)をツールバーで全部埋め、Stageはその右隣に左寄せ＋Y中央。
                                    backgroundColor: '#1e1e1e',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: isSidePanels ? 'flex-start' : 'center',
                                    paddingLeft: isSidePanels ? `${toolbarW}px` : 0
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
                                            const isSelected = selectedIds.includes(obj.id);
                                            if (obj.id === editingTextId) return null;

                                            // グループドラッグ: ドラッグ中に同グループの他メンバーを追従させる
                                            const groupDragHandlers = obj.groupId ? {
                                                onDragMove: (e: any) => {
                                                    const dx = e.target.x() - (obj.x ?? 0);
                                                    const dy = e.target.y() - (obj.y ?? 0);
                                                    const stage = trRefs.current[index]?.getStage();
                                                    currentCanvasObjects
                                                        .filter(o => o.groupId === obj.groupId && o.id !== obj.id)
                                                        .forEach(member => {
                                                            const node = stage?.findOne(`#${member.id}`);
                                                            if (node) {
                                                                node.x((member.x ?? 0) + dx);
                                                                node.y((member.y ?? 0) + dy);
                                                            }
                                                        });
                                                    trRefs.current[index]?.getLayer()?.batchDraw();
                                                },
                                            } : {};

                                            const props = {
                                                imageObj: obj, textObj: obj, shapeObj: obj,
                                                isSelected,
                                                isDrawingMode,
                                                ...groupDragHandlers,
                                                // ドラッグ確定はグループ/単体ともに統一ハンドラへ（#4 ペイン跨ぎ移動対応）
                                                onDragEnd: (e: any) => handleObjectDragEnd(e, obj, index, scale),
                                                onSelect: (e: any) => {
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
                                                onChange: (newAttrs: NoteObject) => {
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

                                                    setEditingTextId(obj.id);
                                                    setSelectedIds([]);
                                                },
                                                onContextMenu: (e: any) => {
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
                                                    ref={drawingNodeRef}
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
                                                    ref={drawingNodeRef}
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
                                                    ref={drawingNodeRef}
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

                                {/* compact(Animate): 左の余白にCanvas操作ツールバーをドック。
                                    幅(toolbarW)は3:2フィットで生じる左余白を全部埋めるレスポンシブ値。 */}
                                {isSidePanels && toolbarW > 4 && (
                                    <div style={{
                                        position: 'absolute', left: 0, top: 0, bottom: 0,
                                        width: `${toolbarW}px`,
                                        overflowY: 'auto',
                                        background: '#1a1a1a', borderRight: '1px solid #333',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        {renderPortalUI()}
                                    </div>
                                )}

                                {isCurrent && editingTextId && (() => {
                                    const obj = objs.find(o => o.id === editingTextId);
                                    if (!obj || obj.type !== 'text') return null;
                                    const editWidth = editingTextBoundsRef.current?.width ?? 200;
                                    return (
                                        <textarea
                                            key={editingTextId}
                                            value={obj.text}
                                            ref={(el) => {
                                                if (el) {
                                                    el.style.height = 'auto';
                                                    el.style.height = `${el.scrollHeight}px`;
                                                }
                                            }}
                                            onChange={(e) => {
                                                updateNoteObject(targetType, displayTargetId, obj.id, { text: e.target.value }, true);
                                                const el = e.target;
                                                el.style.height = 'auto';
                                                el.style.height = `${el.scrollHeight}px`;
                                            }}
                                            onBlur={() => {
                                                saveNoteHistory();
                                                setEditingTextId(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape') e.currentTarget.blur();
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
                    <div 
                        style={{
                            position: 'fixed', top: shapeContextMenu.y, left: shapeContextMenu.x,
                            background: '#2d2d2d', border: '1px solid #444', borderRadius: '8px', 
                            padding: '15px', zIndex: 1000, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', width: '200px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {['line', 'arrow', 'curve', 'curve_arrow', 'freehand'].includes(shapeContextMenu.type as string) && (
                            <>
                                <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Style</div>
                                <select 
                                    value={shapeContextMenu.lineStyle || 'normal'}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setShapeContextMenu(prev => prev ? {...prev, lineStyle: val} : null);
                                        updateNoteObject(targetType, displayTargetId, shapeContextMenu.id, { lineStyle: val as any }, true);
                                    }}
                                    onBlur={() => saveNoteHistory()}
                                    style={{ width: '100%', marginBottom: '10px', background: '#222', color: 'white', border: '1px solid #555', padding: '4px', borderRadius: '3px' }}
                                >
                                    <option value="normal">Normal</option>
                                    <option value="marker">Marker</option>
                                    <option value="pen">Pen</option>
                                </select>
                            </>
                        )}

                        <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Color</div>
                        <input 
                            type="color" 
                            value={shapeContextMenu.stroke}
                            onChange={(e) => {
                                const val = e.target.value;
                                const id = shapeContextMenu.id;
                                commitThrottled(() => {
                                    setShapeContextMenu(prev => prev ? {...prev, stroke: val} : null);
                                    updateNoteObject(targetType, displayTargetId, id, { stroke: val }, true);
                                });
                            }}
                            onBlur={() => saveNoteHistory()}
                            style={{ width: '100%', marginBottom: '10px' }} 
                        />

                        <div style={{ marginBottom: '5px', fontSize: '0.85rem' }}>Line Width: {shapeContextMenu.strokeWidth}</div>
                        <input 
                            type="range" min="0" max="20"
                            value={shapeContextMenu.strokeWidth}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const id = shapeContextMenu.id;
                                commitThrottled(() => {
                                    setShapeContextMenu(prev => prev ? {...prev, strokeWidth: val} : null);
                                    updateNoteObject(targetType, displayTargetId, id, { strokeWidth: val }, true);
                                });
                            }}
                            onMouseUp={() => saveNoteHistory()}
                            onTouchEnd={() => saveNoteHistory()} 
                            style={{ width: '100%', marginBottom: '10px' }} 
                        />

                        {['rect', 'circle', 'triangle'].includes(shapeContextMenu.type) && (
                            <>
                                <div style={{ marginBottom: '5px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Fill Color</span>
                                    <button 
                                        onClick={() => {
                                            setShapeContextMenu(prev => prev ? {...prev, fill: 'transparent'} : null);
                                            updateNoteObject(targetType, displayTargetId, shapeContextMenu.id, { fill: 'transparent' }, true);
                                            saveNoteHistory();
                                        }}
                                        style={{ background: '#444', border: '1px solid #666', color: '#ccc', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        No Fill
                                    </button>
                                </div>
                                <input 
                                    type="color" 
                                    value={shapeContextMenu.fill === 'transparent' ? '#ffffff' : (shapeContextMenu.fill || '#A8D5BA')}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const id = shapeContextMenu.id;
                                        commitThrottled(() => {
                                            setShapeContextMenu(prev => prev ? {...prev, fill: val} : null);
                                            updateNoteObject(targetType, displayTargetId, id, { fill: val }, true);
                                        });
                                    }}
                                    onBlur={() => saveNoteHistory()}
                                    style={{ width: '100%' }}
                                />
                            </>
                        )}

                        <div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px' }}>
                            <div style={{ fontSize: '0.85rem', marginBottom: '5px', color: '#aaa' }}>Layer</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                {(['front', 'up', 'down', 'back'] as const).map((dir) => (
                                    <button
                                        key={dir}
                                        onClick={() => { reorderNoteObject(targetType, displayTargetId, shapeContextMenu.id, dir); setShapeContextMenu(null); }}
                                        style={{ background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        {dir === 'front' ? '最前面' : dir === 'back' ? '最背面' : dir === 'up' ? '前へ' : '後へ'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {selectedIds.length >= 2 && (
                            <div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px' }}>
                                <div style={{ fontSize: '0.85rem', marginBottom: '5px', color: '#aaa' }}>Group</div>
                                <button
                                    onClick={() => {
                                        const newGroupId = `group_${Date.now()}`;
                                        updateNoteObjects(targetType, displayTargetId, selectedIds.map(id => ({ id, attrs: { groupId: newGroupId } })));
                                        setShapeContextMenu(null);
                                        saveNoteHistory();
                                    }}
                                    style={{ width: '100%', background: '#3a3a3a', border: '1px solid #555', color: '#ccc', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    グループ化
                                </button>
                            </div>
                        )}
                    </div>
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

export const NoteView: React.FC = React.memo(() => {
    const activeNoteTab = useAppStore(state => state.activeNoteTab);
    const notes = useAppStore(state => state.notes);
    const presets = useAppStore(state => state.presets);
    const activePresetId = useAppStore(state => state.activePresetId);
    const addMiscPage = useAppStore(state => state.addMiscPage);
    const renameMiscPage = useAppStore(state => state.renameMiscPage);
    const deleteMiscPage = useAppStore(state => state.deleteMiscPage);
    const showConfirm = useAppStore(state => state.showConfirm);
    
    const [displayTab, setDisplayTab] = useState(activeNoteTab);
    const [opacity, setOpacity] = useState(1);

    const [actualCharIndex, setActualCharIndex] = useState(0);
    const [actualMiscPageId, setActualMiscPageId] = useState<string | null>(null);
    const [actualPresetId, setActualPresetId] = useState<string | null>(null);
    const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
    const [renameInputValue, setRenameInputValue] = useState('');

    useEffect(() => {
        if (activeNoteTab !== displayTab) {
            setOpacity(0);
            const timer = setTimeout(() => {
                setDisplayTab(activeNoteTab);
                setTimeout(() => setOpacity(1), 50);
            }, 200); 
            return () => clearTimeout(timer);
        }
    }, [activeNoteTab, displayTab]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (activeNoteTab === 'character' && e.target === document.body) {
                if (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') {
                    setActualCharIndex(prev => (prev - 1 + ICON_FILES.length) % ICON_FILES.length);
                }
                if (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') {
                    setActualCharIndex(prev => (prev + 1) % ICON_FILES.length);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeNoteTab]);

    useEffect(() => {
        if (!actualPresetId && activePresetId) {
            setActualPresetId(activePresetId);
        }
    }, [activePresetId, actualPresetId]);

    useEffect(() => {
        if (activeNoteTab === 'misc' && !actualMiscPageId && notes.miscPages?.length > 0) {
            setActualMiscPageId(notes.miscPages[0].id);
        }
    }, [activeNoteTab, notes.miscPages, actualMiscPageId]);

    const selectedChar = ICON_FILES[actualCharIndex];
    const initializedCharsRef = useRef<Set<string>>(new Set());

    const addNoteAsset = useAppStore(state => state.addNoteAsset);
    const addNoteObject = useAppStore(state => state.addNoteObject);
    const updateNoteObject = useAppStore(state => state.updateNoteObject);

    useEffect(() => {
        if (activeNoteTab !== 'character') return;
        if (initializedCharsRef.current.has(selectedChar)) return;

        const charData = useAppStore.getState().notes.characters?.[selectedChar];
        if (charData && charData.objects.length > 0) {
            initializedCharsRef.current.add(selectedChar);
            // 旧データ移行: ./icon/ を使っている初期キャラ画像を ./character/ に更新
            const oldIconSrc = `./icon/${selectedChar}`;
            const newCharSrc = `./character/${selectedChar}`;
            charData.objects.forEach(obj => {
                if (obj.content === oldIconSrc) {
                    updateNoteObject('character', selectedChar, obj.id, { content: newCharSrc }, true);
                }
            });
            return;
        }

        // 非同期処理開始前にマーク（ループ防止の核心）
        initializedCharsRef.current.add(selectedChar);

        const defaultImgSrc = `./character/${selectedChar}`;
        addNoteAsset('character', selectedChar, defaultImgSrc);
        getImageSizeFromUrl(defaultImgSrc, 800).then(size => {
            // キャンバス論理高さ600を基準に左下に上半身が見える位置（下半分がキャンバス外）
            const canvasLogicalHeight = 600;
            addNoteObject('character', selectedChar, {
                id: `default_char_${Date.now()}`,
                type: 'image',
                x: 0,
                y: canvasLogicalHeight - size.height / 2,
                width: size.width, height: size.height,
                content: defaultImgSrc,
                rotation: 0, scaleX: 1, scaleY: 1,
                keepRatio: true,
                canvasIndex: 0
            });
        });
    }, [selectedChar, activeNoteTab, addNoteAsset, addNoteObject, updateNoteObject]);

    return (
        <div className="note-view-container">
            <div className="note-content" style={{ opacity: opacity, transition: 'opacity 0.2s ease-in-out' }}>
                {displayTab === 'overview' && (
                    <CanvasWorkspace
                        targetType="overview"
                        targetId="overview"
                    />
                )}

                {displayTab === 'preset' && actualPresetId && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="preset-header" style={{ padding: '10px 20px', background: '#1e1e1e', borderBottom: '1px solid #444', display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>事件ノート</div>
                            <select value={actualPresetId} onChange={e => setActualPresetId(e.target.value)} style={{ background: '#333', color: 'white', border: '1px solid #555', padding: '6px 12px', borderRadius: '4px' }}>
                                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <CanvasWorkspace targetType="preset" targetId={actualPresetId} />
                        </div>
                    </div>
                )}

                {displayTab === 'character' && (
                    <CanvasWorkspace
                        targetType="character"
                        targetId={selectedChar}
                        titleNode={
                            <>
                                <button onClick={() => setActualCharIndex(prev => (prev - 1 + ICON_FILES.length) % ICON_FILES.length)}>◀</button>
                                <div className="char-icon-list">
                                    {ICON_FILES.map((icon, idx) => (
                                        <div key={icon} className={`nav-icon ${actualCharIndex === idx ? 'active' : ''}`} onClick={() => setActualCharIndex(idx)}>
                                            <img src={`./icon/${icon}`} alt="" />
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setActualCharIndex(prev => (prev + 1) % ICON_FILES.length)}>▶</button>
                            </>
                        }
                    />
                )}

                {displayTab === 'misc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="preset-header" style={{ padding: '10px 20px', background: '#1e1e1e', borderBottom: '1px solid #444', display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>Misc Notes</div>
                            {notes.miscPages && notes.miscPages.length > 0 ? (
                                <>
                                    <select 
                                        value={actualMiscPageId || ''} 
                                        onChange={e => setActualMiscPageId(e.target.value)} 
                                        style={{ background: '#333', color: 'white', border: '1px solid #555', padding: '6px 12px', borderRadius: '4px' }}
                                    >
                                        {notes.miscPages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                                    </select>
                                    <button 
                                        onClick={() => addMiscPage("New Page")}
                                        style={{ background: '#007acc', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Add New Note"
                                    >+</button>
                                    {renamingPageId === actualMiscPageId ? (
                                        <input
                                            autoFocus
                                            value={renameInputValue}
                                            onChange={e => setRenameInputValue(e.target.value)}
                                            onBlur={() => {
                                                const id = renamingPageId;
                                                if (id && renameInputValue.trim()) renameMiscPage(id, renameInputValue.trim());
                                                setRenamingPageId(null);
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                if (e.key === 'Escape') setRenamingPageId(null);
                                            }}
                                            style={{ background: '#333', color: 'white', border: '1px solid #007acc', padding: '4px 8px', borderRadius: '4px', minWidth: '120px' }}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => {
                                                const page = notes.miscPages?.find(p => p.id === actualMiscPageId);
                                                if (page) {
                                                    setRenamingPageId(page.id);
                                                    setRenameInputValue(page.title);
                                                }
                                            }}
                                            style={{ background: '#444', border: '1px solid #555', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                                            title="Rename Note"
                                        >✏️</button>
                                    )}
                                    <button 
                                        onClick={async () => {
                                            if (await showConfirm("このノートを削除しますか？")) {
                                                deleteMiscPage(actualMiscPageId as string);
                                                setActualMiscPageId(null);
                                            }
                                        }}
                                        style={{ background: '#ef4444', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                                        title="Delete Note"
                                    >🗑️</button>
                                </>
                            ) : (
                                <button 
                                    onClick={() => addMiscPage("New Page")}
                                    style={{ background: '#007acc', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                                >
                                    Create New Note
                                </button>
                            )}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {actualMiscPageId && notes.miscPages?.some(p => p.id === actualMiscPageId) ? (
                                <CanvasWorkspace targetType="misc" targetId={actualMiscPageId} />
                            ) : (
                                <div style={{ color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1.2rem' }}>
                                    No misc notes available.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});