/**
 * 여러 개 고르기(멀티 셀렉트) 순수 계산 — Shift 범위·Ctrl/⌘ 토글(쥔님 2026-11-02 *"쉬프트 컨트롤 알지?"*).
 *   🔴 React·DOM·tree 0 — 「지금 고른 것」과 「보이는 줄 순서(flatten 결과 id 배열)」만 받아 새 선택을 돌려준다.
 *   store 가 이 결과를 selectedIds·anchorId·selectedId(=focus)로 편다. 조상-자손 정리(topmostOnly)는 tree 를 보니 model/tree.ts 에 있다.
 */

export interface Selection {
    /** 고른 것 전부 — 명령 대상. */
    ids: string[];
    /** Shift 범위의 기준(맨 클릭·토글이 옮긴다). */
    anchorId: string | null;
    /** 키보드 커서(포커스 링) — store 의 selectedId 가 이것이다. */
    focusId: string | null;
}

export const emptySelection = (): Selection => ({ ids: [], anchorId: null, focusId: null });

/** 한 개만 고른 상태(맨 클릭·화살표). */
export const single = (id: string | null): Selection =>
    id ? { ids: [id], anchorId: id, focusId: id } : emptySelection();

/**
 * 누르기 한 번을 선택에 반영 — rowsOrder 는 「보이는 줄」 id 순서(flatten 결과).
 *   - 맨 클릭(수식어 없음): 하나만 — 그 줄이 anchor·focus.
 *   - Ctrl/⌘+클릭: 토글 — 있으면 빼고 없으면 더한다. 누른 줄이 새 anchor, focus 는 더하면 그 줄·빼면 남은 마지막.
 *   - Shift+클릭: anchor~누른 줄을 rowsOrder 순서로 범위 선택(anchor 유지 · 없으면 누른 줄이 anchor).
 */
export function applyClick(
    sel: Selection,
    rowsOrder: string[],
    id: string,
    mods: { ctrl?: boolean; shift?: boolean },
): Selection {
    if (mods.shift) {
        const anchor = sel.anchorId && rowsOrder.includes(sel.anchorId) ? sel.anchorId : id;
        const ai = rowsOrder.indexOf(anchor);
        const bi = rowsOrder.indexOf(id);
        if (ai < 0 || bi < 0) return single(id);
        const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai];
        return { ids: rowsOrder.slice(lo, hi + 1), anchorId: anchor, focusId: id };
    }
    if (mods.ctrl) {
        const has = sel.ids.includes(id);
        const ids = has ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
        if (ids.length === 0) return emptySelection();
        return { ids, anchorId: id, focusId: has ? ids[ids.length - 1] : id };
    }
    return single(id);
}

/** 보이는 줄 전부(Ctrl/⌘+A). 비면 그대로 빈 선택. */
export function selectAll(rowsOrder: string[]): Selection {
    if (rowsOrder.length === 0) return emptySelection();
    return { ids: [...rowsOrder], anchorId: rowsOrder[0], focusId: rowsOrder[rowsOrder.length - 1] };
}
