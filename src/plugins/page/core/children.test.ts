import { describe, expect, it } from 'vitest';
import { childBlockIds, syncChildBlocks } from './children';
import type { Page } from './types';

const para = (id: string, text = ''): Page['blocks'][number] => ({ id, type: 'paragraph', text });
const kid = (id: string, nodeId: string): Page['blocks'][number] => ({ id, type: 'childpage', text: '', nodeId });

describe('syncChildBlocks (Q8 하위 페이지 줄)', () => {
    it('줄 없는 자식은 맨 끝에 붙는다 · 이미 맞으면 같은 객체', () => {
        const p: Page = { blocks: [para('a', '글')] };
        const next = syncChildBlocks(p, ['c1', 'c2']);
        expect(childBlockIds(next)).toEqual(['c1', 'c2']);
        expect(next.blocks[0]).toBe(p.blocks[0]);
        expect(syncChildBlocks(next, ['c1', 'c2'])).toBe(next);
    });
    it('자식이 아니게 된 줄(옮김·휴지통)은 걷힌다 — 다른 줄은 그대로', () => {
        const p: Page = { blocks: [para('a'), kid('k1', 'c1'), para('b'), kid('k2', 'c2')] };
        const next = syncChildBlocks(p, ['c2']);
        expect(next.blocks.map((b) => b.id)).toEqual(['a', 'b', 'k2']);
    });
    it('사람이 놓은 순서(줄 위치)는 지킨다', () => {
        const p: Page = { blocks: [kid('k2', 'c2'), para('a'), kid('k1', 'c1')] };
        expect(syncChildBlocks(p, ['c1', 'c2'])).toBe(p);
    });
    it('같은 자식을 가리키는 줄이 둘이면 첫 줄만 남는다(복제 방어) · nodeId 없는 줄은 걷힌다', () => {
        const p: Page = { blocks: [kid('k1', 'c1'), kid('k1b', 'c1'), { id: 'x', type: 'childpage', text: '' }] };
        expect(syncChildBlocks(p, ['c1']).blocks.map((b) => b.id)).toEqual(['k1']);
    });
});
