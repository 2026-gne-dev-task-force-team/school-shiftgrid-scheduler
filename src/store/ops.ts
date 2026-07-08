/**
 * 그리드 편집 연산(복사·붙여넣기·지우기) — 툴바 버튼과 키보드 단축키가 함께 쓴다.
 * 선택 영역(사각형)을 읽어 클립보드에 담거나, 클립보드를 선택 왼쪽 위에 붙인다.
 */
import type { Assignment } from '../types/schema';
import { useStore, type BlockCell, type Selection } from './store';

const norm = (s: Selection) => ({
    top: Math.min(s.r1, s.r2), bottom: Math.max(s.r1, s.r2),
    left: Math.min(s.c1, s.c2), right: Math.max(s.c1, s.c2),
});

export function useGridOps() {
    const { doc, ui, setUI, dispatch } = useStore();

    const cellAt = (trackId: string, dayIndex: number, slotIndex: number): Assignment | undefined =>
        doc.assignments.find((a) => a.trackId === trackId && a.dayIndex === dayIndex && a.slotIndex === slotIndex);

    const copy = () => {
        if (!ui.selection) return;
        const { top, bottom, left, right } = norm(ui.selection);
        const block: BlockCell[][] = [];
        for (let r = top; r <= bottom; r++) {
            const row: BlockCell[] = [];
            for (let cCol = left; cCol <= right; cCol++) {
                const a = cellAt(ui.selection.trackId, cCol, r);
                row.push(a ? { agentId: a.agentId, activityId: a.activityId, resourceId: a.resourceId } : null);
            }
            block.push(row);
        }
        setUI({ clipboard: block });
    };

    const paste = () => {
        if (!ui.selection || !ui.clipboard) return;
        const { top, left } = norm(ui.selection);
        dispatch({ type: 'PASTE', trackId: ui.selection.trackId, top, left, block: ui.clipboard });
    };

    const clear = () => {
        if (!ui.selection) return;
        const { top, bottom, left, right } = norm(ui.selection);
        const cells = [];
        for (let r = top; r <= bottom; r++)
            for (let cCol = left; cCol <= right; cCol++)
                cells.push({ trackId: ui.selection.trackId, slotIndex: r, dayIndex: cCol });
        dispatch({ type: 'CLEAR_CELLS', cells });
    };

    return { copy, paste, clear, hasClipboard: !!ui.clipboard };
}
