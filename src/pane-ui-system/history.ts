/**
 * 되돌리기/다시하기 공용 더미 — 값 스냅샷을 과거·미래로 쌓는 순수 함수. ⛔ 도메인 개념 없음.
 *   🔴 「지금 값」은 더미가 안 쥔다 — 쓰는 쪽이 들고 있다가 undo/redo 때 넘긴다
 *      (되돌리기에 안 쌓는 변경 — 접힘 같은 것 — 이 섞여도 「지금」이 낡지 않는다).
 *   ⭐ 범위는 쓰는 쪽마다 따로다 — 앱 전체에 더미 하나를 두지 않는다(페이지 ⌘Z 가 탐색기를 되돌리면 안 된다).
 *   역연산으로 되돌리는 곳(표 편집기 inverseTx)은 이 더미를 안 쓴다 — 그건 도메인 지식이다.
 */
import { isMod, isMacPlatform } from './platform-keys';
export interface History<T> { past: T[]; future: T[] }

export function emptyHistory<T>(): History<T> {
    return { past: [], future: [] };
}

/** 바꾸기 직전 값(prev)을 과거에 쌓고 미래를 비운다(최대 limit). */
export function record<T>(h: History<T>, prev: T, limit = 100): History<T> {
    return { past: [...h.past, prev].slice(-limit), future: [] };
}

export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }

/** 되돌리기 — 과거의 맨 뒤를 꺼내고 지금(current)을 미래에. 과거가 비면 null. */
export function undo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
    if (h.past.length === 0) return null;
    return { value: h.past[h.past.length - 1], history: { past: h.past.slice(0, -1), future: [current, ...h.future] } };
}

/** 다시하기 — 미래의 맨 앞을 꺼내고 지금(current)을 과거에. 미래가 비면 null. */
export function redo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
    if (h.future.length === 0) return null;
    return { value: h.future[0], history: { past: [...h.past, current], future: h.future.slice(1) } };
}

/**
 * 키 → 되돌리기/다시하기 판정. ⌘/Ctrl+Z · ⇧⌘/Ctrl+Shift+Z · Ctrl+Y. 한글 조합 중이면 null.
 *   ⭐ 「어느 창의 더미인가」는 DOM 이 정한다 — 각 뷰가 자기 영역의 onKeyDown 에서 이걸 부른다(초점 있는 뷰만 받는다).
 */
/** 글자 단축키용 키 — e.key 가 라틴 한 글자면 그대로(드보락 등 배열 존중), 아니면(한글 자모 등) e.code 의 KeyX 로 대신한다. */
export function latinKey(e: { key: string; code?: string }): string {
    if (/^[a-zA-Z]$/.test(e.key)) return e.key.toLowerCase();
    const m = e.code ? /^Key([A-Z])$/.exec(e.code) : null;
    return m ? m[1].toLowerCase() : e.key.toLowerCase();
}

export function undoKey(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey?: boolean; isComposing?: boolean }): 'undo' | 'redo' | null {
    if (e.isComposing || e.altKey || !isMod(e)) return null;
    const k = latinKey(e);
    if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (k === 'y' && !e.shiftKey && !isMacPlatform()) return 'redo';   // Ctrl+Y 는 윈도우 관례 — 맥은 ⌘⇧Z
    return null;
}
