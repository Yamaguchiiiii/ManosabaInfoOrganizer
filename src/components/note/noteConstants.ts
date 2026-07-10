import { ICON_FILES, NoteObjectType } from '../../store';

export const HANDWRITING_FONT = '"Yomogi", "Klee One", "Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';

export type ExtendedNoteObjectType = NoteObjectType | 'freehand';

export type FreehandSettings = {
    color: string;
    strokeWidth: number;
    lineStyle: 'pen' | 'marker';
    stabilization: number;
};

// 配置待機モード。data は画像配置時のみ使う（asset://キー or 静的パス）。R8: any禁止のためstringに限定。
export type PlacementMode = { type: ExtendedNoteObjectType; data?: string } | null;

// フリーハンド線を滑らかにする（Chaikin's corner-cutting algorithm）。
export const applyChaikin = (points: number[], iterations: number): number[] => {
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
export const CHARACTER_PORTRAITS = ICON_FILES.map(icon => `./character/${icon}`);
