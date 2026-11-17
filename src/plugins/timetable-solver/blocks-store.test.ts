import { describe, it, expect } from 'vitest';
import { BLOCKS_KEY, loadBlocks, normalizeBlocks, removeBlock, saveBlocks, upsertBlock } from './blocks-store';
import type { SolverBlockRow } from './contracts/solver';

const mem = () => {
    const m = new Map<string, unknown>();
    return {
        storage: {
            get: (k: string, fb: unknown) => (m.has(k) ? m.get(k) : fb),
            set: (k: string, v: unknown) => { m.set(k, v); },
        },
    } as never;
};
const ok: SolverBlockRow = { id: 'a', name: '월 1교시', weekday: 1, slotIndex: 0, targets: [{ kind: 'track', id: 'c1' }], soft: true };

describe('편성 막힘 저장', () => {
    it('저장하고 다시 읽으면 같다', () => {
        const h = mem();
        saveBlocks(h, [ok]);
        expect(loadBlocks(h)).toEqual([ok]);
    });
    it('깨진 줄은 조용히 빠진다(요일 밖·대상 없음·종류 모름·id 중복)', () => {
        const bad = [
            { ...ok, id: 'w', weekday: 8 }, { ...ok, id: 'n', targets: [] },
            { ...ok, id: 'k', targets: [{ kind: 'x', id: 'q' }] }, ok, { ...ok, name: '중복' }, 7, null,
        ];
        expect(normalizeBlocks(bad)).toEqual([ok]);
        expect(normalizeBlocks('글')).toEqual([]);
    });
    it('시각 모양이 틀린 from 은 버린다', () => {
        expect(normalizeBlocks([{ ...ok, from: '9시', to: '10:00' }])[0]).toMatchObject({ to: '10:00' });
        expect(normalizeBlocks([{ ...ok, from: '9시' }])[0].from).toBeUndefined();
    });
    it('upsert 는 같은 id 를 바꾸고 remove 는 뺀다', () => {
        const a = upsertBlock([ok], { ...ok, name: '바뀜' });
        expect(a).toHaveLength(1);
        expect(a[0].name).toBe('바뀜');
        expect(removeBlock(a, 'a')).toEqual([]);
    });
    it('저장 키는 고정', () => expect(BLOCKS_KEY).toBe('blocks'));
});
