/**
 * 🔴 되돌리기/다시하기 — 블록 단위(명세 요구 10). 순수 함수 · 값 스냅샷을 쌓는다.
 *   past[] ← present → future[]. commit 은 future 를 버린다(새 가지).
 *   더미 자체는 창틀 공용(pane-ui-system/history) — 여기는 「지금 값(present)」을 같이 드는 얇은 겉감이다.
 */
import { record, undo as undoSnap, redo as redoSnap, canUndo as canUndoSnap, canRedo as canRedoSnap } from '../../../pane-ui-system';

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
    return { ...record(h, h.present, h.limit), present: next, limit: h.limit };
}

export function canUndo<T>(h: History<T>): boolean { return canUndoSnap(h); }
export function canRedo<T>(h: History<T>): boolean { return canRedoSnap(h); }

export function undo<T>(h: History<T>): History<T> {
    const r = undoSnap(h, h.present);
    return r ? { ...r.history, present: r.value, limit: h.limit } : h;
}

export function redo<T>(h: History<T>): History<T> {
    const r = redoSnap(h, h.present);
    return r ? { ...r.history, present: r.value, limit: h.limit } : h;
}
