/**
 * contentEditable 캐럿·인라인 DOM 도우미 — 🔴 실시간 서식 렌더 전용(명세 P2 요구 1·2).
 *   ⛔ core 아님(DOM 을 만진다) — 뷰 전용. 모델은 마크다운 문자열(block.text)이고,
 *   편집 중에도 블록은 서식이 입혀진 DOM(strong/em/code/s)으로 보인다. 그래서 두 가지가 필요하다:
 *     · DOM → 마크다운 직렬화(serializeInline) · 마크다운 → DOM 빌드(buildInlineDom)
 *     · 캐럿을 **마크다운 소스 오프셋**으로 읽고/놓기(marker 를 센다 → 변환 직후엔 평문으로 이어진다)
 */
import type { InlineKind } from '../core/markdown';
import { parseInline, kindOf } from '../core/markdown';

// ── 캐럿이 글자 맨 앞/끝인가(보이는 글자 기준 · 경계는 소스와 일치한다) ──

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

// ──────────────────────────────────────────────────────────────────────────
// 인라인 DOM ↔ 마크다운
// ──────────────────────────────────────────────────────────────────────────

const TAG_FOR_KIND: Record<InlineKind, string> = { bold: 'strong', italic: 'em', code: 'code', strike: 's' };

/** 엘리먼트 태그 → 마커(직렬화). 브라우저가 B/I 로 내도 받아 준다. */
const TAG_MARKER: Record<string, string> = {
    STRONG: '**', B: '**',
    EM: '*', I: '*',
    CODE: '`',
    S: '~~', STRIKE: '~~', DEL: '~~',
};
function markerForEl(el: Element): string { return TAG_MARKER[el.tagName] ?? ''; }

function firstTextNode(el: Element): Text | null {
    const c = el.firstChild;
    return c && c.nodeType === Node.TEXT_NODE ? (c as Text) : null;
}

function serializeNode(n: Node): string {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
    if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        const mk = markerForEl(el);
        let inner = '';
        el.childNodes.forEach((c) => { inner += serializeNode(c); });
        return mk + inner + mk;
    }
    return '';
}

/** 지금 보이는 DOM(strong/em/code/s + 글자)을 마크다운 문자열로(모델에 넣을 값). */
export function serializeInline(root: HTMLElement): string {
    let out = '';
    root.childNodes.forEach((n) => { out += serializeNode(n); });
    return out;
}

/** 마크다운 문자열로 root 안을 다시 그린다(서식 입힘 · 완성된 마커만 · ⛔ React 는 손대지 않는다). */
export function buildInlineDom(root: HTMLElement, text: string): void {
    const spans = parseInline(text);
    while (root.firstChild) root.removeChild(root.firstChild);
    for (const s of spans) {
        const k = kindOf(s);
        if (!k) { root.appendChild(document.createTextNode(s.text)); continue; }
        const e = document.createElement(TAG_FOR_KIND[k]);
        e.textContent = s.text;
        if (k === 'code') e.className = 'px-1 rounded bg-text/[0.06] text-[0.9em]';
        root.appendChild(e);
    }
}

/** root 의 현재 구조가 text 를 그린 결과와 같나 — 같으면 다시 그릴 필요가 없다(캐럿 보존).
 *   🔑 빈 텍스트 노드(캐럿 홀더 · resolveCaretHost 가 끼운다)는 센 셈에서 뺀다 — 모델엔 없는 자리라 다시 그릴 신호가 아니다.
 *      (parseInline 은 빈 조각을 만들지 않으니, DOM 의 빈 텍스트 노드는 전부 홀더다.) */
export function inlineDomMatches(root: HTMLElement, text: string): boolean {
    const spans = parseInline(text);
    const nodes: Node[] = [];
    root.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '') === '') return; // 빈 홀더 무시
        nodes.push(n);
    });
    if (nodes.length !== spans.length) return false;
    for (let k = 0; k < spans.length; k++) {
        const s = spans[k]; const n = nodes[k];
        const kind = kindOf(s);
        if (!kind) {
            if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '') !== s.text) return false;
        } else {
            if (n.nodeType !== Node.ELEMENT_NODE) return false;
            if ((n as Element).tagName !== TAG_FOR_KIND[kind].toUpperCase()) return false;
            if ((n.textContent ?? '') !== s.text) return false;
        }
    }
    return true;
}

// ──────────────────────────────────────────────────────────────────────────
// 캐럿 ↔ 마크다운 소스 오프셋
//   🔑 소스 오프셋은 마커(`**`)를 포함한 자리다. 「굵게 끝(닫는 마커 앞)」과 「굵게 바깥(닫는 마커 뒤)」을
//      서로 다른 오프셋으로 구분한다 → 변환 직후엔 평문, 굵게 안쪽 끝에서는 굵게로 이어진다(노션과 같다).
// ──────────────────────────────────────────────────────────────────────────

function fullSourceLen(n: Node): number {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').length;
    if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element; const mk = markerForEl(el);
        let len = mk.length * 2;
        el.childNodes.forEach((c) => { len += fullSourceLen(c); });
        return len;
    }
    return 0;
}

