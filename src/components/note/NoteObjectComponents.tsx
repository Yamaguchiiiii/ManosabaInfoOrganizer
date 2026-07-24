import React from 'react';
import { Image as KonvaImage, Text, Rect, Circle, RegularPolygon, Arrow, Line, Group } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { NoteObject } from '../../store';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { HANDWRITING_FONT } from './noteConstants';

// asset:// キーにも対応する <img>（サムネイル/ギャラリー用）。静的パス/data: はそのまま表示。
export const AssetImg: React.FC<{ src: string; alt?: string; style?: React.CSSProperties }> = ({ src, alt, style }) => {
    const url = useAssetUrl(src);
    return <img src={url || ''} alt={alt} style={style} />;
};

export interface NoteObjectComponentProps {
    obj: NoteObject;
    isDrawingMode: boolean;
    onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
    onChange: (attrs: Partial<NoteObject>) => void;
    onToggleEdit?: () => void;
    onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
    onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
    // revise3 B-4: 長押しで ShapeContextMenu を開くための起点（タッチには右クリックが無い）
    onTouchStart?: (e: Konva.KonvaEventObject<TouchEvent>) => void;
}

// --- 画像コンポーネント (メモ化) ---
export const URLImage = React.memo(({ obj, onSelect, onChange, onContextMenu, onDragStart, onDragMove, onDragEnd, onTouchStart, isDrawingMode }: NoteObjectComponentProps) => {
    // content が asset:// なら Blob の object URL を解決してから読み込む（P2）。
    const resolvedSrc = useAssetUrl(obj.content ?? '');
    const [img, status] = useImage(resolvedSrc || '');

    // 読み込み失敗時は「見えないが存在する」を避け、破線プレースホルダを表示（E5）。
    // オブジェクト自体は保持（選択・移動・削除は可能）＝データを壊さない。
    if (status === 'failed') {
        const w = obj.width || 100;
        const h = obj.height || 100;
        return (
            <Group
                id={obj.id}
                name="note-object"
                x={obj.x}
                y={obj.y}
                rotation={obj.rotation}
                scaleX={obj.scaleX}
                scaleY={obj.scaleY}
                draggable={!isDrawingMode}
                onClick={onSelect}
                onTap={onSelect}
                onContextMenu={onContextMenu}
                onTouchStart={onTouchStart}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd ?? ((e) => onChange({ x: e.target.x(), y: e.target.y() }))}
            >
                <Rect width={w} height={h} fill="#3a3a3a" stroke="#f59e0b" strokeWidth={1} dash={[6, 4]} cornerRadius={4} />
                <Text text={'⚠\n画像を\n読み込めません'} width={w} height={h} align="center" verticalAlign="middle" fontSize={Math.max(9, Math.min(13, w / 9))} fill="#f59e0b" listening={false} />
            </Group>
        );
    }

    return (
        <KonvaImage
            id={obj.id}
            name="note-object"
            onClick={onSelect}
            onTap={onSelect}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            image={img}
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            rotation={obj.rotation}
            scaleX={obj.scaleX}
            scaleY={obj.scaleY}
            draggable={!isDrawingMode}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd ?? ((e) => { onChange({ x: e.target.x(), y: e.target.y() }); })}
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
// タップ領域を拡張するための余白。文字サイズが小さい/短いテキストは見た目の外接矩形が
// 指のタップ幅より狭く、スマホで選択しにくいため hitFunc で当たり判定だけ広げる。
const TEXT_HIT_PADDING = 14;

export const EditableText = React.memo(({ obj, onSelect, onChange, onToggleEdit, onDragStart, onDragMove, onDragEnd, isDrawingMode }: NoteObjectComponentProps) => {
    return (
        <Text
            id={obj.id}
            name="note-object"
            onClick={onSelect}
            onTap={onSelect}
            onDblClick={onToggleEdit}
            text={obj.text}
            x={obj.x}
            y={obj.y}
            fontSize={obj.fontSize || 24}
            fontStyle={obj.fontWeight || 'normal'}
            fontFamily={HANDWRITING_FONT}
            fill={obj.fill}
            rotation={obj.rotation}
            scaleX={obj.scaleX}
            scaleY={obj.scaleY}
            draggable={!isDrawingMode}
            hitFunc={(context, shape) => {
                context.beginPath();
                context.rect(
                    -TEXT_HIT_PADDING,
                    -TEXT_HIT_PADDING,
                    shape.width() + TEXT_HIT_PADDING * 2,
                    shape.height() + TEXT_HIT_PADDING * 2,
                );
                context.closePath();
                context.fillStrokeShape(shape);
            }}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd ?? ((e) => { onChange({ x: e.target.x(), y: e.target.y() }); })}
        />
    );
});

