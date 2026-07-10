import { useEffect, MutableRefObject } from 'react';
import { NoteObject, NoteTargetType } from '../store';
import { PlacementMode } from '../components/note/noteConstants';
import { ShapeContextMenuState } from '../components/note/ShapeContextMenu';

interface UseNoteKeyboardArgs {
    editingTextId: string | null;
    setPlacementMode: (mode: PlacementMode) => void;
    undoNote: () => void;
    redoNote: () => void;
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    updateNoteObjects: (targetType: NoteTargetType, targetId: string, updates: { id: string, attrs: Partial<NoteObject> }[], skipHistory?: boolean) => void;
    removeNoteObjects: (targetType: NoteTargetType, targetId: string, objIds: string[]) => void;
    targetType: NoteTargetType;
    displayTargetId: string;
    handleCopySelected: () => void;
    handleCutSelected: () => void;
    handlePasteClipboard: () => void;
    clipboard: NoteObject[];
    placementMode: PlacementMode;
    shapeContextMenu: ShapeContextMenuState | null;
    isDrawingRef: MutableRefObject<boolean>;
    setCurrentCanvasIndex: (updater: (prev: number) => number) => void;
}

// CanvasWorkspace のキーボードショートカット（undo/redo/コピペ/削除/グループ化/ペイン切替）。
export const useNoteKeyboard = ({
    editingTextId, setPlacementMode, undoNote, redoNote,
    selectedIds, setSelectedIds, updateNoteObjects, removeNoteObjects, targetType, displayTargetId,
    handleCopySelected, handleCutSelected, handlePasteClipboard, clipboard,
    placementMode, shapeContextMenu, isDrawingRef, setCurrentCanvasIndex,
}: UseNoteKeyboardArgs): void => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // IME変換中（日本語入力中）はショートカットを発火させない（半角/全角や変換キーを奪わない）。
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') {
                setPlacementMode(null);
                return;
            }
            if (e.target !== document.body) return;
            if (editingTextId) return;

            // Ctrl+Z: 取り消し / Ctrl+Shift+Z・Ctrl+Y: やり直し（Redo）。#refactoring B-2
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoNote();
                setSelectedIds([]);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                redoNote();
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
    }, [selectedIds, displayTargetId, targetType, updateNoteObjects, removeNoteObjects, editingTextId, placementMode, shapeContextMenu, undoNote, redoNote, clipboard, handleCopySelected, handlePasteClipboard, handleCutSelected, setPlacementMode, setSelectedIds, isDrawingRef, setCurrentCanvasIndex]);
};
