import React, { useEffect } from 'react';
import { Image as KonvaImage, Group, Circle, Line, Rect } from 'react-konva';
import { useCachedImage } from '../../services/imageCache';

// ノード描画コンポーネント共通の props（Group の全 props ＋ 選択/経路ハイライト）。
// ...props は Konva Group にそのまま渡る（onClick 等のイベントも型付きで受け取れる）。
type NodeVisualProps = {
    isSelected?: boolean;
    isPath?: boolean;
} & React.ComponentProps<typeof Group>;

// ▼▼▼ 新しいモダンカラーパレットの定義 ▼▼▼
export const THEME_COLORS = {
  room: { 
    fill: '#0ea5e9',   // スカイブルー (落ち着いた青)
    stroke: '#7dd3fc'  // 少し明るい枠線
  },
  pass: { 
    fill: '#4b5563',   // クールグレー (目立たない)
    stroke: '#6b7280' 
  },
  stair: { 
    fill: '#10b981',   // エメラルド (落ち着いた緑)
    stroke: '#6ee7b7' 
  },
  edge: {
    stroke: '#64748b'  // スレートグレー (線を主張させない)
  },
  selected: { stroke: '#f59e0b', glow: '#f59e0b' }, // 選択中（アンバー）
  path: { stroke: '#d946ef', glow: '#d946ef' },     // 経路（フクシャ/ネオンピンク）
  text: '#f1f5f9'
};


// マップ画像表示コンポーネント。読み込んだ画像の自然サイズを onLoad で通知できる。
// モジュールキャッシュ利用でページ遷移/ペイン再マウント時の再デコードを避ける（A-7）。
export const MapImage = ({ src, onLoad }: { src: string, onLoad?: (w: number, h: number) => void }) => {
  const image = useCachedImage(src);
  useEffect(() => {
    if (image && onLoad) onLoad(image.width, image.height);
  }, [image, onLoad]);
  return <KonvaImage image={image} />;
};

// ▼▼▼ RoomNode (修正版: モダンなハイライト) ▼▼▼
export const RoomNode = ({
  x, y, isSelected, isPath, opacity, hitStrokeWidth = 20, ...props
}: NodeVisualProps) => {
  const size = 18;
  const colors = THEME_COLORS.room;

  // 優先順位: 選択中 > 経路中 > 通常
  const currentStroke = isSelected ? THEME_COLORS.selected.stroke 
                      : isPath ? THEME_COLORS.path.stroke 
                      : colors.stroke;
  
  const currentGlow = isSelected ? THEME_COLORS.selected.glow
                    : isPath ? THEME_COLORS.path.glow
                    : 'transparent';

  const isHighlighted = isSelected || isPath;

  return (
    <Group x={x} y={y} opacity={opacity} {...props}>
      <Rect
        width={size} height={size}
        offsetX={size / 2} offsetY={size / 2}
        rotation={45} hitStrokeWidth={hitStrokeWidth}
        fill={colors.fill}
        
        stroke={currentStroke}
        strokeWidth={isHighlighted ? 3 : 1.5}

        shadowColor={currentGlow}
        shadowBlur={isHighlighted ? 15 : 0}
        shadowOpacity={isHighlighted ? 0.8 : 0}
        shadowOffset={{ x: 0, y: 0 }}
      />
    </Group>
  );
};

// ▼▼▼ PassNode (isPath対応) ▼▼▼
export const PassNode = ({
  x, y, isSelected, isPath, opacity, hitStrokeWidth = 20, ...props
}: NodeVisualProps) => {
  const colors = THEME_COLORS.pass;
  const currentStroke = isSelected ? THEME_COLORS.selected.stroke 
                      : isPath ? THEME_COLORS.path.stroke 
                      : colors.stroke;
  const currentGlow = isSelected ? THEME_COLORS.selected.glow
                    : isPath ? THEME_COLORS.path.glow
                    : 'transparent';
  const isHighlighted = isSelected || isPath;

  return (
    <Group x={x} y={y} opacity={opacity} {...props}>
      <Circle
        radius={5} hitStrokeWidth={hitStrokeWidth}
        fill={colors.fill}
        
        stroke={currentStroke}
        strokeWidth={isHighlighted ? 2 : 1}

        shadowColor={currentGlow}
        shadowBlur={isHighlighted ? 10 : 0}
        shadowOpacity={isHighlighted ? 0.6 : 0}
      />
    </Group>
  );
};

// ▼▼▼ StairNode (isPath対応) ▼▼▼
export const StairNode = ({
  x, y, isSelected, isPath, opacity, hitStrokeWidth = 30, ...props
}: NodeVisualProps) => {
  const colors = THEME_COLORS.stair;
  const currentStroke = isSelected ? THEME_COLORS.selected.stroke 
                      : isPath ? THEME_COLORS.path.stroke 
                      : colors.stroke;
  const currentGlow = isSelected ? THEME_COLORS.selected.glow
                    : isPath ? THEME_COLORS.path.glow
                    : 'transparent';
  const isHighlighted = isSelected || isPath;

  return (
    <Group x={x} y={y} opacity={opacity} {...props}>
      <Circle
        radius={12} hitStrokeWidth={hitStrokeWidth}
        fill={colors.fill}
        
        stroke={currentStroke}
        strokeWidth={isHighlighted ? 3 : 2}

        shadowColor={currentGlow}
        shadowBlur={isHighlighted ? 20 : 0}
        shadowOpacity={isHighlighted ? 0.8 : 0}
        shadowOffset={{ x: 0, y: 0 }}
      />
      <Line
        x={-6} y={6}
        points={[0, 0, 4, 0, 4, -4, 8, -4, 8, -8, 12, -8, 12, -12]}
        stroke="white" strokeWidth={2}
        lineCap="round" lineJoin="round" listening={false}
      />
    </Group>
  );
};