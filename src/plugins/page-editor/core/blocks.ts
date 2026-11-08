/**
 * 🔴 블록 편집 — 전부 순수 함수(Page 를 받아 새 Page 를 돌려준다 · 테스트로 박는다).
 *   키 동작(Enter·Backspace·Tab)의 「무엇을 하나」가 여기 산다. 뷰는 캐럿만 챙기고 이 함수들을 부른다.
 */
import type { Block, BlockType, Page, TableBlockData } from './types';
import { emptyBlock, emptyTable, isList, newId } from './types';
// 🔴 import type 만 — table 약속 타입은 표 편집기 꾸러미 contracts 에서(값 아님, 구조 검사 d·g).
import type { TableTx } from '../../table-editor/contracts/table';

/** 편집 뒤 캐럿을 어디에 둘지 — 뷰가 이걸 보고 포커스를 옮긴다. */
export interface EditResult {
    page: Page;
    focusId: string;
    offset: number;
}

function indexOf(page: Page, id: string): number {
    return page.blocks.findIndex((b) => b.id === id);
}

function replaceAt(blocks: Block[], idx: number, next: Block): Block[] {
    const copy = blocks.slice();
    copy[idx] = next;
    return copy;
}

/** 글자 바꾸기. */
export function setText(page: Page, id: string, text: string): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    return { blocks: replaceAt(page.blocks, idx, { ...page.blocks[idx], text }) };
}

/** 체크 토글(todo). */
export function setChecked(page: Page, id: string, checked: boolean): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    return { blocks: replaceAt(page.blocks, idx, { ...page.blocks[idx], checked }) };
}

/** 표 데이터 바꾸기. */
export function setTable(page: Page, id: string, table: TableBlockData): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    return { blocks: replaceAt(page.blocks, idx, { ...page.blocks[idx], table }) };
}

/**
 * 블록 종류 바꾸기(슬래시 메뉴·손잡이 메뉴). 표로 바꾸면 빈 표를 끼우고,
 *   목록을 벗어나면 들여쓰기·체크를 떼고, 구분선·표는 글자를 비운다.
 */
export function changeType(page: Page, id: string, type: BlockType): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    const cur = page.blocks[idx];
    const next: Block = { id: cur.id, type, text: cur.text };
    if (type === 'todo') next.checked = cur.checked ?? false;
    if (isList(type)) next.indent = cur.indent ?? 0;
    if (type === 'table') { next.text = ''; next.table = cur.table ?? emptyTable(); }
    if (type === 'divider') next.text = '';
    return { blocks: replaceAt(page.blocks, idx, next) };
}

/**
 * Enter — 캐럿 자리에서 블록을 가른다. 목록이면 같은 종류로 이어지고(들여쓰기 유지),
 *   그 밖은 새 문단. (명세 요구 6)
 */
export function splitBlock(page: Page, id: string, offset: number): EditResult {
    const idx = indexOf(page, id);
    if (idx < 0) return { page, focusId: id, offset };
    const cur = page.blocks[idx];
    const left = cur.text.slice(0, offset);
    const right = cur.text.slice(offset);

    const leftBlock: Block = { ...cur, text: left };
    let newBlock: Block;
    if (isList(cur.type)) {
        newBlock = { id: newId(), type: cur.type, text: right, indent: cur.indent ?? 0 };
        if (cur.type === 'todo') newBlock.checked = false;
    } else {
        // 제목·인용·문단에서 Enter → 새 문단(노션과 같다).
        newBlock = { id: newId(), type: 'paragraph', text: right };
    }
    const blocks = page.blocks.slice();
    blocks.splice(idx, 1, leftBlock, newBlock);
    return { page: { blocks }, focusId: newBlock.id, offset: 0 };
}

/**
 * 빈 목록 블록에서 Enter — 들여쓰여 있으면 한 단 풀고, 아니면 문단으로(명세 요구 6).
 */
export function outdentOrParagraph(page: Page, id: string): EditResult {
    const idx = indexOf(page, id);
    if (idx < 0) return { page, focusId: id, offset: 0 };
    const cur = page.blocks[idx];
    if (isList(cur.type) && (cur.indent ?? 0) > 0) {
        const next: Block = { ...cur, indent: (cur.indent ?? 0) - 1 };
        return { page: { blocks: replaceAt(page.blocks, idx, next) }, focusId: id, offset: 0 };
    }
    const next: Block = { id: cur.id, type: 'paragraph', text: '' };
    return { page: { blocks: replaceAt(page.blocks, idx, next) }, focusId: id, offset: 0 };
}

/**
 * Backspace(캐럿이 맨 앞) — 들여쓴 목록은 한 단 풀고, 꾸민 블록은 문단으로 풀고,
 *   이미 문단이면 앞 블록과 합친다(앞이 구분선이면 구분선을 지운다). (명세 요구 6)
 */