// --- 図形コンポーネント (メモ化) ---
export const ShapeObject = React.memo(({ obj, onSelect, onChange, onContextMenu, onDragStart, onDragMove, onDragEnd, onTouchStart, isDrawingMode }: NoteObjectComponentProps) => {
    const commonProps: Konva.ShapeConfig = {
        id: obj.id,
        name: "note-object",
        onClick: onSelect,
        onTap: onSelect,
        onContextMenu: onContextMenu,
        onTouchStart: onTouchStart,
        x: obj.x,
        y: obj.y,
        rotation: obj.rotation,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        draggable: !isDrawingMode,
        onDragStart: onDragStart,
        onDragMove: onDragMove,
        onDragEnd: onDragEnd ?? ((e: Konva.KonvaEventObject<DragEvent>) => onChange({ x: e.target.x(), y: e.target.y() })),
        onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
            const node = e.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const type = obj.type;
            if (type === 'rect') {
                onChange({
                    x: node.x(), y: node.y(),
                    width: Math.round((obj.width || 100) * scaleX),
                    height: Math.round((obj.height || 100) * scaleY),
                    scaleX: 1, scaleY: 1,
                    rotation: node.rotation(),
                });
            } else if (type === 'circle' || type === 'triangle') {
                const scale = Math.max(scaleX, scaleY);
                onChange({
                    x: node.x(), y: node.y(),
                    width: Math.round((obj.width || 100) * scale),
                    height: Math.round((obj.height || 100) * scale),
                    scaleX: 1, scaleY: 1,
                    rotation: node.rotation(),
                });
            } else {
                // 24.md §3: line 系(line/arrow/curve/curve_arrow/freehand)は width/height を持たず
                // points で形状が決まる。旧実装は scale を捨てて scaleX/Y=1 に戻すだけで、拡大が
                // points に反映されず「元サイズに戻る」バグになっていた。scale(と回転)を points へ
                // 焼き込んでから scale を 1 に正規化する。
                const basePoints = obj.points
                    ?? (obj.type.includes('curve') ? [0, 0, 50, -50, 100, 0] : [0, 0, 100, 0]);
                const rot = (node.rotation() * Math.PI) / 180;
                const cos = Math.cos(rot), sin = Math.sin(rot);
                const newPoints: number[] = [];
                for (let i = 0; i < basePoints.length; i += 2) {
                    // まず scale、次に回転を各点へ適用（Konva の transform 適用順に一致）
                    const sx = basePoints[i] * scaleX;
                    const sy = basePoints[i + 1] * scaleY;
                    newPoints.push(sx * cos - sy * sin, sx * sin + sy * cos);
                }
                onChange({
                    x: node.x(), y: node.y(),
                    points: newPoints,
                    scaleX: 1, scaleY: 1,
                    rotation: 0, // 回転は points へ焼き込んだので 0 に正規化
                });
            }
        }
    };

    const getLineProps = (): Konva.ShapeConfig => {
        const props: Konva.ShapeConfig = { ...commonProps };
        if (obj.lineStyle === 'marker') {
            props.opacity = 0.4;
            props.lineCap = 'round';
            props.lineJoin = 'round';
        } else if (obj.lineStyle === 'pen') {
            props.lineCap = 'round';
            props.lineJoin = 'round';
        }
        props.hitStrokeWidth = Math.max(20, obj.strokeWidth || 3);
        return props;
    };

    const isStrokeEnabled = obj.strokeWidth !== 0;
    const linePoints = obj.points || (obj.type.includes('curve') ? [0, 0, 50, -50, 100, 0] : [0, 0, 100, 0]);

    return (
        <>
            {obj.type === 'rect' && (
                <Rect {...commonProps} width={obj.width || 100} height={obj.height || 100} fill={obj.fill} stroke={obj.stroke} strokeWidth={obj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {obj.type === 'circle' && (
                <Circle {...commonProps} radius={(obj.width || 100) / 2} fill={obj.fill} stroke={obj.stroke} strokeWidth={obj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {obj.type === 'triangle' && (
                <RegularPolygon {...commonProps} sides={3} radius={(obj.width || 100) / 2} fill={obj.fill} stroke={obj.stroke} strokeWidth={obj.strokeWidth || 0} strokeEnabled={isStrokeEnabled} strokeScaleEnabled={false} />
            )}
            {obj.type === 'line' && (
                <Arrow {...getLineProps()} points={linePoints} pointerLength={0} pointerWidth={0} stroke={obj.stroke} strokeWidth={obj.strokeWidth || 3} />
            )}
            {obj.type === 'arrow' && (
                <Arrow {...getLineProps()} points={linePoints} pointerLength={10} pointerWidth={10} stroke={obj.stroke} fill={obj.stroke} strokeWidth={obj.strokeWidth || 3} />
            )}
            {obj.type === 'curve' && (
                <Arrow {...getLineProps()} points={linePoints} tension={0.5} pointerLength={0} pointerWidth={0} stroke={obj.stroke} strokeWidth={obj.strokeWidth || 3} />
            )}
            {obj.type === 'curve_arrow' && (
                <Arrow {...getLineProps()} points={linePoints} tension={0.5} pointerLength={10} pointerWidth={10} stroke={obj.stroke} fill={obj.stroke} strokeWidth={obj.strokeWidth || 3} />
            )}
            {obj.type === 'freehand' && (
                <Line
                    {...getLineProps()}
                    points={obj.points || []}
                    tension={0.5}
                    stroke={obj.stroke}
                    strokeWidth={obj.strokeWidth || 3}
                />
            )}
        </>
    );
});
