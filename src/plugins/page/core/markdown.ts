/**
 * 🔴 마크다운 — 순수 함수만. 줄 앞 단축 변환 · 인라인 서식 파싱/토글 · 페이지↔마크다운 왕복.
 *   ⛔ DOM 없음. 뷰는 이 결과를 그린다.
 */
import type { Block, BlockType, Page, TableBlockData } from './types';
import { newId } from './types';

/** 줄 앞 단축 입력 한 벌 — 줄 앞에 이 글자를 치면 그 블록으로 바뀐다. */
export interface BlockShortcut {
    type: BlockType;
    /** 접두사를 떼고 남는 글자. */
    rest: string;
    /** todo 일 때 체크 여부. */
    checked?: boolean;
}

/**
 * 줄 앞 단축 변환을 가려낸다 — 노션과 같은 동작(명세 요구 3).
 *   `# ` `## ` `### ` · `- ` `* ` · `1. ` · `[] ` `[x] ` · `> ` · ``` · `---`
 *   못 맞으면 null(그대로 문단).
 */
export function detectBlockShortcut(text: string): BlockShortcut | null {
    // 구분선·코드는 접두사가 아니라 「그 줄 전체」가 신호다.
    if (text === '---' || text === '***' || text === '___') return { type: 'divider', rest: '' };
    if (text === '```') return { type: 'code', rest: '' };

    if (text.startsWith('### ')) return { type: 'heading3', rest: text.slice(4) };
    if (text.startsWith('## ')) return { type: 'heading2', rest: text.slice(3) };
    if (text.startsWith('# ')) return { type: 'heading1', rest: text.slice(2) };
    if (text.startsWith('> ')) return { type: 'quote', rest: text.slice(2) };

    // 체크: `[] ` `[ ] ` `[x] `
    const todo = /^\[([ xX]?)\]\s(.*)$/.exec(text);
    if (todo) return { type: 'todo', rest: todo[2], checked: todo[1].toLowerCase() === 'x' };

    if (text.startsWith('- ') || text.startsWith('* ')) return { type: 'bulleted', rest: text.slice(2) };

    const num = /^\d+\.\s(.*)$/.exec(text);
    if (num) return { type: 'numbered', rest: num[1] };

    return null;
}

// ──────────────────────────────────────────────────────────────────────────
// 인라인 서식 — `**굵게**` `*기울임*` `` `코드` `` `~~취소~~` (명세 요구 4)
// ──────────────────────────────────────────────────────────────────────────

export interface InlineSpan {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strike?: boolean;
}

/** 인라인 서식 한 벌 — 종류 → 마커. 🔴 실시간 렌더·직렬화가 같은 표를 쓴다(왕복 안전). */
export type InlineKind = 'bold' | 'italic' | 'code' | 'strike';
export const INLINE_MARKERS: Record<InlineKind, string> = {
    bold: '**', italic: '*', code: '`', strike: '~~',
};

/** 한 자리에서 닫히는(= 완성된) 마커를 가려낸다. 못 맞으면 null(그 글자는 리터럴). */
function matchMarkerAt(text: string, i: number): { kind: InlineKind; inner: string; end: number } | null {
    const c = text[i]; const c2 = text[i + 1];
    // 코드가 가장 세다 — 안쪽은 전부 글자 그대로(다른 마커도 리터럴).
    if (c === '`') {
        const j = text.indexOf('`', i + 1);
        if (j > i + 1) return { kind: 'code', inner: text.slice(i + 1, j), end: j + 1 };
        return null;
    }
    if (c === '*' && c2 === '*') {
        const j = text.indexOf('**', i + 2);
        if (j > i + 2) return { kind: 'bold', inner: text.slice(i + 2, j), end: j + 2 };
        return null;
    }
    if (c === '~' && c2 === '~') {
        const j = text.indexOf('~~', i + 2);
        if (j > i + 2) return { kind: 'strike', inner: text.slice(i + 2, j), end: j + 2 };
        return null;
    }
    if (c === '*') {
        const j = text.indexOf('*', i + 1);
        if (j > i + 1) return { kind: 'italic', inner: text.slice(i + 1, j), end: j + 1 };
        return null;
    }
    return null;
}