export function mergeBackspace(page: Page, id: string): EditResult {
    const idx = indexOf(page, id);
    if (idx < 0) return { page, focusId: id, offset: 0 };
    const cur = page.blocks[idx];

    // ① 들여쓴 목록 → 한 단 풀기
    if (isList(cur.type) && (cur.indent ?? 0) > 0) {
        const next: Block = { ...cur, indent: (cur.indent ?? 0) - 1 };
        return { page: { blocks: replaceAt(page.blocks, idx, next) }, focusId: id, offset: 0 };
    }
    // ② 꾸민 블록(문단 아님) → 종류 풀기
    if (cur.type !== 'paragraph') {
        const next: Block = { id: cur.id, type: 'paragraph', text: cur.text };
        return { page: { blocks: replaceAt(page.blocks, idx, next) }, focusId: id, offset: 0 };
    }
    // ③ 문단 — 맨 위면 그대로
    if (idx === 0) return { page, focusId: id, offset: 0 };
    const prev = page.blocks[idx - 1];

    // 앞이 구분선 → 구분선만 지운다(이 블록은 남는다)
    if (prev.type === 'divider') {
        const blocks = page.blocks.slice();
        blocks.splice(idx - 1, 1);
        return { page: { blocks }, focusId: cur.id, offset: 0 };
    }
    // 앞이 표 → 합치지 않는다(그대로)
    if (prev.type === 'table') return { page, focusId: cur.id, offset: 0 };

    // 앞 글자 블록과 합친다
    const mergeOffset = prev.text.length;
    const mergedPrev: Block = { ...prev, text: prev.text + cur.text };
    const blocks = page.blocks.slice();
    blocks.splice(idx - 1, 2, mergedPrev);
    return { page: { blocks }, focusId: prev.id, offset: mergeOffset };
}

/** Tab/⇧Tab — 목록만 들여쓰기(명세 요구 6). 목록 아니면 그대로. */
export function indentBlock(page: Page, id: string, dir: 'in' | 'out'): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    const cur = page.blocks[idx];
    if (!isList(cur.type)) return page;
    const level = cur.indent ?? 0;
    const next = dir === 'in' ? Math.min(level + 1, 8) : Math.max(level - 1, 0);
    if (next === level) return page;
    return { blocks: replaceAt(page.blocks, idx, { ...cur, indent: next }) };
}

/** 블록 순서 바꾸기(손잡이 끌기 · 명세 요구 8). */
export function moveBlock(page: Page, id: string, toIndex: number): Page {
    const idx = indexOf(page, id);
    if (idx < 0) return page;
    const blocks = page.blocks.slice();
    const [b] = blocks.splice(idx, 1);
    const clamped = Math.max(0, Math.min(toIndex, blocks.length));
    blocks.splice(clamped, 0, b);
    return { blocks };
}

/** 블록 하나 지우기(손잡이 메뉴 · 명세 요구 8) — 다 지우면 빈 문단 하나를 남긴다. */
export function removeBlock(page: Page, id: string): EditResult {
    const idx = indexOf(page, id);
    if (idx < 0) return { page, focusId: id, offset: 0 };
    const blocks = page.blocks.slice();
    blocks.splice(idx, 1);
    if (blocks.length === 0) {
        const b = emptyBlock();
        return { page: { blocks: [b] }, focusId: b.id, offset: 0 };
    }
    const focus = blocks[Math.max(0, idx - 1)];
    return { page: { blocks }, focusId: focus.id, offset: focus.text.length };
}

/** 지정 블록 뒤에 새 블록을 끼운다. */
export function insertAfter(page: Page, id: string, block: Block): EditResult {
    const idx = indexOf(page, id);
    const at = idx < 0 ? page.blocks.length : idx + 1;
    const blocks = page.blocks.slice();
    blocks.splice(at, 0, block);
    return { page: { blocks }, focusId: block.id, offset: 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// 표 트랜잭션 적용 — table 약속의 TableTx 를 표 블록 데이터에 반영(명세 요구 7)
//   표 연습장(PlaygroundView)의 apply 와 같은 규칙이지만 표 블록 데이터(열=key/title) 전용.
// ──────────────────────────────────────────────────────────────────────────
export function applyTableTx(table: TableBlockData, tx: TableTx): TableBlockData {
    let rows = table.rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    let cols = table.columns.map((c) => ({ ...c }));

    for (const c of tx.cells) { const row = rows.find((r) => r.id === c.rowId); if (row) row.cells[c.key] = c.value; }
    if (tx.rows?.remove) rows = rows.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) {
        const list = a.cells ?? Array.from({ length: a.count }, () => ({} as Record<string, string>));
        const ins = list.map((cells, i) => ({ id: a.ids?.[i] ?? newId('r'), cells: { ...cells } }));
        rows.splice(a.at, 0, ...ins);
    }
    for (const m of tx.rows?.move ?? []) {
        const i = rows.findIndex((r) => r.id === m.id);
        if (i >= 0) { const [row] = rows.splice(i, 1); rows.splice(Math.min(m.to, rows.length), 0, row); }
    }
    for (const a of tx.cols?.add ?? []) cols.splice(a.at, 0, { key: a.key, title: a.title });
    if (tx.cols?.remove) cols = cols.filter((c) => !tx.cols!.remove!.includes(c.key));
    for (const rn of tx.cols?.rename ?? []) { const col = cols.find((c) => c.key === rn.key); if (col) col.title = rn.title; }
    for (const rz of tx.cols?.resize ?? []) { const col = cols.find((c) => c.key === rz.key); if (col) col.width = rz.width; }

    return { columns: cols, rows };
}
