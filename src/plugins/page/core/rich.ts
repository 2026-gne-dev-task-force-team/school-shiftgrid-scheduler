/**
 * 🔴 리치 글자 — 순수 함수만(⛔ DOM 없음). 시트 칸·짧은 글 한 토막에 쓰는 「작은 마크다운 + 노드 토큰」.
 *   저장은 글자 그대로다 — 이 파서는 그리기만 바꾼다(TSV 복사·되돌리기·병합이 글자 그대로 돈다).
 *   범위(쥔님 11-10 확정): 굵게 `**a**` · 기울임 `*a*` · 취소선 `~~a~~` · 줄바꿈 · 링크 `[글](https://…)` · 글자색 `[글]{.색}`.
 *     ⛔ 목록·제목 없음(칸이 좁다). 노드 칩 = `⟦node:<id>⟧`(id 로 가리켜 이름이 바뀌어도 따라간다).
 *   깨진 문법(닫는 표시 없음·모르는 색·안전하지 않은 링크)은 글자 그대로 둔다 — 잃는 글자 0.
 */

/** 글자색 이름 — 토큰 색만(하드코딩 색 ⛔). 뷰가 text-<이름> 클래스로 그린다. */
export const RICH_COLORS = ['accent', 'ok', 'bad', 'warn', 'muted'] as const;
export type RichColor = typeof RICH_COLORS[number];

export type RichNode =
    | { t: 'text'; s: string }
    | { t: 'br' }
    | { t: 'node'; id: string }
    | { t: 'b' | 'i' | 's'; c: RichNode[] }
    | { t: 'link'; href: string; c: RichNode[] }
    | { t: 'color'; color: RichColor; c: RichNode[] };

const TOKEN_HEAD = '⟦node:';
const TOKEN_TAIL = '⟧';
const TOKEN_RE = /⟦node:([^⟧\s]+)⟧/g;

/** 노드 하나를 가리키는 토큰 글자. */
export function nodeToken(id: string): string { return `${TOKEN_HEAD}${id}${TOKEN_TAIL}`; }

/** 글자 속 노드 id 전부(나온 차례 · 겹치면 한 번) — 「같은 사람이 같은 시각 두 곳」 검사 등이 쓴다. */
export function nodeIdsIn(text: string): string[] {
    const out: string[] = [];
    for (const m of text.matchAll(TOKEN_RE)) if (!out.includes(m[1])) out.push(m[1]);
    return out;
}

/** 서식이 하나도 없는 글자인가 — 그리는 쪽이 맨 글자 빠른 길로 갈 때. */
export function isPlain(text: string): boolean {
    return !/[*~[⟦]/.test(text);
}

/** 안전한 링크만 — 웹·메일. ⛔ javascript: 등은 글자로 둔다. */
function safeHref(href: string): boolean {
    return /^(https?:\/\/|mailto:)\S+$/i.test(href);
}

function isColor(s: string): s is RichColor {
    return (RICH_COLORS as readonly string[]).includes(s);
}

/** 짝 맞는 `]` 자리(중첩 [] 허용) — 없으면 -1. */
function closeBracket(s: string, open: number): number {
    let depth = 0;
    for (let k = open; k < s.length; k++) {
        if (s[k] === '[') depth++;
        else if (s[k] === ']' && --depth === 0) return k;
        else if (s[k] === '\n') return -1;   // 서식은 한 줄 안에서만
    }
    return -1;
}

/** 리치 글자 → 그리기 나무. */
export function parseRich(text: string): RichNode[] {
    const out: RichNode[] = [];
    let buf = '';
    const flush = () => { if (buf) { out.push({ t: 'text', s: buf }); buf = ''; } };
    const wrap = (node: RichNode, next: number): number => { flush(); out.push(node); return next; };
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '\n') { i = wrap({ t: 'br' }, i + 1); continue; }
        if (text.startsWith(TOKEN_HEAD, i)) {
            const end = text.indexOf(TOKEN_TAIL, i + TOKEN_HEAD.length);
            const id = end > 0 ? text.slice(i + TOKEN_HEAD.length, end) : '';
            if (id && !/\s/.test(id)) { i = wrap({ t: 'node', id }, end + 1); continue; }
        }
        const pair = (mark: string, t: 'b' | 's'): boolean => {
            if (!text.startsWith(mark, i)) return false;
            const end = text.indexOf(mark, i + mark.length);
            const inner = end > 0 ? text.slice(i + mark.length, end) : '';
            if (!inner.trim() || inner.includes('\n')) return false;
            i = wrap({ t, c: parseRich(inner) }, end + mark.length);
            return true;
        };
        if (pair('**', 'b') || pair('~~', 's')) continue;
        if (ch === '*' && text[i + 1] !== '*' && text[i + 1] !== ' ') {
            let end = i + 1;
            // 닫는 * — ** 의 반쪽은 건너뛴다(기울임 안의 굵게)
            while (end < text.length) {
                end = text.indexOf('*', end);
                if (end < 0) break;
                if (text[end + 1] === '*') { end += 2; continue; }
                break;
            }
            const inner = end > i ? text.slice(i + 1, end) : '';
            if (end > i && inner.trim() && !inner.includes('\n')) { i = wrap({ t: 'i', c: parseRich(inner) }, end + 1); continue; }
        }
        if (ch === '[') {
            const close = closeBracket(text, i);
            if (close > i + 1) {
                const inner = text.slice(i + 1, close);
                const link = /^\(([^)\s]+)\)/.exec(text.slice(close + 1));
                if (link && safeHref(link[1])) { i = wrap({ t: 'link', href: link[1], c: parseRich(inner) }, close + 1 + link[0].length); continue; }
                const color = /^\{\.([a-z]+)\}/.exec(text.slice(close + 1));
                if (color && isColor(color[1])) { i = wrap({ t: 'color', color: color[1], c: parseRich(inner) }, close + 1 + color[0].length); continue; }
            }
        }
        buf += ch;
        i++;
    }
    flush();
    return out;
}

/** 서식을 벗긴 읽기 글자(칩은 nameOf 로 이름, 없으면 빈칸) — 검색·툴팁·접근성 이름에 쓴다. */
export function richToPlain(text: string, nameOf: (id: string) => string | undefined = () => undefined): string {
    const walk = (ns: RichNode[]): string => ns.map((n) => {
        switch (n.t) {
            case 'text': return n.s;
            case 'br': return '\n';
            case 'node': return nameOf(n.id) ?? '';
            default: return walk(n.c);
        }
    }).join('');
    return walk(parseRich(text));
}
