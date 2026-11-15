// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { addDay, applyAuxOps } from './ops';
import { demoAux, demoLessons, localAuxSource } from './source';

beforeEach(() => { localStorage.clear(); });

describe('localAuxSource — 다시 만들어도 값이 남는다', () => {
    it('날짜별 배정을 저장한 뒤 창구를 새로 만들어도 남는다', async () => {
        const a = localAuxSource(demoAux);
        const day = { id: 'd1', staffId: 's1', date: '2026-11-19', startMin: 540, endMin: 580, classKey: '1-1', source: 'manual' as const };
        const out = applyAuxOps({ userId: 'u', role: '근태담당' }, await a.load(), [addDay(day)], demoLessons);
        expect(out.errors).toEqual([]);
        await a.save(out.next);
        const b = localAuxSource(demoAux);
        expect((await b.load()).day.map((d) => d.id)).toEqual(['d1']);
    });
    it('저장된 값이 없거나 깨졌으면 seed, 던지지 않는다', async () => {
        expect((await localAuxSource(demoAux).load()).staff).toHaveLength(2);
        localStorage.setItem('plugin.ops-aux.part', '{깨짐');
        expect((await localAuxSource(demoAux).load()).staff).toHaveLength(2);
    });
});
