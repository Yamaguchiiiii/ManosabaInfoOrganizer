import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Image as KonvaImage, Text, Rect, Circle, RegularPolygon, Arrow, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { useAppStore, ICON_FILES, NoteObject, NoteObjectType, NoteTargetType } from '../store';
import '../styles/NoteView.scss';

const HANDWRITING_FONT = '"Yomogi", "Klee One", "Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';

type ExtendedNoteObjectType = NoteObjectType | 'freehand';

// --- 画像コンポーネント (メモ化) ---
const URLImage = React.memo(({ imageObj, onSelect, onChange, isDrawingMode }: any) => {
    const [img] = useImage(imageObj.content || '');

    return (
        <KonvaImage
            id={imageObj.id}
            name="note-object"
            onClick={onSelect}
            onTap={onSelect}
            image={img}
            x={imageObj.x}
            y={imageObj.y}
            width={imageObj.width}
            height={imageObj.height}
            rotation={imageObj.rotation}
            scaleX={imageObj.scaleX}
            scaleY={imageObj.scaleY}
            draggable={!isDrawingMode}
            onDragEnd={(e) => {
                onChange({ x: e.target.x(), y: e.target.y() });
            }}
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
const EditableText = React.memo(({ textObj, onSelect, onChange, onToggleEdit, isDrawingMode }: any) => {
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
            onDragEnd={(e) => {
                onChange({ x: e.target.x(), y: e.target.y() });
            }}
            onTransformEnd={(e) => {
                const node = e.target;
                onChange({
                    x: node.x(),
                    y: node.y(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                    rotation: node.rotation(),
                });
            }}
        />
    );
});

// --- 図形コンポーネント (メモ化) ---
const ShapeObject = React.memo(({ shapeObj, onSelect, onChange, onContextMenu, isDrawingMode }: any) => {
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
        onDragEnd: (e: any) => onChange({ x: e.target.x(), y: e.target.y() }),
        onTransformEnd: (e: any) => {
            const node = e.target;
            onChange({
                x: node.x(),
                y: node.y(),
                scaleX: node.scaleX(),
                scaleY: node.scaleY(),
                rotation: node.rotation()
            });
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
                <Rect {...commonProps} width={100} height={100} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} />
            )}
            {shapeObj.type === 'circle' && (
                <Circle {...commonProps} radius={50} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} />
            )}
            {shapeObj.type === 'triangle' && (
                <RegularPolygon {...commonProps} sides={3} radius={50} fill={shapeObj.fill} stroke={shapeObj.stroke} strokeWidth={shapeObj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} />
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

const processFile = (file: File): Promise<{ base64: string, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                const maxDimension = 500;
                
                if (width > height) {
                    if (width > maxDimension) { height *= maxDimension / width; width = maxDimension; }
                } else {
                    if (height > maxDimension) { width *= maxDimension / height; height = maxDimension; }
                }
                
                resolve({ base64, width, height });
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
    const updateNoteObject = useAppStore(state => state.updateNoteObject);
    const removeNoteObjects = useAppStore(state => state.removeNoteObjects);
    const addNoteAsset = useAppStore(state => state.addNoteAsset);
    const removeNoteAsset = useAppStore(state => state.removeNoteAsset);
    const undoNote = useAppStore(state => state.undoNote);
    const saveNoteHistory = useAppStore(state => state.saveNoteHistory);

    const [currentCanvasIndex, setCurrentCanvasIndex] = useState(0);
    const [isGridMode, setIsGridMode] = useState(false);
    const [isGridEditMode, setIsGridEditMode] = useState(false);
    const [hoveredCanvasIndex, setHoveredCanvasIndex] = useState<number | null>(null);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    type PlacementMode = { type: ExtendedNoteObjectType, data?: any } | null;
    const [placementMode, setPlacementMode] = useState<PlacementMode>(null);

    const isDrawingMode = !!placementMode;

    const [selectionRect, setSelectionRect] = useState({ startX: 0, startY: 0, w: 0, h: 0, visible: false, canvasIndex: 0 });

    const isDrawingRef = useRef(false);
    const drawingShapeInfoRef = useRef<any>(null); 
    const drawingNodeRef = useRef<any>(null);
    const [drawingActive, setDrawingActive] = useState(false);

    const [shapeContextMenu, setShapeContextMenu] = useState<{ id: string, type: ExtendedNoteObjectType, x: number, y: number, stroke: string, strokeWidth: number, fill?: string, lineStyle?: string } | null>(null);
    const [assetContextMenu, setAssetContextMenu] = useState<{ index: number, x: number, y: number } | null>(null);
    
    const [isFontLoaded, setIsFontLoaded] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const trRefs = useRef<(Konva.Transformer | null)[]>([null, null, null, null]);

    const [padPos, setPadPos] = useState<{x: number, y: number} | null>(null);
    const [isDraggingPad, setIsDraggingPad] = useState(false);
    const padDragStartRef = useRef({ x: 0, y: 0, padX: 0, padY: 0 });

    useEffect(() => {
        if (compactMode && !padPos && canvasContainerRef.current) {
            const rect = canvasContainerRef.current.getBoundingClientRect();
            setPadPos({ x: rect.left + 10, y: rect.top + 10 });
        }
    }, [compactMode, padPos, canvasSize]);

    const handlePadDragStart = (e: React.MouseEvent) => {
        if (!padPos) return;
        setIsDraggingPad(true);
        padDragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            padX: padPos.x,
            padY: padPos.y
        };
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!isDraggingPad || !padPos) return;
            const dx = e.clientX - padDragStartRef.current.x;
            const dy = e.clientY - padDragStartRef.current.y;
            setPadPos({
                x: padDragStartRef.current.padX + dx,
                y: padDragStartRef.current.padY + dy
            });
        };
        const handleGlobalMouseUp = () => {
            setIsDraggingPad(false);
        };
        if (isDraggingPad) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDraggingPad, padPos]);

    const objects = targetData?.objects || [];
    const assets = targetData?.assets || [];

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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target !== document.body) return; 
            if (editingTextId) return; 

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoNote();
                setSelectedIds([]);
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
    }, [selectedIds, displayTargetId, targetType, removeNoteObjects, editingTextId, placementMode, shapeContextMenu, undoNote]);

    useEffect(() => {
        const timer = setTimeout(() => {
            [0, 1, 2, 3].forEach(index => {
                const tr = trRefs.current[index];
                if (tr) {
                    const stage = tr.getStage();
                    if (stage) {
                        const nodes = selectedIds.map(id => stage.findOne(`#${id}`)).filter(Boolean) as Konva.Node[];
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
                canvasIndex: currentCanvasIndex
            });
        }
    };

    const handleStageMouseDown = async (e: Konva.KonvaEventObject<MouseEvent>, index: number, scale: number) => {
        if (e.evt.button !== 0) return; 

        if (placementMode) {
            const stagePos = e.target.getStage()?.getPointerPosition();
            if (!stagePos) return;
            const pos = { x: stagePos.x / scale, y: stagePos.y / scale }; 
            
            if (['line', 'arrow', 'curve', 'curve_arrow', 'freehand'].includes(placementMode.type as string)) {
                isDrawingRef.current = true;
                drawingShapeInfoRef.current = {
                    id: `${placementMode.type}_${Date.now()}`, 
                    type: placementMode.type,
                    x: pos.x, y: pos.y, 
                    points: placementMode.type === 'freehand' ? [0, 0] : [0, 0, 0, 0],
                    stroke: '#000000', strokeWidth: 3, rotation: 0, scaleX: 1, scaleY: 1,
                    lineStyle: placementMode.type === 'freehand' ? 'pen' : 'normal', 
                    canvasIndex: index
                };
                setDrawingActive(true); 
                return;
            }

            const baseId = `${placementMode.type}_${Date.now()}`;
            let newObj: NoteObject | null = null;
            if (placementMode.type === 'text') {
                newObj = { id: baseId, type: 'text', x: pos.x, y: pos.y, text: 'Text', fontSize: 24, fontWeight: 'normal', fill: '#000000', rotation: 0, scaleX: 1, scaleY: 1 };
            } else if (['rect', 'circle', 'triangle'].includes(placementMode.type as string)) {
                newObj = { id: baseId, type: placementMode.type as NoteObjectType, x: pos.x, y: pos.y, fill: '#A8D5BA', stroke: '#000000', strokeWidth: 2, rotation: 0, scaleX: 1, scaleY: 1 };
            } else if (placementMode.type === 'image') {
                const { width, height } = await getImageSizeFromUrl(placementMode.data, 300);
                newObj = { id: baseId, type: 'image', x: pos.x, y: pos.y, width, height, content: placementMode.data, rotation: 0, scaleX: 1, scaleY: 1 };
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

            const pos = e.target.getStage()?.getPointerPosition();
            if (pos) {
                setSelectionRect({ startX: pos.x, startY: pos.y, w: 0, h: 0, visible: true, canvasIndex: index });
            }
        } else {
            setShapeContextMenu(null);
            setAssetContextMenu(null);
        }
    };

    const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>, index: number, scale: number) => {
        if (isDrawingRef.current && drawingShapeInfoRef.current && drawingShapeInfoRef.current.canvasIndex === index && drawingNodeRef.current) {
            const stagePos = e.target.getStage()?.getPointerPosition();
            if (stagePos) {
                const logicalPos = { x: stagePos.x / scale, y: stagePos.y / scale };
                const dx = logicalPos.x - drawingShapeInfoRef.current.x;
                const dy = logicalPos.y - drawingShapeInfoRef.current.y;
                
                if ((drawingShapeInfoRef.current.type as string) === 'freehand') {
                    drawingShapeInfoRef.current.points?.push(dx, dy);
                    drawingNodeRef.current.points(drawingShapeInfoRef.current.points);
                    drawingNodeRef.current.getLayer()?.batchDraw();
                } else {
                    let newPoints = [0, 0, dx, dy];
                    if (['curve', 'curve_arrow'].includes(drawingShapeInfoRef.current.type as string)) {
                        newPoints = [0, 0, dx / 2, dy / 2 - 50, dx, dy]; 
                    }
                    drawingNodeRef.current.points(newPoints);
                    drawingNodeRef.current.getLayer()?.batchDraw();
                    drawingShapeInfoRef.current.points = newPoints;
                }
            }
            return;
        }

        if (!selectionRect.visible || selectionRect.canvasIndex !== index) return;
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos) {
            setSelectionRect(prev => ({
                ...prev,
                w: pos.x - prev.startX,
                h: pos.y - prev.startY
            }));
        }
    };

    const handleStageMouseUp = (e: Konva.KonvaEventObject<MouseEvent>, index: number, scale: number) => {
        if (isDrawingRef.current && drawingShapeInfoRef.current) {
            isDrawingRef.current = false;
            addNoteObject(targetType, displayTargetId, {
                ...drawingShapeInfoRef.current,
                id: `${drawingShapeInfoRef.current.type}_${Date.now()}`
            });
            drawingShapeInfoRef.current = null;
            setDrawingActive(false);
            
            if ((placementMode?.type as string) !== 'freehand') {
                setPlacementMode(null);
            }
            return;
        }

        if (!selectionRect.visible || selectionRect.canvasIndex !== index) return;
        setSelectionRect(prev => ({ ...prev, visible: false }));

        const box = {
            x: Math.min(selectionRect.startX, selectionRect.startX + selectionRect.w) / scale,
            y: Math.min(selectionRect.startY, selectionRect.startY + selectionRect.h) / scale,
            width: Math.abs(selectionRect.w) / scale,
            height: Math.abs(selectionRect.h) / scale
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
    const showTopbar = targetType === 'character' && !compactMode;

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

    const renderPortalUI = () => {
        if (!compactMode || !padPos) return null;

        const uiElements = (
            <>
                <div 
                    style={{
                        position: 'fixed',
                        left: padPos.x,
                        top: padPos.y,
                        zIndex: 999999,
                        display: 'flex',
                        alignItems: 'stretch',
                        backgroundColor: 'rgba(30, 30, 30, 0.95)', 
                        border: '1px solid #555',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        padding: '5px'
                    }}
                >
                    <div 
                        onMouseDown={handlePadDragStart}
                        style={{
                            width: '16px',
                            cursor: 'grab',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 4px)',
                            gridTemplateRows: 'repeat(3, 4px)',
                            gap: '2px',
                            alignContent: 'center',
                            justifyContent: 'center',
                            paddingRight: '6px',
                            borderRight: '1px solid #555',
                            marginRight: '6px'
                        }}
                    >
                        {[...Array(6)].map((_, i) => (
                            <div key={i} style={{ width: '4px', height: '4px', backgroundColor: '#888', borderRadius: '50%' }} />
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <button title="Image" onClick={() => fileInputRef.current?.click()} style={toolBtnStyle(false)}>🖼️</button>
                        <button title="Text" onClick={() => startPlacement('text')} style={toolBtnStyle((placementMode?.type as string) === 'text')}>T</button>
                        <button title="Freehand (Pencil)" onClick={() => startPlacement('freehand')} style={toolBtnStyle((placementMode?.type as string) === 'freehand')}>✏️</button>
                        <div style={{ width: '1px', height: '20px', backgroundColor: '#555', margin: '0 5px' }} />
                        <button title="Circle" onClick={() => startPlacement('circle')} style={toolBtnStyle((placementMode?.type as string) === 'circle')}>○</button>
                        <button title="Triangle" onClick={() => startPlacement('triangle')} style={toolBtnStyle((placementMode?.type as string) === 'triangle')}>△</button>
                        <button title="Rect" onClick={() => startPlacement('rect')} style={toolBtnStyle((placementMode?.type as string) === 'rect')}>■</button>
                        <button title="Line" onClick={() => startPlacement('line')} style={toolBtnStyle((placementMode?.type as string) === 'line')}>─</button>
                        <button title="Arrow" onClick={() => startPlacement('arrow')} style={toolBtnStyle((placementMode?.type as string) === 'arrow')}>→</button>
                        <button title="Curve" onClick={() => startPlacement('curve')} style={toolBtnStyle((placementMode?.type as string) === 'curve')}>~</button>
                        <button title="Curve Arrow" onClick={() => startPlacement('curve_arrow')} style={toolBtnStyle((placementMode?.type as string) === 'curve_arrow')}>↷</button>
                        <div style={{ width: '1px', height: '20px', backgroundColor: '#555', margin: '0 5px' }} />
                        <button 
                            title="Delete Selected"
                            onClick={() => { removeNoteObjects(targetType, displayTargetId, selectedIds); setSelectedIds([]); }} 
                            disabled={selectedIds.length === 0}
                            style={{ ...toolBtnStyle(false), color: selectedIds.length === 0 ? '#555' : '#ef4444', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            🗑️
                        </button>
                    </div>
                </div>

                {(!showTopbar) && selectedIds.length === 1 && selectedObject?.type === 'text' && canvasContainerRef.current && (
                    <div style={{ 
                        position: 'fixed', 
                        top: canvasContainerRef.current.getBoundingClientRect().top + 10, 
                        left: canvasContainerRef.current.getBoundingClientRect().right - 180, 
                        zIndex: 999999, 
                        background: 'rgba(30,30,30,0.95)', 
                        padding: '5px 10px', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        gap: '10px', 
                        border: '1px solid #555', 
                        color: '#ccc', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)' 
                    }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>Size: 
                            <input type="number" value={selectedObject.fontSize || 24} onChange={(e) => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontSize: parseInt(e.target.value) }, true)} onBlur={() => saveNoteHistory()} min="8" max="100" style={{ width: '45px', background: '#222', border: '1px solid #555', color: 'white', borderRadius: '3px', padding: '2px 5px' }}/>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>
                            <input type="checkbox" checked={selectedObject.fontWeight === 'bold'} onChange={(e) => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontWeight: e.target.checked ? 'bold' : 'normal' }, true)} onBlur={() => saveNoteHistory()} />
                            Bold
                        </label>
                    </div>
                )}
            </>
        );

        return createPortal(uiElements, document.body);
    };

    return (
        <div 
            className={compactMode ? "" : "character-canvas-layout"} 
            style={compactMode ? { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } : { width: '100%', height: '100%', gridTemplateRows: showTopbar ? '60px 1fr' : '1fr' }}
        >
            {renderPortalUI()}
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
                    {selectedIds.length === 1 && selectedObject?.type === 'text' && (
                        <div className="property-bar">
                            <label>Size: 
                                <input 
                                    type="number" 
                                    value={selectedObject.fontSize || 24} 
                                    onChange={(e) => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontSize: parseInt(e.target.value) }, true)}
                                    onBlur={() => saveNoteHistory()}
                                    min="8" max="100"
                                />
                            </label>
                            <label>
                                <input 
                                    type="checkbox" 
                                    checked={selectedObject.fontWeight === 'bold'}
                                    onChange={(e) => updateNoteObject(targetType, displayTargetId, selectedIds[0], { fontWeight: e.target.checked ? 'bold' : 'normal' }, true)}
                                    onBlur={() => saveNoteHistory()}
                                />
                                Bold
                            </label>
                        </div>
                    )}
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

                        // ▼ 修正: 4ペイン時に過剰に縮小する処理を廃止し、0.5倍に固定して均等に拡大配置する
                        let scale = 1;
                        if (compactMode) {
                            const BASE_WIDTH = 1200; 
                            const BASE_HEIGHT = 800; 
                            scale = Math.min(stageWidth / BASE_WIDTH, stageHeight / BASE_HEIGHT);
                        } else if (isGridMode) {
                            scale = 0.5;
                        }

                        const objs = objects.filter(o => (o.canvasIndex || 0) === index);

                        return (
                            <div 
                                key={index}
                                onMouseEnter={() => { if (isGridMode) setHoveredCanvasIndex(index); }}
                                onMouseLeave={() => { if (isGridMode) setHoveredCanvasIndex(null); }}
                                style={{
                                    width: '100%', height: '100%',
                                    position: 'relative',
                                    boxSizing: 'border-box',
                                    border: isGridMode ? (isHovered || isCurrent ? '2px solid #007acc' : '2px solid #444') : (compactMode ? 'none' : 'none'),
                                    boxShadow: isGridMode && isHovered ? '0 0 12px rgba(0, 122, 204, 0.8)' : 'none',
                                    transition: 'all 0.2s',
                                    overflow: 'hidden',
                                    backgroundColor: '#ECD2B3',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 24 0 L 0 0 0 24' fill='none' stroke='%23C2B2A1' stroke-width='1' stroke-dasharray='3 3'/%3E%3C/svg%3E")`,
                                    backgroundSize: `${24 * scale}px ${24 * scale}px`
                                }}
                                onClick={(e) => {
                                    if (isGridMode && !isGridEditMode && !isCurrent) {
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
                                    width={stageWidth} height={stageHeight}
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
                                    style={{ cursor: placementMode && isCurrent ? 'crosshair' : (isGridMode && !isGridEditMode ? 'pointer' : 'default') }}
                                >
                                    <Layer scaleX={scale} scaleY={scale}>
                                        {isFontLoaded && objs.map((obj) => {
                                            const isSelected = selectedIds.includes(obj.id);
                                            if (obj.id === editingTextId) return null;

                                            const props = {
                                                imageObj: obj, textObj: obj, shapeObj: obj,
                                                isSelected, 
                                                isDrawingMode,
                                                onSelect: (e: any) => {
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;
                                                    
                                                    if (isGridMode && isGridEditMode && !isCurrent) {
                                                        setCurrentCanvasIndex(index);
                                                    }
                                                    
                                                    if (placementMode) return;
                                                    if (e.evt?.shiftKey) {
                                                        setSelectedIds(prev => prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]);
                                                    } else {
                                                        setSelectedIds([obj.id]);
                                                    }
                                                },
                                                onChange: (newAttrs: NoteObject) => updateNoteObject(targetType, displayTargetId, obj.id, newAttrs),
                                                onToggleEdit: () => {
                                                    if (isGridMode && !isGridEditMode && !isCurrent) return;
                                                    if (isGridMode && isGridEditMode && !isCurrent) setCurrentCanvasIndex(index);
                                                    
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

                                        {isCurrent && (
                                            <Transformer
                                                ref={(el) => { trRefs.current[index] = el; }}
                                                boundBoxFunc={(oldBox, newBox) => {
                                                    if (newBox.width < 5 || newBox.height < 5) return oldBox;
                                                    return newBox;
                                                }}
                                            />
                                        )}

                                        {selectionRect.visible && selectionRect.canvasIndex === index && (
                                            <Rect
                                                x={Math.min(selectionRect.startX, selectionRect.startX + selectionRect.w) / scale}
                                                y={Math.min(selectionRect.startY, selectionRect.startY + selectionRect.h) / scale}
                                                width={Math.abs(selectionRect.w) / scale}
                                                height={Math.abs(selectionRect.h) / scale}
                                                fill="rgba(0, 122, 204, 0.2)"
                                                stroke="#007acc"
                                                strokeWidth={1 / scale}
                                                listening={false}
                                            />
                                        )}
                                    </Layer>
                                </Stage>

                                {isCurrent && editingTextId && (() => {
                                    const obj = objs.find(o => o.id === editingTextId);
                                    if (!obj || obj.type !== 'text') return null;
                                    return (
                                        <textarea
                                            value={obj.text}
                                            onChange={(e) => updateNoteObject(targetType, displayTargetId, obj.id, { text: e.target.value }, true)}
                                            onBlur={() => {
                                                saveNoteHistory();
                                                setEditingTextId(null);
                                            }}
                                            autoFocus
                                            style={{
                                                position: 'absolute', 
                                                top: obj.y * scale, 
                                                left: obj.x * scale,
                                                fontSize: `${obj.fontSize || 24}px`, 
                                                fontWeight: obj.fontWeight || 'normal',
                                                fontFamily: HANDWRITING_FONT, 
                                                color: obj.fill || 'black',
                                                background: 'transparent', 
                                                border: '1px dashed #007acc', 
                                                outline: '1px dashed #007acc',
                                                resize: 'both', 
                                                overflow: 'hidden', 
                                                minWidth: '50px', 
                                                minHeight: '1.2em', 
                                                whiteSpace: 'pre',
                                                transform: `rotate(${obj.rotation || 0}deg) scale(${(obj.scaleX || 1) * scale}, ${(obj.scaleY || 1) * scale})`,
                                                transformOrigin: 'top left', 
                                                zIndex: 100 
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
                                setShapeContextMenu(prev => prev ? {...prev, stroke: val} : null);
                                updateNoteObject(targetType, displayTargetId, shapeContextMenu.id, { stroke: val }, true);
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
                                setShapeContextMenu(prev => prev ? {...prev, strokeWidth: val} : null);
                                updateNoteObject(targetType, displayTargetId, shapeContextMenu.id, { strokeWidth: val }, true);
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
                                        setShapeContextMenu(prev => prev ? {...prev, fill: val} : null);
                                        updateNoteObject(targetType, displayTargetId, shapeContextMenu.id, { fill: val }, true);
                                    }} 
                                    onBlur={() => saveNoteHistory()}
                                    style={{ width: '100%' }} 
                                />
                            </>
                        )}
                    </div>
                )}

                {assetContextMenu && (
                    <div 
                        style={{ 
                            position: 'fixed', top: assetContextMenu.y, left: assetContextMenu.x, 
                            background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', zIndex: 1000 
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
    
    const [displayTab, setDisplayTab] = useState(activeNoteTab);
    const [opacity, setOpacity] = useState(1);

    const [actualCharIndex, setActualCharIndex] = useState(0);
    const [actualMiscPageId, setActualMiscPageId] = useState<string | null>(null);
    const [actualPresetId, setActualPresetId] = useState<string | null>(null);

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
    
    useEffect(() => {
        if (activeNoteTab !== 'character') return;
        if (initializedCharsRef.current.has(selectedChar)) return;

        const charData = useAppStore.getState().notes.characters?.[selectedChar];
        if (charData && charData.objects.length > 0) {
            initializedCharsRef.current.add(selectedChar);
            return;
        }

        // 非同期処理開始前にマーク（ループ防止の核心）
        initializedCharsRef.current.add(selectedChar);

        const defaultImgSrc = `./icon/${selectedChar}`;
        addNoteAsset('character', selectedChar, defaultImgSrc);
        getImageSizeFromUrl(defaultImgSrc, 500).then(size => {
            addNoteObject('character', selectedChar, {
                id: `default_char_${Date.now()}`,
                type: 'image',
                x: 50, y: 100,
                width: size.width, height: size.height,
                content: defaultImgSrc,
                rotation: 0, scaleX: 1, scaleY: 1,
                canvasIndex: 0
            });
        });
    }, [selectedChar, activeNoteTab, addNoteAsset, addNoteObject]);

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
                            <div style={{ color: 'white', fontWeight: 'bold' }}>Timeline Notes</div>
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
                                    <button 
                                        onClick={() => {
                                            const page = notes.miscPages?.find(p => p.id === actualMiscPageId);
                                            if (page) {
                                                const newTitle = window.prompt("Rename Note:", page.title);
                                                if (newTitle && newTitle.trim() !== "") {
                                                    renameMiscPage(actualMiscPageId as string, newTitle.trim());
                                                }
                                            }
                                        }}
                                        style={{ background: '#444', border: '1px solid #555', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                                        title="Rename Note"
                                    >✏️</button>
                                    <button 
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to delete this note?")) {
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