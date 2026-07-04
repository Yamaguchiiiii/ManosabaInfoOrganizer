// 内部ID("1_sakuraba_ema.png")を読みやすい表示名("Sakuraba Ema")へ整形する。
// CreateView / MergeModal / Animate 凡例などで共用（重複実装を統合。refactoring A-8-5）。
export const formatCharName = (charId: string): string => {
    const base = charId.replace(/\.[^/.]+$/, '');
    const parts = base.split('_');
    if (parts.length > 1 && !isNaN(Number(parts[0]))) parts.shift();
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};
