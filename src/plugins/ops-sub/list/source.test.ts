// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { absentLabel, localSlotSource, type SubSlotRow } from './index';

const KEY = 'plugin.ops-sub.part.test';
const mk = (id: string, name = '가나다'): SubSlotRow => ({
    id, projectId: 'p1', date: '2026-11-12', trackName: '1-1', startMin: 540, endMin: 580, status: '대기', createdAt: 'a', updatedAt: 'a',
    body: { absentRef: 'homeroom:1-1', absentName: name, registeredByName: '가짜올림', registeredBy: 'u-up', label: '', subject: null, reason: '연수', memo: '', allDay: false, preApproved: false },
    take: null,
});
afterEach(() => localStorage.clear());

describe('보결 영속 창구', () => {
    it('저장이 없으면 seed 를 쓰고, 올린 줄은 창구를 새로 만들어도 남는다', async () => {
        expect((await localSlotSource(() => [mk('seed')], KEY).loadSlots('2026-11-12')).map((r) => r.id)).toEqual(['seed']);
        const a = localSlotSource(() => [mk('seed')], KEY);
        await a.saveSlot({ ...mk('new'), trackName: '2-1' });
        const b = localSlotSource(() => [mk('seed')], KEY); // 새로고침
        expect((await b.loadSlots('2026-11-12')).map((r) => r.id).sort()).toEqual(['new', 'seed']);
    });
    it('지운 줄은 seed 가 되살리지 않는다', async () => {
        const a = localSlotSource(() => [mk('seed')], KEY);
        await a.deleteSlot(mk('seed'));
        expect(await localSlotSource(() => [mk('seed')], KEY).loadSlots('2026-11-12')).toEqual([]);
    });
    it('값이 깨졌거나 저장소가 막혀도 던지지 않고 seed 로 돌아간다', async () => {
        localStorage.setItem(KEY, '{깨짐');
        expect((await localSlotSource(() => [mk('seed')], KEY).loadSlots('2026-11-12')).length).toBe(1);
        localStorage.setItem(KEY, '{"a":1}');
        expect((await localSlotSource(() => [mk('seed')], KEY).loadSlots('2026-11-12')).length).toBe(1);
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new Error('막힘'); };
        try { expect((await localSlotSource(() => [mk('seed')], KEY).saveSlot(mk('x'))).ok).toBe(true); } finally { Storage.prototype.setItem = orig; }
    });
});

describe('빠지는 사람 이름', () => {
    it('비었거나 id 그대로면 「알 수 없음」, 이름은 그대로', () => {
        expect(absentLabel({ absentName: '', absentRef: 'agent-s1' })).toBe('알 수 없음');
        expect(absentLabel({ absentName: 'agent-s1', absentRef: 'agent-s1' })).toBe('알 수 없음');
        expect(absentLabel({ absentName: '가나다', absentRef: 'agent-s1' })).toBe('가나다');
    });
});
