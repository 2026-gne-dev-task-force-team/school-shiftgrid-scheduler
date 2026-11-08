/**
 * contentEditable 캐럿 도우미 — 편집 중 블록은 글자 한 덩이(순수 텍스트)라 캐럿 위치가 간단하다.
 *   ⛔ core 아님(DOM 을 만진다) — 뷰 전용.
 */

/** 캐럿이 글자 맨 앞인가(선택 없이). */
export function caretAtStart(el: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length === 0;
}

/** 캐럿이 글자 맨 끝인가(선택 없이). */
export function caretAtEnd(el: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const post = r.cloneRange();
    post.selectNodeContents(el);
    post.setStart(r.startContainer, r.startOffset);
    return post.toString().length === 0;
}

/** 캐럿의 글자 오프셋(el 안에서). */
export function caretOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
}

/** 지금 고른 범위의 시작·끝 오프셋(el 안에서). */
export function selectionRange(el: HTMLElement): { start: number; end: number } {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    return { start, end: start + r.toString().length };
}

/** el 안 offset 자리에 캐럿을 놓는다(글자 한 덩이 기준). */
export function setCaret(el: HTMLElement, offset: number): void {
    const node = el.firstChild;
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    if (node && node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        r.setStart(node, Math.max(0, Math.min(offset, len)));
    } else {
        r.setStart(el, 0);
    }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
}

/** el 안 [start,end) 를 고른다. */
export function setSelection(el: HTMLElement, start: number, end: number): void {
    const node = el.firstChild;
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    if (node && node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        r.setStart(node, Math.max(0, Math.min(start, len)));
        r.setEnd(node, Math.max(0, Math.min(end, len)));
    } else {
        r.selectNodeContents(el);
    }
    sel.removeAllRanges();
    sel.addRange(r);
}
