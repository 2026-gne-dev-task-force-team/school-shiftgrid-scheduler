/**
 * 반복 일정 회차 모델(C2b) — occurrences·materialize·reschedule·skip·splitSeries 를 실제 탐색기 스토어(nodes 다리)에 걸고 센다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, Disposable } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (b.clear) store.clear();
        for (const v of b.put ?? []) store.set(v.id as string, v);
        for (const id of b.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, ensureStore, removeEvent, EVENT_TYPE } from './nodes';
import { eventToStored } from './event-fields';
import { occurrences, materialize, reschedule, skip, splitSeries, type SeriesData } from './series';
import { calendarModule } from './feed';
import type { RecurRule } from './recur';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

let disp: Disposable | null = null;
let store = '';
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
    store = ensureStore()!;
});
afterEach(() => { disp?.dispose(); disp = null; __resetPersistForTest(); });

const api = () => getNodesApi()!;
const live = () => api().liveByType(EVENT_TYPE).length;
function rule(recur: RecurRule | undefined, start = '2026-11-02T09:00', end = '2026-11-02T10:00', name = '회의'): string {
    const allDay = !start.includes('T') ;
    const s = allDay ? `${start}T00:00` : start, e = allDay ? `${end}T00:00` : end;
    return api().create(store, { type: EVENT_TYPE, name, data: { ...eventToStored({ start: s, end: e, allDay, memo: '메모' }), ...(recur ? { recur } : {}) } });
}
const starts = (from: string, to: string) => occurrences(store, from, to).map((o) => o.start);
const dataOf = (id: string) => api().get(id)!.data as SeriesData;

describe('occurrences — 가상 회차', () => {
    it('매주 월 · 11월 [11-01, 12-01) → 5회 · 전부 가상 · 끝은 길이 1시간', () => {
        const id = rule({ freq: 'weekly' });
        const os = occurrences(store, '2026-11-01', '2026-12-01');
        expect(os.map((o) => o.start)).toEqual(['2026-11-02T09:00', '2026-11-09T09:00', '2026-11-16T09:00', '2026-11-23T09:00', '2026-11-30T09:00']);
        expect(os.every((o) => o.virtual && o.eventId === id && o.seriesId === id && o.originalStart === o.start)).toBe(true);
        expect(os[1].end).toBe('2026-11-09T10:00');
    });
    it('보통 일정과 섞여 시작순 · 종일 회차는 T00:00 꼴', () => {
        rule({ freq: 'daily', count: 2 }, '2026-11-10', '2026-11-11');
        rule(undefined, '2026-11-10T08:00', '2026-11-10T09:00', '보통');
        const os = occurrences(store, '2026-11-10', '2026-11-20');
        expect(os.map((o) => [o.start, o.end, o.virtual])).toEqual([
            ['2026-11-10T00:00', '2026-11-11T00:00', true],
            ['2026-11-10T08:00', '2026-11-10T09:00', false],
            ['2026-11-11T00:00', '2026-11-12T00:00', true],
        ]);
    });
    it('범위 앞에서 시작해 걸친 회차도 잡는다(이틀짜리 종일)', () => {
        rule({ freq: 'weekly' }, '2026-11-02', '2026-11-04');
        expect(starts('2026-11-03', '2026-11-04')).toEqual(['2026-11-02T00:00']);
    });
    it('끝 없는 규칙도 범위만 계산 — 먼 미래 한 주는 1회', () => {
        rule({ freq: 'daily', interval: 7 });
        expect(starts('2126-01-01', '2126-01-08')).toHaveLength(1);
    });
    it('🔴 자동 실체화 없음 — occurrences 를 불러도 노드 수 그대로(지나간 회차 포함)', () => {
        rule({ freq: 'daily' });
        const n = live();
        occurrences(store, '2026-01-01', '2027-01-01');
        calendarModule.occurrences(store, '2026-11-01', '2026-12-01');
        expect(live()).toBe(n);
    });
});

describe('materialize · reschedule', () => {
    it('실체가 가상을 대신한다 — 중복 없음 · 두 번 불러도 같은 id', () => {
        const id = rule({ freq: 'weekly' });
        const o = occurrences(store, '2026-11-09', '2026-11-10')[0];
        const m = materialize(o);
        expect(m).not.toBe(id);
        expect(materialize(o)).toBe(m);
        expect(live()).toBe(2);
        expect(dataOf(m)).toMatchObject({ seriesId: id, originalStart: '2026-11-09T09:00' });
        expect(dataOf(m).recur).toBeUndefined();
        const os = occurrences(store, '2026-11-01', '2026-12-01');
        expect(os).toHaveLength(5);
        expect(os.filter((x) => !x.virtual).map((x) => x.eventId)).toEqual([m]);
        expect(materialize(os.find((x) => !x.virtual)!)).toBe(m);
    });
    it('미룬 회차가 범위 밖으로 나가면 그 자리는 비고, 옮겨 간 범위엔 들어온다 · originalStart 유지', () => {
        rule({ freq: 'weekly' });
        const o = occurrences(store, '2026-11-09', '2026-11-10')[0];
        reschedule(o, '2026-12-03T14:00', '2026-12-03T15:00');
        expect(starts('2026-11-09', '2026-11-16')).toEqual([]);
        const moved = occurrences(store, '2026-12-03', '2026-12-04');
        expect(moved).toMatchObject([{ start: '2026-12-03T14:00', end: '2026-12-03T15:00', originalStart: '2026-11-09T09:00', virtual: false }]);
        // 당겨서 범위 안으로 들어오는 쪽
        const late = occurrences(store, '2026-12-14', '2026-12-15')[0];
        reschedule(late, '2026-11-20T09:00', '2026-11-20T10:00');
        expect(starts('2026-11-16', '2026-11-23')).toEqual(['2026-11-16T09:00', '2026-11-20T09:00']);
        expect(starts('2026-12-14', '2026-12-21')).toEqual([]);
    });
});

describe('skip', () => {
    it('가상 회차 — exdates 에 더해 빠진다 · 노드 수 그대로', () => {
        const id = rule({ freq: 'weekly' });
        skip(occurrences(store, '2026-11-09', '2026-11-10')[0]);
        expect(dataOf(id).recur!.exdates).toEqual(['2026-11-09T09:00']);
        expect(starts('2026-11-01', '2026-11-20')).toEqual(['2026-11-02T09:00', '2026-11-16T09:00']);
        expect(live()).toBe(1);
    });
    it('실체 회차 — 레코드는 휴지통으로(영구 아님) · 종일은 날짜로 적는다', () => {
        const id = rule({ freq: 'daily' }, '2026-11-10', '2026-11-11');
        const o = occurrences(store, '2026-11-11', '2026-11-12')[0];
        const m = materialize(o);
        skip(occurrences(store, '2026-11-11', '2026-11-12')[0]);
        expect(api().isTrashed(m)).toBe(true);
        expect(dataOf(id).recur!.exdates).toEqual(['2026-11-11']);
        expect(starts('2026-11-10', '2026-11-13')).toEqual(['2026-11-10T00:00', '2026-11-12T00:00']);
    });
});

describe('splitSeries — 이후 전부', () => {
    it('count — 앞 규칙은 전날까지, 새 규칙은 남은 수(빠진 회차도 센다) · 합쳐 원래 회차와 같다', () => {
        const id = rule({ freq: 'weekly', count: 5, exdates: ['2026-11-09T09:00'] });
        const before = starts('2026-11-01', '2027-01-01');
        expect(before).toHaveLength(4);
        const o = occurrences(store, '2026-11-16', '2026-11-17')[0];
        const nid = splitSeries(o);
        expect(nid).not.toBe('');
        expect(dataOf(id).recur).toMatchObject({ until: '2026-11-15' });
        expect(dataOf(id).recur!.count).toBeUndefined();
        expect(dataOf(nid).recur!.count).toBe(3);
        expect(dataOf(nid).recur!.exdates).toBeUndefined();
        const after = occurrences(store, '2026-11-01', '2027-01-01');
        expect(after.map((x) => x.start)).toEqual(before);
        expect(after.filter((x) => x.start >= '2026-11-16').every((x) => x.seriesId === nid)).toBe(true);
    });
    it('until — 새 규칙이 같은 끝을 물려받고, 그 뒤 실체 회차는 새 규칙으로 옮겨 간다', () => {
        const id = rule({ freq: 'daily', until: '2026-11-06' });
        const m = materialize(occurrences(store, '2026-11-05', '2026-11-06')[0]);
        const nid = splitSeries(occurrences(store, '2026-11-04', '2026-11-05')[0]);
        expect(dataOf(nid).recur!.until).toBe('2026-11-06');
        expect(dataOf(m).seriesId).toBe(nid);
        const os = occurrences(store, '2026-11-01', '2026-12-01');
        expect(os.map((x) => x.start)).toEqual(['2026-11-02T09:00', '2026-11-03T09:00', '2026-11-04T09:00', '2026-11-05T09:00', '2026-11-06T09:00']);
        expect(os.map((x) => x.seriesId)).toEqual([id, id, nid, nid, nid]);
        expect(os[3].virtual).toBe(false);
    });
});

describe('규칙 일정을 지우면', () => {
    it('그 실체 회차들도 같이 휴지통으로', () => {
        const id = rule({ freq: 'weekly' });
        const m = materialize(occurrences(store, '2026-11-09', '2026-11-10')[0]);
        removeEvent(id);
        expect(api().isTrashed(id)).toBe(true);
        expect(api().isTrashed(m)).toBe(true);
        expect(occurrences(store, '2026-11-01', '2026-12-01')).toEqual([]);
    });
});
