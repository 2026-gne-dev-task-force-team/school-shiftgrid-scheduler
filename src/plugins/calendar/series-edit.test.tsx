// @vitest-environment jsdom
/**
 * C2c-2 — 「반복」 칸(setRecur) · 회차 단추(미루기·당기기·빠뜨리기·이후 전부·시리즈 열기) · 회차 휴지통 = skip.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, ensureStore, removeEvent, setCalendarHost, EVENT_TYPE } from './nodes';
import { eventToStored } from './event-fields';
import { isoMinuteOf, occId } from './events';
import { occurrences, setRecur, nudge, splitSeries, patternOf, type SeriesData } from './series';
import { EventCardPeek } from './views/EventCardPeek';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

let disp: Disposable | null = null;
let root: Root | null = null;
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
afterEach(() => {
    act(() => { root?.unmount(); }); root = null; document.body.innerHTML = '';
    setCalendarHost(null); disp?.dispose(); disp = null; __resetPersistForTest();
});

const api = () => getNodesApi()!;
const live = () => api().liveByType(EVENT_TYPE).length;
/** 오늘 09:00 시작 · 1시간 · 매주 count 회 */
function weekly(count: number): { id: string; first: string } {
    const d = new Date(); d.setHours(9, 0, 0, 0);
    const first = isoMinuteOf(d), end = isoMinuteOf(new Date(d.getTime() + 3_600_000));
    const id = api().create(store, { type: EVENT_TYPE, name: '회의', data: { ...eventToStored({ start: first, end, allDay: false }), recur: { freq: 'weekly', count } } });
    return { id, first };
}
function render(node: React.ReactNode): HTMLElement {
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el); act(() => { root!.render(node); }); return el;
}

const dataOf = (id: string) => api().get(id)!.data as SeriesData;
const occs = (sid: string) => occurrences(store, '2000-01-01', '2100-01-01').filter((o) => o.seriesId === sid);
const plus = (s: string, days: number) => { const d = new Date(s); d.setDate(d.getDate() + days); return isoMinuteOf(d); };
/** RecordPage 대역 — after(동작 줄)만 그려 단추를 누를 수 있게 · 지금 카드 id 를 남긴다 */
let shown = '';
function mountCard(id: string): HTMLElement {
    const RecordPage = (p: { id: string; after: React.ReactNode }) => { shown = p.id; return <div>{p.after}</div>; };
    setCalendarHost({ ...host(), notify: () => '', modules: { use: () => ({ RecordPage }) } } as unknown as PluginHost);
    return render(<EventCardPeek eventId={id} onClose={() => { shown = ''; }} />);
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const btn = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) ?? null;