/**
 * 인라인 마크다운을 글자 조각으로 — 🔴 실시간 렌더용. **완성된** 마커 짝만 서식으로 바꾸고,
 *   아직 안 닫힌/빈 마커(`**bold`·`` ` ``·`****`)는 글자 그대로 둔다(치는 중엔 흔하다 · 노션과 같다).
 *   ⛔ 중첩은 안 한다 — 서식 안쪽은 전부 글자 그대로다(직렬화 왕복이 글자 단위로 안전해진다).
 *   🔑 왕복 보장: serialize(parseInline(text)) === text (마커·리터럴을 소비한 그대로 되쓴다).
 */
export function parseInline(text: string): InlineSpan[] {
    const spans: InlineSpan[] = [];
    let lit = '';
    const flushLit = () => { if (lit !== '') { spans.push({ text: lit }); lit = ''; } };

    let i = 0;
    while (i < text.length) {
        const m = matchMarkerAt(text, i);
        if (m) {
            flushLit();
            const span: InlineSpan = { text: m.inner };
            span[m.kind] = true;
            spans.push(span);
            i = m.end;
        } else {
            lit += text[i];
            i += 1;
        }
    }
    flushLit();
    return spans;
}

/** 조각 하나의 서식 종류(없으면 null) — 직렬화·DOM 빌드가 쓴다. */
export function kindOf(span: InlineSpan): InlineKind | null {
    if (span.bold) return 'bold';
    if (span.italic) return 'italic';
    if (span.code) return 'code';
    if (span.strike) return 'strike';
    return null;
}

/** 조각들을 다시 마크다운 문자열로(왕복) — 서식 조각은 마커로 감싸고 리터럴은 그대로. */
export function spansToMarkdown(spans: InlineSpan[]): string {
    return spans.map((s) => {
        const k = kindOf(s);
        if (!k) return s.text;
        const mk = INLINE_MARKERS[k];
        return mk + s.text + mk;
    }).join('');
}

/** 토글 결과 — 바뀐 글자와, 안쪽 내용을 가리키는 새 선택 범위. */
export interface MarkResult { text: string; start: number; end: number; }

/**
 * 고른 범위에 인라인 마커를 씌우거나 벗긴다(⌘B/⌘I 또는 직접 입력 대체).
 *   이미 그 마커로 감싸여 있으면 벗기고, 아니면 감싼다. 새 선택은 안쪽 내용을 가리킨다.
 */
export function toggleMark(text: string, start: number, end: number, marker: string): MarkResult {
    const len = marker.length;
    const before = text.slice(0, start);
    const sel = text.slice(start, end);
    const after = text.slice(end);

    // 바깥에 마커가 바로 붙어 있나(…**[sel]**… 꼴).
    const wrappedOutside = before.endsWith(marker) && after.startsWith(marker);
    // 안쪽에 마커가 들어 있나([**sel**] 꼴).
    const wrappedInside = sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= len * 2;

    if (wrappedOutside) {
        const nb = before.slice(0, before.length - len);
        const na = after.slice(len);
        return { text: nb + sel + na, start: nb.length, end: nb.length + sel.length };
    }
    if (wrappedInside) {
        const inner = sel.slice(len, sel.length - len);
        return { text: before + inner + after, start: before.length, end: before.length + inner.length };
    }
    const wrapped = marker + sel + marker;
    return { text: before + wrapped + after, start: start + len, end: start + len + sel.length };
}

// ──────────────────────────────────────────────────────────────────────────
// 페이지 → 마크다운 (명세 요구 9 · 표는 GFM)
// ──────────────────────────────────────────────────────────────────────────

const INDENT = '  ';

function tableToGfm(t: TableBlockData): string {
    const head = `| ${t.columns.map((c) => c.title).join(' | ')} |`;
    const sep = `| ${t.columns.map(() => '---').join(' | ')} |`;
    const body = t.rows.map((r) => `| ${t.columns.map((c) => (r.cells[c.key] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
    return [head, sep, ...body].join('\n');
}

/** 블록 하나를 마크다운 줄(들)로. */
export function blockToMarkdown(b: Block, numberInRun = 1): string {
    const pad = INDENT.repeat(b.indent ?? 0);
    switch (b.type) {
        case 'heading1': return `# ${b.text}`;
        case 'heading2': return `## ${b.text}`;
        case 'heading3': return `### ${b.text}`;
        case 'bulleted': return `${pad}- ${b.text}`;
        case 'numbered': return `${pad}${numberInRun}. ${b.text}`;
        case 'todo': return `${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`;
        case 'quote': return `> ${b.text}`;
        case 'code': return `\`\`\`\n${b.text}\n\`\`\``;
        case 'divider': return '---';
        case 'node': return b.nodeId ? `[[${b.nodeId}]]` : '';
        case 'table': return b.table ? tableToGfm(b.table) : '';
        default: return b.text;
    }
}

