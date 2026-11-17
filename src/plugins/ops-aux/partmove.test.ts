// @vitest-environment jsdom
/** R17 — 근태 저장 이사(localStorage → 호스트 저장): 이사 전후 같은 값 · 두 번 같음 · 새 칸에 값이 있으면 안 덮음 · 옛 값 그대로. 시험 자료는 지어낸 것. */
import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_KEY, PART_MOVED_KEY, movePartToStorage, readLegacyPart } from './partmove';
import { PART_KEY, demoAux, readStoredPart, storageAuxSource } from './source';

const fakeStore = () => {
    const kv = new Map<string, unknown>();
    return { kv, get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); } };
};
beforeEach(() => { localStorage.clear(); });

describe('근태 저장 이사(localStorage → 호스트 저장)', () => {
    it('이사 전후 같은 값 · 옛 값은 그대로 · 옮김 표시는 호스트 저장에만', async () => {
        const old = { ...demoAux(), day: [{ id: 'd1', staffId: 's1', date: '2026-11-19', startMin: 540, endMin: 580, classKey: '1-1', source: 'manual' as const }] };
        localStorage.setItem(LEGACY_KEY, JSON.stringify(old));
        const before = localStorage.getItem(LEGACY_KEY);
        const store = fakeStore();
        expect(movePartToStorage(store, localStorage)).toEqual({ moved: true, done: false });
        expect(await storageAuxSource(store, () => ({ ...demoAux(), staff: [] })).load()).toEqual(old);
        expect(localStorage.getItem(LEGACY_KEY)).toBe(before);
        expect(localStorage.length).toBe(1);
        expect(store.kv.has(PART_MOVED_KEY)).toBe(true);
    });
    it('두 번 돌려도 같다 · 새 칸에 값이 있으면 덮지 않는다', () => {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(demoAux()));
        const store = fakeStore();
        movePartToStorage(store, localStorage);
        const first = structuredClone(store.kv.get(PART_KEY));
        expect(movePartToStorage(store, localStorage)).toEqual({ moved: false, done: true });
        expect(store.kv.get(PART_KEY)).toEqual(first);

        const mine = { ...demoAux(), staff: [] };
        const s2 = fakeStore();
        s2.set(PART_KEY, mine);
        expect(movePartToStorage(s2, localStorage)).toEqual({ moved: false, done: false });
        expect(readStoredPart(s2)).toEqual(mine);
    });
    it('옛 값이 없거나 깨졌으면 아무것도 안 옮기고 표시만 · 던지지 않는다', () => {
        const store = fakeStore();
        expect(movePartToStorage(store, localStorage).moved).toBe(false);
        expect(store.kv.has(PART_KEY)).toBe(false);
        expect(store.kv.has(PART_MOVED_KEY)).toBe(true);
        localStorage.setItem(LEGACY_KEY, '{깨짐');
        expect(readLegacyPart(localStorage)).toBeNull();
        expect(movePartToStorage(fakeStore(), localStorage).moved).toBe(false);
    });
});