describe('C2c-2 「반복」 칸 — setRecur', () => {
    it('반복 아닌 일정에 규칙을 달면 규칙 일정이 되고, 떼면 실체 회차는 보통 일정으로 남는다', () => {
        const d = new Date(); d.setHours(9, 0, 0, 0);
        const s = isoMinuteOf(d), e = plus(s, 0).replace('T09', 'T10');
        const id = api().create(store, { type: EVENT_TYPE, name: '보통', data: eventToStored({ start: s, end: e, allDay: false }) });
        setRecur(id, { freq: 'daily', count: 3 });
        expect(occs(id).map((o) => o.originalStart)).toEqual([s, plus(s, 1), plus(s, 2)]);
        const m = nudge(occs(id)[1], 1);
        setRecur(id, null);
        expect(dataOf(id).recur).toBeUndefined();
        expect(patternOf(dataOf(id))).toBeUndefined();
        expect(dataOf(m).seriesId).toBeUndefined();
        expect(dataOf(m).originalStart).toBeUndefined();
        expect(live()).toBe(2);
        expect(occs(id)).toEqual([]);
    });

    it('카드: 반복 아닌 일정에서 「매주」를 고르면 규칙 일정이 되고 카드는 그 일정에 머문다', () => {
        const d = new Date(); d.setHours(9, 0, 0, 0);
        const s = isoMinuteOf(d);
        const id = api().create(store, { type: EVENT_TYPE, name: '보통', data: eventToStored({ start: s, end: s.replace('T09', 'T10'), allDay: false }) });
        const el = mountCard(id);
        const sel = el.querySelector('select[aria-label="반복"]') as HTMLSelectElement;
        act(() => { sel.value = 'weekly'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(patternOf(dataOf(id))).toEqual({ rules: [{ freq: 'weekly', weekdays: [d.getDay()] }] });
        expect(shown).toBe(id);
        expect(el.querySelector('[data-cal-recur]')).not.toBeNull();
    });
});

describe('C2c-2 회차 단추', () => {
    it('하루 미루기: originalStart 그대로 · 시각 유지 · 카드는 실체로 갈아탄다', () => {
        const { id, first } = weekly(3);
        const el = mountCard(occId(id, first));
        click(btn(el, '하루 미루기'));
        const m = api().liveByType(EVENT_TYPE).find((n) => n.id !== id)!;
        expect(dataOf(m.id).originalStart).toBe(first);
        expect(occs(id)[0].start).toBe(plus(first, 1));
        expect(shown).toBe(m.id);
        click(btn(el, '하루 당기기'));
        expect(occs(id)[0].start).toBe(first);
        expect(live()).toBe(2);
    });

    it('빠뜨리기: 가상 회차 → 그 자리가 비고 다시 안 나타난다', () => {
        const { id, first } = weekly(3);
        const el = mountCard(occId(id, first));
        click(btn(el, '이 회차 빠뜨리기'));
        expect(occs(id).map((o) => o.originalStart)).not.toContain(first);
        expect(occs(id).length).toBe(2);
        expect(live()).toBe(1);
    });

    it('회차 휴지통 = skip: 실체 회차를 휴지통에 넣어도 그 자리에 가상이 다시 안 나타난다 · 규칙 일정은 산다', () => {
        const { id, first } = weekly(3);
        const m = nudge(occs(id)[0], 1);
        act(() => { removeEvent(m); });
        expect(api().isTrashed(m)).toBe(true);
        expect(api().isTrashed(id)).toBe(false);
        expect(occs(id).map((o) => o.originalStart)).not.toContain(first);
        expect(occs(id).length).toBe(2);
        // 가상 칩 id 로도 같은 길
        act(() => { removeEvent(occId(id, occs(id)[0].originalStart!)); });
        expect(occs(id).length).toBe(1);
        expect(api().isTrashed(id)).toBe(false);
    });

    it('회차 카드엔 휴지통이 없다(「이 회차 빠뜨리기」와 같은 동작) — 빠뜨리기가 그 회차만 뺀다', () => {
        const { id, first } = weekly(3);
        const el = mountCard(occId(id, first));
        expect(btn(el, '휴지통')).toBeNull();
        click(btn(el, '빠뜨리기'));
        expect(api().isTrashed(id)).toBe(false);
        expect(occs(id).length).toBe(2);
    });

    it('이후 전부 바꾸기: 앞쪽 회차 수 그대로 · 뒤는 새 규칙 · 시리즈 열기는 규칙 일정 카드', () => {
        const { id } = weekly(4);
        const third = occs(id)[2];
        const nid = splitSeries(third);
        expect(occs(id).length).toBe(2);
        expect(occs(nid).map((o) => o.originalStart)).toEqual([third.originalStart, plus(third.originalStart!, 7)]);
        expect(patternOf(dataOf(nid))!.rules[0].count).toBe(2);
        // 시리즈 열기 — 회차 카드에서 더보기 → 규칙 일정 카드(반복 칸이 보인다)
        const el = mountCard(occId(nid, third.originalStart!));
        click(el.querySelector('button[aria-label="더보기"]'));
        click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('시리즈 열기'))!);
        expect(shown).toBe(nid);
        expect(el.querySelector('[data-cal-recur]')).not.toBeNull();
    });
});
