import { useCallback, useRef } from 'react';
import { useAppStore, NoteObject, NoteTargetType } from '../store';
import { toast } from '../services/toast';
import { NOTE_CANVAS } from '../constants';

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
    // revise3 B-11: 同じ内容を連続貼り付けすると全部同じ位置に積み重なって見えるため、
    // クリップボード世代ごとの貼り付け回数でオフセットを累積させる。
    const pasteCountRef = useRef(0);

    // 選択中オブジェクトをクリップボードへコピー（サイズ・色などの属性を維持）
    const handleCopySelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
        pasteCountRef.current = 0;
        toast.info(`${sel.length}件をコピーしました`);
    }, [selectedIds, currentCanvasObjects, setClipboard]);

    // 選択中オブジェクトを切り取り（クリップボードへ退避してから削除する。属性は維持）
    const handleCutSelected = useCallback(() => {
        if (selectedIds.length === 0) return;
        const sel = currentCanvasObjects.filter(o => selectedIds.includes(o.id));
        if (sel.length === 0) return;
        setClipboard(sel.map(o => ({ ...o, points: o.points ? [...o.points] : undefined })));
        pasteCountRef.current = 0;
        removeNoteObjects(targetType, displayTargetId, selectedIds);
        setSelectedIds([]);
        toast.info(`${sel.length}件を切り取りました`);
    }, [selectedIds, currentCanvasObjects, setClipboard, removeNoteObjects, targetType, displayTargetId, setSelectedIds]);

    // クリップボードの内容を現在のキャンバスへ少しずらして貼り付ける（グループ構造も維持）
    const handlePasteClipboard = useCallback(() => {
        if (clipboard.length === 0) return;
        const stamp = Date.now();
        pasteCountRef.current += 1;
        const off = 20 * pasteCountRef.current;
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
                x: (o.x || 0) + off,
                y: (o.y || 0) + off,
                canvasIndex: currentCanvasIndex,
                groupId,
                points: o.points ? [...o.points] : undefined,
            };
        });
        if (targetType === 'preset') {
            // 全体のバウンディングを 0..1200/0..800 内へ平行移動（相対位置は維持・revise3 A-8）
            const xs = newObjs.map(o => o.x || 0), ys = newObjs.map(o => o.y || 0);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const dx = minX < 0 ? -minX : (maxX > NOTE_CANVAS.W ? NOTE_CANVAS.W - maxX : 0);
            const dy = minY < 0 ? -minY : (maxY > NOTE_CANVAS.H ? NOTE_CANVAS.H - maxY : 0);
            newObjs.forEach(o => { o.x = Math.max(0, Math.min(NOTE_CANVAS.W, (o.x || 0) + dx)); o.y = Math.max(0, Math.min(NOTE_CANVAS.H, (o.y || 0) + dy)); });
        }
        addNoteObjects(targetType, displayTargetId, newObjs);
        setSelectedIds(newObjs.map(o => o.id));
        toast.info(`${newObjs.length}件を貼り付けました`);
    }, [clipboard, currentCanvasIndex, addNoteObjects, targetType, displayTargetId, setSelectedIds]);

    return { clipboard, handleCopySelected, handleCutSelected, handlePasteClipboard };
};
