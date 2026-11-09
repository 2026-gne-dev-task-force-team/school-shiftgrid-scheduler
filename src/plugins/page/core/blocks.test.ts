/**
 * 블록 편집 — Enter(가르기·목록 이어짐·빈 목록) · Backspace(풀기·합치기) · Tab(들여쓰기) · 순서·삭제·표 tx.
 */
import { describe, it, expect } from 'vitest';
import {
    splitBlock, outdentOrParagraph, mergeBackspace, indentBlock, moveBlock, removeBlock,
    changeType, setChecked, applyTableTx,
} from './blocks';
import type { Page } from './types';
import type { TableTx } from '../../sheet/contracts/table';

const page = (...blocks: Page['blocks']): Page => ({ blocks });

describe('Enter — 가르기(요구 6)', () => {
    it('문단을 캐럿에서 두 블록으로 가른다', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '가나다라' });
        const r = splitBlock(p, 'a', 2);
        expect(r.page.blocks.map((b) => b.text)).toEqual(['가나', '다라']);
        expect(r.page.blocks[1].type).toBe('paragraph');
        expect(r.focusId).toBe(r.page.blocks[1].id);
        expect(r.offset).toBe(0);
    });
    it('목록은 같은 종류로 이어진다(들여쓰기 유지)', () => {
        const p = page({ id: 'a', type: 'bulleted', text: '하나둘', indent: 2 });
        const r = splitBlock(p, 'a', 2);
        expect(r.page.blocks[1].type).toBe('bulleted');
        expect(r.page.blocks[1].indent).toBe(2);
    });
    it('제목에서 Enter 는 새 문단', () => {
        const p = page({ id: 'a', type: 'heading1', text: '제목' });
        const r = splitBlock(p, 'a', 2);
        expect(r.page.blocks[0].type).toBe('heading1');
        expect(r.page.blocks[1].type).toBe('paragraph');
    });
    it('빈 목록 Enter — 들여쓰여 있으면 한 단 풀기', () => {
        const p = page({ id: 'a', type: 'bulleted', text: '', indent: 1 });
        const r = outdentOrParagraph(p, 'a');
        expect(r.page.blocks[0].indent).toBe(0);
        expect(r.page.blocks[0].type).toBe('bulleted');
    });
    it('빈 목록 Enter — 들여쓰기 0 이면 문단으로', () => {
        const p = page({ id: 'a', type: 'bulleted', text: '', indent: 0 });
        const r = outdentOrParagraph(p, 'a');
        expect(r.page.blocks[0].type).toBe('paragraph');
    });
});

describe('Backspace(맨 앞) — 풀기·합치기(요구 6)', () => {
    it('들여쓴 목록 → 한 단 풀기', () => {
        const p = page({ id: 'a', type: 'numbered', text: '글', indent: 2 });
        const r = mergeBackspace(p, 'a');
        expect(r.page.blocks[0].indent).toBe(1);
        expect(r.page.blocks[0].type).toBe('numbered');
    });
    it('꾸민 블록(제목) → 문단으로 풀기', () => {
        const p = page({ id: 'a', type: 'heading2', text: '제목' });
        const r = mergeBackspace(p, 'a');
        expect(r.page.blocks[0].type).toBe('paragraph');
        expect(r.page.blocks[0].text).toBe('제목');
    });
    it('문단 — 앞 블록과 합친다(캐럿은 이음매)', () => {
        const p = page(
            { id: 'a', type: 'paragraph', text: '앞글' },
            { id: 'b', type: 'paragraph', text: '뒷글' },
        );
        const r = mergeBackspace(p, 'b');
        expect(r.page.blocks).toHaveLength(1);
        expect(r.page.blocks[0].text).toBe('앞글뒷글');
        expect(r.focusId).toBe('a');
        expect(r.offset).toBe(2);
    });
    it('앞이 구분선이면 구분선만 지운다', () => {
        const p = page(
            { id: 'd', type: 'divider', text: '' },
            { id: 'b', type: 'paragraph', text: '글' },
        );
        const r = mergeBackspace(p, 'b');
        expect(r.page.blocks.map((b) => b.id)).toEqual(['b']);
    });
    it('맨 위 문단은 그대로', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '글' });
        const r = mergeBackspace(p, 'a');
        expect(r.page.blocks).toHaveLength(1);
        expect(r.page.blocks[0].text).toBe('글');
    });
});

