// data URL / Blob をファイルとして保存する（Web 標準。Tauri の WebView でもそのまま動く）。
// B-4（PNG書き出し）等で使用。
export const downloadDataUrl = (dataUrl: string, filename: string): void => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
};