/** 페이지 전체를 마크다운 문자열로. 번호 목록은 이어진 묶음 안에서 1,2,3… 으로 센다. */
export function exportMarkdown(page: Page): string {
    const out: string[] = [];
    let run = 0;
    for (const b of page.blocks) {
        if (b.type === 'numbered') { run += 1; } else { run = 0; }
        out.push(blockToMarkdown(b, run || 1));
    }
    return out.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// 마크다운 → 블록 (명세 요구 9 · 여러 줄 붙여넣기)
// ──────────────────────────────────────────────────────────────────────────

/** 들여쓰기(앞 공백) 깊이 — 2칸 = 한 단. */
function indentOf(line: string): number {
    const m = /^( *)/.exec(line);
    return Math.floor((m ? m[1].length : 0) / 2);
}

function isTableSep(line: string): boolean {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());
}

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    // 이스케이프된 | 는 보존.
    return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseTable(header: string, rowLines: string[]): TableBlockData {
    const titles = splitRow(header);
    const columns = titles.map((t, i) => ({ key: `c${i + 1}`, title: t }));
    const rows = rowLines.map((ln) => {
        const vals = splitRow(ln);
        const cells: Record<string, string> = {};
        columns.forEach((c, i) => { cells[c.key] = vals[i] ?? ''; });
        return { id: newId('r'), cells };
    });
    return { columns, rows };
}

/**
 * 마크다운 문자열을 블록 배열로 — 붙여넣기 경로. GFM 표는 표 블록으로.
 *   빈 줄은 블록을 가르는 구분으로만 쓰고 블록으로 남기지 않는다.
 */
export function parseMarkdown(md: string): Block[] {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') { i += 1; continue; }

        // 코드 울타리
        if (trimmed.startsWith('```')) {
            const body: string[] = [];
            i += 1;
            while (i < lines.length && lines[i].trim() !== '```') { body.push(lines[i]); i += 1; }
            if (i < lines.length) i += 1; // 닫는 ```
            blocks.push({ id: newId(), type: 'code', text: body.join('\n') });
            continue;
        }

        // GFM 표 — 이 줄에 | 가 있고 다음 줄이 구분선
        if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
            const header = line;
            i += 2;
            const rowLines: string[] = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rowLines.push(lines[i]); i += 1; }
            blocks.push({ id: newId(), type: 'table', text: '', table: parseTable(header, rowLines) });
            continue;
        }

        // 구분선
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            blocks.push({ id: newId(), type: 'divider', text: '' });
            i += 1; continue;
        }

        // GFM 체크 목록 `- [ ] ` / `- [x] ` — 내보내기가 쓰는 꼴(노션식 `[] ` 와 별개).
        const gfmTodo = /^(\s*)- \[([ xX]?)\]\s(.*)$/.exec(line);
        if (gfmTodo) {
            blocks.push({
                id: newId(), type: 'todo', text: gfmTodo[3],
                checked: gfmTodo[2].toLowerCase() === 'x', indent: Math.floor(gfmTodo[1].length / 2),
            });
            i += 1; continue;
        }

        // 줄 앞 단축(제목·목록·체크·인용) — 들여쓰기는 목록에만 의미.
        const sc = detectBlockShortcut(trimmed);
        if (sc && sc.type !== 'divider' && sc.type !== 'code') {
            const block: Block = { id: newId(), type: sc.type, text: sc.rest };
            if (sc.type === 'todo') block.checked = !!sc.checked;
            if (sc.type === 'bulleted' || sc.type === 'numbered' || sc.type === 'todo') block.indent = indentOf(line);
            blocks.push(block);
            i += 1; continue;
        }

        // 그 밖 — 문단
        blocks.push({ id: newId(), type: 'paragraph', text: trimmed });
        i += 1;
    }

    if (blocks.length === 0) blocks.push({ id: newId(), type: 'paragraph', text: '' });
    return blocks;
}