describe('Tab/⇧Tab — 목록 들여쓰기(요구 6)', () => {
    it('목록을 들여쓰고 내어쓴다', () => {
        let p = page({ id: 'a', type: 'bulleted', text: '글', indent: 0 });
        p = indentBlock(p, 'a', 'in');
        expect(p.blocks[0].indent).toBe(1);
        p = indentBlock(p, 'a', 'out');
        expect(p.blocks[0].indent).toBe(0);
    });
    it('문단은 들여쓰기가 안 먹는다(그대로)', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '글' });
        const r = indentBlock(p, 'a', 'in');
        expect(r.blocks[0].indent).toBeUndefined();
    });
});

describe('순서·삭제·종류(요구 8)', () => {
    it('블록을 끌어 순서를 바꾼다', () => {
        const p = page(
            { id: 'a', type: 'paragraph', text: '1' },
            { id: 'b', type: 'paragraph', text: '2' },
            { id: 'c', type: 'paragraph', text: '3' },
        );
        const r = moveBlock(p, 'a', 2);
        expect(r.blocks.map((b) => b.id)).toEqual(['b', 'c', 'a']);
    });
    it('블록을 지운다 — 다 지우면 빈 문단 하나가 남는다', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '하나' });
        const r = removeBlock(p, 'a');
        expect(r.page.blocks).toHaveLength(1);
        expect(r.page.blocks[0].text).toBe('');
    });
    it('종류를 표로 바꾸면 빈 표가 끼워진다', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '글' });
        const r = changeType(p, 'a', 'table');
        expect(r.blocks[0].type).toBe('table');
        expect(r.blocks[0].table?.columns.length).toBeGreaterThan(0);
        expect(r.blocks[0].text).toBe('');
    });
    it('체크 토글', () => {
        const p = page({ id: 'a', type: 'todo', text: '할 일', checked: false });
        const r = setChecked(p, 'a', true);
        expect(r.blocks[0].checked).toBe(true);
    });
});

describe('표 트랜잭션 적용(요구 7)', () => {
    const table = { columns: [{ key: 'c1', title: 'A' }, { key: 'c2', title: 'B' }], rows: [{ id: 'r1', cells: { c1: '', c2: '' } }] };
    it('칸 글자를 바꾼다', () => {
        const tx: TableTx = { cells: [{ rowId: 'r1', key: 'c1', value: '값' }], source: 'edit' };
        const r = applyTableTx(table, tx);
        expect(r.rows[0].cells.c1).toBe('값');
    });
    it('행을 더한다', () => {
        const tx: TableTx = { cells: [], rows: { add: [{ at: 1, count: 1, ids: ['r2'] }] }, source: 'menu' };
        const r = applyTableTx(table, tx);
        expect(r.rows.map((x) => x.id)).toEqual(['r1', 'r2']);
    });
});

describe('편집해도 아이콘이 남는다(요구 13)', () => {
    it('모든 블록 조작이 icon 을 지우지 않는다', () => {
        const p: Page = { icon: '📘', blocks: [{ id: 'a', type: 'paragraph', text: 'ab' }] };
        expect(changeType(p, 'a', 'heading1').icon).toBe('📘');
        expect(setChecked(p, 'a', true).icon).toBe('📘');
        expect(indentBlock(p, 'a', 'in').icon).toBe('📘');
        expect(moveBlock(p, 'a', 0).icon).toBe('📘');
        expect(splitBlock(p, 'a', 1).page.icon).toBe('📘');
        expect(mergeBackspace(p, 'a').page.icon).toBe('📘');
        expect(removeBlock(p, 'a').page.icon).toBe('📘');
    });
});
