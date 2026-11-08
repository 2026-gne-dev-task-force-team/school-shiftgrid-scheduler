/**
 * 🔴 되돌리기/다시하기 — 블록 단위(명세 요구 10). 순수 함수 · 값 스냅샷을 쌓는다.
 *   past[] ← present → future[]. commit 은 future 를 버린다(새 가지).
 */
export interface History<T> {
    past: T[];
    present: T;
    future: T[];
    /** 너무 많이 쌓이지 않게 상한(기본 200). */
    limit: number;
}

export function initHistory<T>(present: T, limit = 200): History<T> {
    return { past: [], present, future: [], limit };
}

/** 새 상태 확정 — 지금 것을 past 로 밀고 future 를 버린다. 같은 값이면 그대로. */
export function commit<T>(h: History<T>, next: T): History<T> {
    if (next === h.present) return h;
    const past = [...h.past, h.present];
    if (past.length > h.limit) past.shift();
    return { past, present: next, future: [], limit: h.limit };
}

export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }

export function undo<T>(h: History<T>): History<T> {
    if (h.past.length === 0) return h;
    const past = h.past.slice();
    const prev = past.pop()!;
    return { past, present: prev, future: [h.present, ...h.future], limit: h.limit };
}

export function redo<T>(h: History<T>): History<T> {
    if (h.future.length === 0) return h;
    const future = h.future.slice();
    const next = future.shift()!;
    return { past: [...h.past, h.present], present: next, future, limit: h.limit };
}
