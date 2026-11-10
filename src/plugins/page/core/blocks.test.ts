/**
 * 블록 편집 — Enter(가르기·목록 이어짐·빈 목록) · Backspace(풀기·합치기) · Tab(들여쓰기) · 순서·삭제·표 tx.
 */
import { describe, it, expect } from 'vitest';
import {
    splitBlock, outdentOrParagraph, mergeBackspace, indentBlock, moveBlock, removeBlock,
    changeType, setChecked, applyTableTx, setNodeRef, removeBlocks, moveBlocks, rangeIds,
} from './blocks';
import type { Page } from './types';
import type { TableTx } from '../../sheet/contracts/table';

const page = (...blocks: Page['blocks']): Page => ({ blocks });

describe('Enter — 서식 마커 짝 보존', () => {
    const cases: [string, string][] = [['굵게', '**'], ['기울임', '*'], ['취소선', '~~'], ['코드', '`']];
    for (const [name, m] of cases) {
        it(`${name} 맨 끝 Enter — 윗줄 그대로 · 아랫줄 빈 문단`, () => {
            const t = `${m}sel${m}`;
            const r = splitBlock(page({ id: 'a', type: 'paragraph', text: t }), 'a', m.length + 3);
            expect(r.page.blocks.map((b) => b.text)).toEqual([t, '']);
        });
        it(`${name} 중간 Enter — 양쪽 다 닫힌 서식`, () => {
            const r = splitBlock(page({ id: 'a', type: 'paragraph', text: `${m}sel${m}` }), 'a', m.length + 2);
            expect(r.page.blocks.map((b) => b.text)).toEqual([`${m}se${m}`, `${m}l${m}`]);
        });
        it(`${name} 맨 앞 Enter — 서식 밖으로`, () => {
            const r = splitBlock(page({ id: 'a', type: 'paragraph', text: `x${m}sel${m}` }), 'a', 1 + m.length);
            expect(r.page.blocks.map((b) => b.text)).toEqual(['x', `${m}sel${m}`]);
        });
    }
});

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
    it('문단도 Tab=indent+1, Shift+Tab=0, 상한 8', () => {
        let p = page({ id: 'a', type: 'paragraph', text: '글' });
        p = indentBlock(p, 'a', 'in');
        expect(p.blocks[0].indent).toBe(1);
        p = indentBlock(p, 'a', 'out');
        expect(p.blocks[0].indent).toBe(0);
        expect(indentBlock(p, 'a', 'out')).toBe(p);
        for (let n = 0; n < 12; n++) p = indentBlock(p, 'a', 'in');
        expect(p.blocks[0].indent).toBe(8);
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
    it('끼워 넣기 블록 — 종류 바꾸면 글자 비고, 노드를 고르면 nodeId 가 든다', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '글' });
        const r = setNodeRef(changeType(p, 'a', 'node'), 'a', 'n1');
        expect(r.blocks[0]).toMatchObject({ type: 'node', text: '', nodeId: 'n1' });
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
});

describe('W2 노션 꼴 Backspace', () => {
    it('빈 문단 앞이 표면 빈 블록을 지우고 표 앞 글자 블록 끝으로', () => {
        const p = page(
            { id: 'a', type: 'paragraph', text: '앞글' },
            { id: 't', type: 'table', text: '' },
            { id: 'e', type: 'paragraph', text: '' },
        );
        const r = mergeBackspace(p, 'e');
        expect(r.page.blocks.map((b) => b.id)).toEqual(['a', 't']);
        expect(r.focusId).toBe('a');
        expect(r.offset).toBe(2);
    });
    it('빈 문단 앞이 글 블록이면 지우고 그 끝으로', () => {
        const p = page({ id: 'a', type: 'paragraph', text: '앞글' }, { id: 'e', type: 'paragraph', text: '' });
        const r = mergeBackspace(p, 'e');
        expect(r.page.blocks.map((b) => b.id)).toEqual(['a']);
        expect(r.offset).toBe(2);
    });
    it('글 있는 문단 앞이 표면 그대로(합치지 않는다)', () => {
        const p = page({ id: 't', type: 'table', text: '' }, { id: 'e', type: 'paragraph', text: '글' });
        expect(mergeBackspace(p, 'e').page).toBe(p);
    });
});

describe('W3 여러 블록 고르기', () => {
    const p = page(
        { id: 'a', type: 'paragraph', text: 'A' },
        { id: 'b', type: 'paragraph', text: 'B' },
        { id: 'c', type: 'paragraph', text: 'C' },
        { id: 'd', type: 'paragraph', text: 'D' },
    );
    it('rangeIds — 순서 무관 양끝 포함', () => {
        expect(rangeIds(p, 'c', 'a')).toEqual(['a', 'b', 'c']);
        expect(rangeIds(p, 'x', 'a')).toEqual([]);
    });
    it('removeBlocks — 묶어 지우고 앞 블록 끝으로', () => {
        const r = removeBlocks(p, ['b', 'c']);
        expect(r.page.blocks.map((b) => b.id)).toEqual(['a', 'd']);
        expect(r.focusId).toBe('a');
        expect(r.offset).toBe(1);
    });
    it('removeBlocks — 전부 지우면 빈 문단 하나', () => {
        const r = removeBlocks(p, ['a', 'b', 'c', 'd']);
        expect(r.page.blocks).toHaveLength(1);
        expect(r.page.blocks[0].text).toBe('');
    });
    it('moveBlocks — 묶음이 순서 그대로 slot 앞으로', () => {
        expect(moveBlocks(p, ['a', 'b'], 4).blocks.map((b) => b.id)).toEqual(['c', 'd', 'a', 'b']);
        expect(moveBlocks(p, ['c', 'd'], 0).blocks.map((b) => b.id)).toEqual(['c', 'd', 'a', 'b']);
        expect(moveBlocks(p, ['b', 'c'], 3).blocks.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);   // 제자리 → 같은 page
        expect(moveBlocks(p, ['b', 'c'], 3)).toBe(p);
    });
});

import { softBreak as _sb, duplicateBlock as _dup } from './blocks';
describe('softBreak · duplicateBlock', () => {
    const pg = { blocks: [{ id: 'a', type: 'paragraph', text: 'abcd' }, { id: 'b', type: 'todo', text: 'x', checked: true }] } as any;
    it('softBreak: 블록 수 그대로, 줄바꿈 삽입, 캐럿 +1', () => {
        const r = _sb(pg, 'a', 2);
        expect(r.page.blocks).toHaveLength(2);
        expect(r.page.blocks[0].text).toBe('ab\ncd');
        expect(r.offset).toBe(3);
    });
    it('duplicateBlock: 바로 아래 새 id 복제', () => {
        const r = _dup(pg, 'b');
        expect(r.page.blocks).toHaveLength(3);
        expect(r.page.blocks[2]).toMatchObject({ type: 'todo', text: 'x', checked: true });
        expect(r.page.blocks[2].id).not.toBe('b');
        expect(r.focusId).toBe(r.page.blocks[2].id);
    });
});
