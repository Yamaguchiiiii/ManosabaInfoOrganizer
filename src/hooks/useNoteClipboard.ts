import { useCallback } from 'react';
import { useAppStore, NoteObject, NoteTargetType } from '../store';
import { toast } from '../services/toast';

// ノートのコピー/切り取り/貼り付け（revise No.10: クリップボードをstore化し、
// ノート種別を跨いだ貼り付け・切替時の保持を可能にする）。
export const useNoteClipboard = (
    targetType: NoteTargetType,
    displayTargetId: string,
    currentCanvasIndex: number,
    selectedIds: string[],
    currentCanvasObjects: NoteObject[],
    setSelectedIds: (ids: string[]) => void,
) => {
    const clipboard = useAppStore(s => s.noteClipboard);
    const setClipboard = useAppStore(s => s.setNoteClipboard);
    const addNoteObjects = useAppStore(s => s.addNoteObjects);
    const removeNoteObjects = useAppStore(s => s.removeNoteObjects);

    // 選択中オブジェクトをクリップボードへコピー（サイズ・色などの属性を維持）
    const handleCopySelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
        toast.info(`${sel.length}件をコピーしました`);
    }, [selectedIds, currentCanvasObjects, setClipboard]);

    // 選択中オブジェクトを切り取り（クリップボードへ退避してから削除する。属性は維持）
    const handleCutSelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
        removeNoteObjects(targetType, displayTargetId, selectedIds);
        setSelectedIds([]);
        toast.info(`${sel.length}件を切り取りました`);
    }, [selectedIds, currentCanvasObjects, setClipboard, removeNoteObjects, targetType, displayTargetId, setSelectedIds]);

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
        toast.info(`${newObjs.length}件を貼り付けました`);
    }, [clipboard, currentCanvasIndex, addNoteObjects, targetType, displayTargetId, setSelectedIds]);

    return { clipboard, handleCopySelected, handleCutSelected, handlePasteClipboard };
};
