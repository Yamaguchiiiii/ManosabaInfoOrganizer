import { useState, useRef, useCallback, useEffect, MutableRefObject } from 'react';
import { NoteObject, NoteTargetType, useAppStore } from '../store';

export interface UseTextEditingResult {
    editingTextId: string | null;
    setEditingTextId: (id: string | null) => void;
    editingTextValue: string;
    setEditingTextValue: (v: string) => void;
    editingTextValueRef: MutableRefObject<string>;
    editingTextIdRef: MutableRefObject<string | null>;
    editingTextBoundsRef: MutableRefObject<{ width: number } | null>;
    finishTextEditing: () => void;
}

// テキストオブジェクトのインライン編集状態。1キーストロークごとの再描画を避けるため
// 編集中はローカルstate/refで保持し、確定時のみstoreへコミットする。#06/28-14:10-4, 17:04-3
export const useTextEditing = (
    targetType: NoteTargetType,
    displayTargetId: string,
    updateNoteObject: (targetType: NoteTargetType, targetId: string, objId: string, attrs: Partial<NoteObject>, skipHistory?: boolean) => void,
    saveNoteHistory: () => void,
): UseTextEditingResult => {
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState('');
    // 入力値を ref にもミラーする。クリックで編集を抜ける際、mousedown が
    // onBlur より先に editingTextId を消すと onBlur のコミットが走らず入力が失われるため、
    // どの経路から編集終了しても確実にコミットできるよう finishTextEditing() を用意する。
    const editingTextValueRef = useRef('');
    const editingTextIdRef = useRef<string | null>(null);
    useEffect(() => { editingTextIdRef.current = editingTextId; }, [editingTextId]);
    const editingTextBoundsRef = useRef<{ width: number } | null>(null);

    // テキスト編集を確定して終了する。どの経路（blur/クリック離脱/Enter）から呼ばれても
    // 入力値(ref)を必ずコミットする。二重呼び出しは prevId=null で無視（冪等）。#06/28-17:04-3
    const finishTextEditing = useCallback(() => {
        const id = editingTextIdRef.current;
        if (!id) return;
        editingTextIdRef.current = null; // 二重コミット防止（mousedown と blur の両方から呼ばれ得る）
        // 変更前スナップショットを積んでからコミットする（56db688 のピッカー修正と同じ規約）。
        // 値が変わっていない場合は履歴も更新も行わない（空 undo ステップ防止）。revise3 A-2
        const cur = useAppStore.getState();
        const find = (): string | undefined => {
            const notes = cur.notes;
            const canvas = targetType === 'overview' ? notes.overviewCanvas
                : targetType === 'preset' ? notes.presets?.[displayTargetId]
                : targetType === 'character' ? notes.characters?.[displayTargetId]
                : notes.miscPages?.find(p => p.id === displayTargetId)?.canvas;
            return canvas?.objects.find(o => o.id === id)?.text;
        };
        if (find() !== editingTextValueRef.current) {
            saveNoteHistory();
            updateNoteObject(targetType, displayTargetId, id, { text: editingTextValueRef.current }, true);
        }
        setEditingTextId(null);
    }, [targetType, displayTargetId, updateNoteObject, saveNoteHistory]);

    return {
        editingTextId, setEditingTextId,
        editingTextValue, setEditingTextValue,
        editingTextValueRef, editingTextIdRef, editingTextBoundsRef,
        finishTextEditing,
    };
};
