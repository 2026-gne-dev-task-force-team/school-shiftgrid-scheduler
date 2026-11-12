import { describe, it, expect } from 'vitest';
import { replay, type Op } from './replay';

type It = { id: string; v?: unknown; a?: number; b?: number };
const keyOf = (_l: string, it: unknown) => (it as It).id;
const S = () => ({ fixed: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }] as unknown[] });

describe('replay 412 조작 재생', () => {
    it('add: 열쇠 없으면 넣는다', () => {
        const r = replay(S(), [{ op: 'add', list: 'fixed', key: 'c', item: { id: 'c' } }], keyOf);
        expect(r.result.fixed).toHaveLength(3);
        expect(r.applied).toHaveLength(1);
    });
    it('add: 열쇠 있으면 건너뜀', () => {
        const r = replay(S(), [{ op: 'add', list: 'fixed', key: 'a', item: { id: 'a', v: 9 } }], keyOf);
        expect(r.result.fixed).toEqual(S().fixed);
        expect(r.skipped).toHaveLength(1);
    });
    it('del: 없으면 건너뜀', () => {
        const r = replay(S(), [{ op: 'del', list: 'fixed', key: 'zz' }], keyOf);
        expect(r.skipped).toHaveLength(1);
        expect(r.result.fixed).toHaveLength(2);
    });
    it('del: 있으면 지운다', () => {
        const r = replay(S(), [{ op: 'del', list: 'fixed', key: 'a' }], keyOf);
        expect(r.result.fixed).toEqual([{ id: 'b', v: 2 }]);
        expect(r.applied).toHaveLength(1);
    });
    it('set: 항목 = base 면 입힌다', () => {
        const r = replay(S(), [{ op: 'set', list: 'fixed', key: 'a', base: { id: 'a', v: 1 }, item: { id: 'a', v: 5 } }], keyOf);
        expect(r.result.fixed[0]).toEqual({ id: 'a', v: 5 });
        expect(r.conflicts).toHaveLength(0);
    });
    it('set: 항목 ≠ base 면 충돌(서버 값 동봉)', () => {
        const r = replay(S(), [{ op: 'set', list: 'fixed', key: 'a', base: { id: 'a', v: 0 }, item: { id: 'a', v: 5 } }], keyOf);
        expect(r.conflicts).toHaveLength(1);
        expect(r.conflicts[0].server).toEqual({ id: 'a', v: 1 });
        expect(r.result.fixed[0]).toEqual({ id: 'a', v: 1 });
    });
    it('set: 지워졌으면 충돌(서버 값 없음)', () => {
        const r = replay(S(), [{ op: 'set', list: 'fixed', key: 'q', base: { id: 'q' }, item: { id: 'q', v: 1 } }], keyOf);
        expect(r.conflicts).toHaveLength(1);
        expect(r.conflicts[0].server).toBeUndefined();
    });
    it('충돌 뒤 남은 조작은 pending', () => {
        const ops: Op[] = [
            { op: 'set', list: 'fixed', key: 'a', base: { id: 'a', v: 0 }, item: { id: 'a', v: 5 } },
            { op: 'add', list: 'fixed', key: 'c', item: { id: 'c' } },
            { op: 'del', list: 'fixed', key: 'b' },
        ];
        const r = replay(S(), ops, keyOf);
        expect(r.pending).toEqual(ops.slice(1));
        expect(r.applied).toHaveLength(0);
        expect(r.result.fixed).toEqual(S().fixed);
    });
    it('충돌 앞 조작은 적용된다', () => {
        const ops: Op[] = [
            { op: 'del', list: 'fixed', key: 'b' },
            { op: 'set', list: 'fixed', key: 'a', base: { id: 'a', v: 0 }, item: { id: 'a', v: 5 } },
        ];
        const r = replay(S(), ops, keyOf);
        expect(r.applied).toHaveLength(1);
        expect(r.result.fixed).toEqual([{ id: 'a', v: 1 }]);
    });
    it('서버 입력은 바뀌지 않는다', () => {
        const s = S();
        const snap = JSON.stringify(s);
        replay(s, [
            { op: 'add', list: 'fixed', key: 'c', item: { id: 'c' } },
            { op: 'del', list: 'fixed', key: 'a' },
            { op: 'set', list: 'fixed', key: 'b', base: { id: 'b', v: 2 }, item: { id: 'b', v: 7 } },
        ], keyOf);
        expect(JSON.stringify(s)).toBe(snap);
    });
    it('키 순서만 다른 base 는 같다', () => {
        const s = { rooms: [{ id: 'r', a: 1, b: 2 }] as unknown[] };
        const r = replay(s, [{ op: 'set', list: 'rooms', key: 'r', base: { b: 2, a: 1, id: 'r' }, item: { id: 'r', a: 9 } }], keyOf);
        expect(r.conflicts).toHaveLength(0);
        expect(r.result.rooms[0]).toEqual({ id: 'r', a: 9 });
    });
    it('여러 list 섞임', () => {
        const s = { fixed: [{ id: 'a' }] as unknown[], rooms: [{ id: 'a', v: 1 }] as unknown[] };
        const r = replay(s, [
            { op: 'add', list: 'aux', key: 'a', item: { id: 'a' } },
            { op: 'del', list: 'fixed', key: 'a' },
            { op: 'set', list: 'rooms', key: 'a', base: { id: 'a', v: 1 }, item: { id: 'a', v: 2 } },
        ], keyOf);
        expect(r.result).toEqual({ fixed: [], rooms: [{ id: 'a', v: 2 }], aux: [{ id: 'a' }] });
        expect(r.applied).toHaveLength(3);
    });
});
