// @vitest-environment jsdom
/** R12 — 옛 기기 저장소 → 호스트 저장 이사: 이사 전후 같은 값 · 두 번 같음 · 약속이 꺼져도 먼저 돈다 · 옛 값 그대로. 시험 자료는 지어낸 것. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { runDaysMigration } from './boot';
import { LEGACY_KEY, PART_MOVED_KEY, movePartToStorage } from './partmove';
import { PART_KEY, demoDays, readStoredPart, storageDaysSource } from './source';

const fakeStore = () => {
    const kv = new Map<string, unknown>();
    return { kv, get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); } };
};
beforeEach(() => { localStorage.clear(); });

describe('학사 저장 이사(localStorage → 호스트 저장)', () => {
    it('이사 전후 같은 값 · 옛 값은 그대로 · 옮김 표시는 호스트 저장에만', async () => {
        const old = { ...demoDays(), classSubjects: [] };
        localStorage.setItem(LEGACY_KEY, JSON.stringify(old));
        const before = localStorage.getItem(LEGACY_KEY);
        const store = fakeStore();
        expect(movePartToStorage(store, localStorage)).toEqual({ moved: true, done: false });
        expect(await storageDaysSource(store, () => ({ calendar: [], changes: [] })).load()).toEqual(old);
        expect(localStorage.getItem(LEGACY_KEY)).toBe(before);
        expect(localStorage.length).toBe(1);
        expect(store.kv.has(PART_MOVED_KEY)).toBe(true);
    });
    it('두 번 돌려도 같다 · 새 칸에 값이 있으면 덮지 않는다', () => {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(demoDays()));
        const store = fakeStore();
        movePartToStorage(store, localStorage);
        const once = JSON.stringify(readStoredPart(store));
        expect(movePartToStorage(store, localStorage)).toEqual({ moved: false, done: true });
        expect(JSON.stringify(readStoredPart(store))).toBe(once);
        const s2 = fakeStore();
        s2.set(PART_KEY, { calendar: [], changes: [] });
        expect(movePartToStorage(s2, localStorage)).toEqual({ moved: false, done: false });
        expect(readStoredPart(s2)).toEqual({ calendar: [], changes: [] });
    });
    it('옛 값이 없거나 깨졌으면 옮기지 않고 표시만 쓴다 · 저장소 없음이면 seed', async () => {
        localStorage.setItem(LEGACY_KEY, '{깨짐');
        const store = fakeStore();
        expect(movePartToStorage(store, localStorage)).toEqual({ moved: false, done: false });
        expect(readStoredPart(store)).toBeNull();
        expect((await storageDaysSource(store, demoDays).load()).changes).toHaveLength(1);
    });
    it('달력·노드 약속이 꺼져 있어도 저장 이사는 먼저 돈다(달력 이사만 미룬다)', () => {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(demoDays()));
        const store = fakeStore();
        const host = { modules: { use: () => null }, storage: store } as unknown as PluginHost;
        expect(runDaysMigration(host)).toBeNull();
        expect(readStoredPart(store)?.changes).toHaveLength(1);
        expect(localStorage.getItem(`${LEGACY_KEY}.moved`)).toBeNull();
    });
});
