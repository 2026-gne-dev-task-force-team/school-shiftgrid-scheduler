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

import { initStore } from '../explorer/store';
import { __resetPersistForTest } from '../explorer/persist';
import { makeNodesApi } from '../explorer/api';
import { registerType, clearTypes } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, ensureStore, removeEvent, patchEvent, collectForExport, EVENT_TYPE } from './nodes';
import { parseIcs, parseIcsSeries, writeIcs } from './ics';
import { setRecur } from './series';
import type { DatePattern } from './recur';
import { eventToStored } from './event-fields';
import { occurrences, materialize, reschedule, skip, splitSeries, patternOf, type SeriesData } from './series';
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
const pat = (id: string) => patternOf(api().get(id)!.data)!;

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
        expect(pat(id).exdates).toEqual(['2026-11-09']);   // 시각 있는 회차도 날짜만
        expect(dataOf(id).recur).toBeUndefined();   // 쓰면서 옛 자리는 걷힌다
        expect(starts('2026-11-01', '2026-11-20')).toEqual(['2026-11-02T09:00', '2026-11-16T09:00']);
        expect(live()).toBe(1);
    });
    it('빠뜨린 뒤 시리즈 시각을 바꿔도 빠진 날은 안 살아난다', () => {
        const id = rule({ freq: 'weekly' });
        skip(occurrences(store, '2026-11-09', '2026-11-10')[0]);
        patchEvent(id, { name: '회의', start: '2026-11-02T14:00', end: '2026-11-02T15:00', allDay: false, memo: '메모' });
        expect(starts('2026-11-01', '2026-11-20')).toEqual(['2026-11-02T14:00', '2026-11-16T14:00']);
    });
    it('실체 회차 — 레코드는 휴지통으로(영구 아님) · 종일은 날짜로 적는다', () => {
        const id = rule({ freq: 'daily' }, '2026-11-10', '2026-11-11');
        const o = occurrences(store, '2026-11-11', '2026-11-12')[0];
        const m = materialize(o);
        skip(occurrences(store, '2026-11-11', '2026-11-12')[0]);
        expect(api().isTrashed(m)).toBe(true);
        expect(pat(id).exdates).toEqual(['2026-11-11']);
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
        expect(pat(id).rules[0]).toMatchObject({ until: '2026-11-15' });
        expect(pat(id).rules[0].count).toBeUndefined();
        expect(pat(nid).rules[0].count).toBe(3);
        expect(pat(nid).exdates).toBeUndefined();
        expect(dataOf(id).recur).toBeUndefined();
        const after = occurrences(store, '2026-11-01', '2027-01-01');
        expect(after.map((x) => x.start)).toEqual(before);
        expect(after.filter((x) => x.start >= '2026-11-16').every((x) => x.seriesId === nid)).toBe(true);
    });
    it('until — 새 규칙이 같은 끝을 물려받고, 그 뒤 실체 회차는 새 규칙으로 옮겨 간다', () => {
        const id = rule({ freq: 'daily', until: '2026-11-06' });
        const m = materialize(occurrences(store, '2026-11-05', '2026-11-06')[0]);
        const nid = splitSeries(occurrences(store, '2026-11-04', '2026-11-05')[0]);
        expect(pat(nid).rules[0].until).toBe('2026-11-06');
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

describe('날짜 패턴(P2) — values.when.pattern', () => {
    /** 새 꼴 — 패턴은 「언제」 칸 안에 산다 */
    function patterned(p: DatePattern, start = '2026-11-02T09:00', end = '2026-11-02T10:00'): string {
        const st = eventToStored({ start, end, allDay: false, memo: '메모' });
        return api().create(store, { type: EVENT_TYPE, name: '회의', data: { ...st, values: { ...st.values, when: { ...(st.values.when as object), start, end, pattern: p } } } });
    }
    it('규칙 둘 + 더한 날 + 기간 빼기가 회차에 반영된다', () => {
        // 월(11-02 시작) 매주 + 목 매주 · 11-09~11-13 빼기 · 11-21(토) 더하기
        patterned({ rules: [{ freq: 'weekly' }, { freq: 'weekly', weekdays: [4] }], rdates: ['2026-11-21'], except: [{ from: '2026-11-09', to: '2026-11-13' }] });
        expect(starts('2026-11-01', '2026-11-24')).toEqual(['2026-11-02T09:00', '2026-11-05T09:00', '2026-11-16T09:00', '2026-11-19T09:00', '2026-11-21T09:00', '2026-11-23T09:00']);
    });
    it('옛 data.recur 노드 — 그대로 펼치고, 규칙을 고치면 옛 자리는 걷히고 when.pattern 이 생긴다', () => {
        const id = rule({ freq: 'weekly', exdates: ['2026-11-09T09:00'] });
        expect(starts('2026-11-01', '2026-11-17')).toEqual(['2026-11-02T09:00', '2026-11-16T09:00']);
        setRecur(id, { freq: 'weekly', interval: 2 });
        expect(dataOf(id).recur).toBeUndefined();
        expect((dataOf(id).values.when as { pattern?: DatePattern }).pattern).toEqual({ rules: [{ freq: 'weekly', interval: 2 }], exdates: ['2026-11-09T09:00'] });
    });
    it('시각·메모를 고쳐도 패턴은 남고 · 회차 실체는 패턴을 안 물려받는다', () => {
        const p: DatePattern = { rules: [{ freq: 'daily', count: 3 }], exdates: ['2026-11-03'] };
        const id = patterned(p);
        patchEvent(id, { name: '회의', start: '2026-11-02T10:00', end: '2026-11-02T11:00', allDay: false, memo: '바뀜' });
        expect(pat(id)).toEqual(p);
        const m = materialize(occurrences(store, '2026-11-04', '2026-11-05')[0]);
        expect(patternOf(dataOf(m))).toBeUndefined();
        expect(starts('2026-11-01', '2026-11-10')).toEqual(['2026-11-02T10:00', '2026-11-04T10:00']);
    });
    it('ICS 왕복 — 내보내면 RRULE·EXDATE(실체 회차 자리 포함), 가져오면 패턴째 · 구독용 parseIcs 는 펼친다', () => {
        const id = patterned({ rules: [{ freq: 'weekly', count: 4 }], exdates: ['2026-11-09T09:00'] });
        reschedule(occurrences(store, '2026-11-16', '2026-11-17')[0], '2026-11-17T09:00', '2026-11-17T10:00');
        const ics = writeIcs(collectForExport(store));
        expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=4');
        expect(ics).toContain('EXDATE:20261109T090000,20261116T090000');
        const back = parseIcsSeries(ics).find((x) => x.id === id)!;
        expect(back.pattern).toEqual({ rules: [{ freq: 'weekly', count: 4 }], exdates: ['2026-11-09T09:00', '2026-11-16T09:00'] });
        expect(parseIcs(ics).map((x) => x.start).sort()).toEqual(['2026-11-02T09:00', '2026-11-17T09:00', '2026-11-23T09:00']);
    });
});
