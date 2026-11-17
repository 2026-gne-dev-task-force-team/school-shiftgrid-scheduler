// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addDay, applyAuxOps } from './ops';
import { demoAux, demoLessons, storageAuxSource } from './source';

const fakeStore = () => {
    const kv = new Map<string, unknown>();
    return { kv, get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); } };
};

describe('storageAuxSource — 다시 만들어도 값이 남는다(호스트 저장)', () => {
    it('날짜별 배정을 저장한 뒤 창구를 새로 만들어도 남고 · localStorage 는 안 건드린다', async () => {
        localStorage.clear();
        const store = fakeStore();
        const a = storageAuxSource(store, demoAux);
        const day = { id: 'd1', staffId: 's1', date: '2026-11-19', startMin: 540, endMin: 580, classKey: '1-1', source: 'manual' as const };
        const out = applyAuxOps({ userId: 'u', role: '근태담당' }, await a.load(), [addDay(day)], demoLessons);
        expect(out.errors).toEqual([]);
        await a.save(out.next);
        const b = storageAuxSource(store, demoAux);
        expect((await b.load()).day.map((d) => d.id)).toEqual(['d1']);
        expect(localStorage.length).toBe(0);
    });
    it('저장된 값이 없거나 깨졌으면 seed, 던지지 않는다', async () => {
        const store = fakeStore();
        expect((await storageAuxSource(store, demoAux).load()).staff).toHaveLength(2);
        store.set('part', { 깨짐: true });
        expect((await storageAuxSource(store, demoAux).load()).staff).toHaveLength(2);
    });
    it('저장하면 구독자가 다시 센다', async () => {
        const s = storageAuxSource(fakeStore(), demoAux);
        let n = 0;
        const off = s.subscribe!(() => { n++; });
        await s.save(await s.load());
        off();
        await s.save(await s.load());
        expect(n).toBe(1);
    });
});
