import { resolveAssetUrl } from '../services/assetStore';

// url は静的パス / data: / asset:// のいずれでも可（asset:// は object URL に解決してから計測）。
export const getImageSizeFromUrl = async (url: string, maxDimension = 500): Promise<{ width: number, height: number }> => {
    const resolved = await resolveAssetUrl(url);
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
        img.src = resolved;
    });
};

// canvas を PNG Blob 化する（toDataURL の base64 を避け、state に載せない実体を得る）。
export const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
    new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));

// 透明背景をトリミングし、最大500pxへ縮小した PNG Blob を返す（前景でバウンディングボックスを取る）。
export const autocropTransparent = (
    originalBlob: Blob,
    dataUrl: string,
    imgWidth: number,
    imgHeight: number
): Promise<{ blob: Blob; width: number; height: number }> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve({ blob: originalBlob, width: imgWidth, height: imgHeight }); return; }
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
                resolve({ blob: originalBlob, width: imgWidth, height: imgHeight });
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
            // 縮小が必要なら別canvasで縮小してから Blob 化
            if (w !== cropW || h !== cropH) {
                const scaled = document.createElement('canvas');
                scaled.width = w; scaled.height = h;
                scaled.getContext('2d')!.drawImage(cropCanvas, 0, 0, w, h);
                canvasToBlob(scaled).then(blob => resolve({ blob, width: w, height: h }))
                    .catch(() => resolve({ blob: originalBlob, width: imgWidth, height: imgHeight }));
            } else {
                canvasToBlob(cropCanvas).then(blob => resolve({ blob, width: w, height: h }))
                    .catch(() => resolve({ blob: originalBlob, width: imgWidth, height: imgHeight }));
            }
        };
        src.onerror = () => resolve({ blob: originalBlob, width: imgWidth, height: imgHeight });
        src.src = dataUrl;
    });
};

// アップロード画像を「autocrop済みPNG Blob + 表示寸法」に変換する（base64は state に載せない）。
export const processFile = (file: File): Promise<{ blob: Blob, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                autocropTransparent(file, dataUrl, img.width, img.height).then(resolve);
            };
            img.onerror = reject;
            img.src = dataUrl;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};
