import { describe, it, expect } from 'vitest';
import { filterUniqueChanges, findUniqueConflict, firstDuplicate, uniqueKeyOf } from './unique';

describe('Q11 W10 — 유일 판정(순수)', () => {
    it('공백·대소문자 무시 · 빈 값은 겹침 아님 · 자기 줄은 뺀다', () => {
        expect(uniqueKeyOf(' Kim ')).toBe(uniqueKeyOf('kim'));
        expect(uniqueKeyOf('  ')).toBeNull();
        const others = [{ id: 'a', value: 'kim' }, { id: 'b', value: '' }];
        expect(findUniqueConflict('KIM', others, 'c')).toBe('a');
        expect(findUniqueConflict('KIM', others, 'a')).toBeNull();
        expect(findUniqueConflict('', others, 'c')).toBeNull();
        expect(firstDuplicate(['a', '', '', 'b'])).toBeNull();
        expect(firstDuplicate(['a', 'B', ' b'])).toBe(' b');
    });
    it('묶음 안끼리도 겹치면 뒤엣것을 뺀다 · 유일 아닌 칸은 그대로', () => {
        const vals: Record<string, string> = { r1: 'x', r2: '', r3: '' };
        const { kept, rejected } = filterUniqueChanges(
            [{ id: 'r2', key: 'k', value: 'y' }, { id: 'r3', key: 'k', value: 'Y' }, { id: 'r3', key: 'o', value: 'x' }, { id: 'r2', key: 'k', value: 'x' }],
            ['r1', 'r2', 'r3'], (id) => vals[id], new Set(['k']));
        expect(kept.map((c) => `${c.id}.${c.key}`)).toEqual(['r2.k', 'r3.o']);
        expect(rejected).toHaveLength(2);
    });
});