/** DOM 캐럿 위치(node,offset) → 마크다운 소스 오프셋. (테스트는 node/offset 을 직접 넘긴다 · Selection 불필요) */
export function sourceOffsetAt(root: HTMLElement, node: Node, offset: number): number {
    if (node === root) {
        let c = 0;
        const kids = root.childNodes;
        for (let k = 0; k < offset && k < kids.length; k++) c += fullSourceLen(kids[k]);
        return c;
    }
    let count = 0; let done = false;
    const visit = (n: Node) => {
        if (done) return;
        if (n.nodeType === Node.TEXT_NODE) {
            if (n === node) { count += Math.max(0, Math.min(offset, (n.textContent ?? '').length)); done = true; }
            else count += (n.textContent ?? '').length;
            return;
        }
        if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as Element; const mk = markerForEl(el);
            if (n === node) {
                count += mk.length;
                const kids = el.childNodes;
                for (let k = 0; k < offset && k < kids.length; k++) count += fullSourceLen(kids[k]);
                done = true;
                return;
            }
            count += mk.length;
            const kids = el.childNodes;
            for (let k = 0; k < kids.length; k++) { visit(kids[k]); if (done) return; }
            count += mk.length; // 완전히 지나갔을 때만 닫는 마커를 센다
        }
    };
    const kids = root.childNodes;
    for (let k = 0; k < kids.length; k++) { visit(kids[k]); if (done) break; }
    return count;
}

/** 마크다운 소스 오프셋 → DOM 캐럿 위치(node,offset). (테스트는 반환값을 바로 검사 · Selection 불필요) */
export function domPosForSource(root: HTMLElement, srcOffset: number): { node: Node; offset: number } {
    let src = 0;
    const kids = root.childNodes;
    for (let k = 0; k < kids.length; k++) {
        const n = kids[k];
        if (n.nodeType === Node.TEXT_NODE) {
            const len = (n.textContent ?? '').length;
            if (srcOffset <= src + len) return { node: n, offset: srcOffset - src };
            src += len;
        } else if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as Element; const mk = markerForEl(el);
            const inner = el.textContent ?? '';
            const start = src + mk.length;
            const endInner = start + inner.length;
            const total = endInner + mk.length;
            if (srcOffset < start) {
                const tn = firstTextNode(el);
                return tn ? { node: tn, offset: 0 } : { node: root, offset: k };
            }
            if (srcOffset <= endInner) {
                const tn = firstTextNode(el);
                return tn ? { node: tn, offset: srcOffset - start } : { node: root, offset: k + 1 };
            }
            if (srcOffset <= total) {
                // 닫는 마커 뒤 → 엘리먼트 바깥(평문으로 이어진다)
                return { node: root, offset: k + 1 };
            }
            src = total;
        }
    }
    return { node: root, offset: kids.length };
}

/**
 * 🔴 서식 뒤 캐럿 홀더 — 결함 수정의 핵심.
 *   서식 엘리먼트(strong/em/code/s) 바로 뒤에 캐럿을 놓으면, 브라우저는 다음에 친 글자를 그 엘리먼트 **안으로**
 *   빨아들인다(`**it**` 변환 직후 다음 글자가 굵게가 되던 결함). 그래서 그 자리에 **빈 텍스트 노드**를 두고
 *   캐럿을 거기 놓는다 — 다음 글자는 서식 바깥 평문으로 이어진다(노션과 같다).
 *   🔑 홀더는 빈 문자열이라 serializeInline·소스 오프셋·inlineDomMatches 어디에도 안 샌다(제로폭 문자 안 쓴다).
 *   root 레벨에서 앞 형제가 엘리먼트일 때만 손댄다. 이미 텍스트 노드가 있으면 그걸 쓴다(새로 안 끼운다).
 */
export function resolveCaretHost(root: HTMLElement, node: Node, offset: number): { node: Node; offset: number } {
    if (node !== root) return { node, offset };                 // 텍스트 노드 안이면 그대로(서식 안·평문 중간)
    const prev = root.childNodes[offset - 1];
    if (!prev || prev.nodeType !== Node.ELEMENT_NODE) return { node, offset }; // 앞이 서식 아님 — 그대로
    const at = root.childNodes[offset] as Node | undefined;
    if (at && at.nodeType === Node.TEXT_NODE) return { node: at, offset: 0 };  // 이미 평문 노드가 있다
    const holder = document.createTextNode('');
    if (at) root.insertBefore(holder, at); else root.appendChild(holder);
    return { node: holder, offset: 0 };
}

// ── Selection 래퍼(실브라우저 전용 · jsdom 에선 조용히 접는다) ──

/** 지금 캐럿의 마크다운 소스 오프셋. */
export function caretSourceOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const r = sel.getRangeAt(0);
    return sourceOffsetAt(el, r.endContainer, r.endOffset);
}

/** 지금 고른 범위의 소스 오프셋(start,end). */
export function selectionSourceRange(el: HTMLElement): { start: number; end: number } {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const r = sel.getRangeAt(0);
    const a = sourceOffsetAt(el, r.startContainer, r.startOffset);
    const b = sourceOffsetAt(el, r.endContainer, r.endOffset);
    return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** 소스 오프셋 자리에 캐럿을 놓는다. 🔴 서식 뒤면 빈 홀더를 끼워 다음 글자가 평문으로 이어지게 한다. */
export function setCaretSource(el: HTMLElement, srcOffset: number): void {
    const raw = domPosForSource(el, srcOffset);
    const pos = resolveCaretHost(el, raw.node, raw.offset);
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    try { r.setStart(pos.node, pos.offset); } catch { return; }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
}

/** 소스 오프셋 [start,end] 를 고른다(⌘B 등 토글 뒤 안쪽을 다시 고르기). */
export function setSelectionSource(el: HTMLElement, start: number, end: number): void {
    const p1 = domPosForSource(el, start);
    const p2 = domPosForSource(el, end);
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    try { r.setStart(p1.node, p1.offset); r.setEnd(p2.node, p2.offset); } catch { return; }
    sel.removeAllRanges();
    sel.addRange(r);
}
