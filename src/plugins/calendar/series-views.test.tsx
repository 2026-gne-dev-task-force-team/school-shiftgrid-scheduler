// @vitest-environment jsdom
/**
 * C2c-1 — 보기들이 반복 일정의 회차를 그린다(useCalendarData 한 곳) · 열기만 해선 실체화 ⛔ · 고칠 때 materialize · 되살리기 묶음.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, Disposable, PeekHandle } from '../../pane-ui-system/plugin';

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
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, ensureStore, removeEvent, restoreEvent, setCalendarHost, EVENT_TYPE } from './nodes';
import { eventToStored } from './event-fields';
import { isoMinuteOf, occId } from './events';
import { reschedule, type SeriesData } from './series';
import { ListView } from './views/ListView';
import { MonthView } from './views/MonthView';
import { EventCardPeek } from './views/EventCardPeek';
import { RecordPage } from '../collection/views/RecordPage';

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
const peek = { show() {}, hide() {}, visible: false } as unknown as PeekHandle;
const noSel = { selection: null, onSelect: () => {} };
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

describe('C2c-1 보기 — 반복 회차', () => {
    it('목록은 실제 자료만: 매주 4회 → 규칙 일정 1줄 · 회차 하나를 옮겨 실체화하면 그 회차가 1줄 더(가상 회차는 안 뜬다)', () => {
        const { id } = weekly(4);
        const el = render(<ListView value={new Date()} onChange={() => {}} peek={peek} {...noSel} />);
        const rows = () => [...el.querySelectorAll('tbody tr')];
        expect(rows().length).toBe(1);
        expect(el.querySelectorAll('tbody svg').length).toBe(1);   // 반복 표시
        const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + 7);
        const os = isoMinuteOf(d);
        act(() => { reschedule({ eventId: id, seriesId: id, originalStart: os, start: os, end: os.replace('T09', 'T10'), allDay: false, virtual: true }, os.replace('T09', 'T13'), os.replace('T09', 'T14')); });
        expect(live()).toBe(2);
        expect(rows().length).toBe(2);
        expect(el.querySelectorAll('tbody svg').length).toBe(2);
    });

    it('달력 보기: 가상 회차 칩은 고스트(연하게·점선) · 실체 회차는 보통', () => {
        const { id } = weekly(2);
        const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + 7);
        const os = isoMinuteOf(d);
        act(() => { reschedule({ eventId: id, seriesId: id, originalStart: os, start: os, end: os.replace('T09', 'T10'), allDay: false, virtual: true }, os.replace('T09', 'T13'), os.replace('T09', 'T14')); });
        const el = render(<MonthView value={new Date()} onChange={() => {}} peek={peek} {...noSel} />);
        const chips = [...el.querySelectorAll('[data-event-id]')];
        expect(chips.length).toBe(2);
        const ghost = chips.filter((c) => c.className.includes('outline-dashed'));
        expect(ghost.length).toBe(1);
        expect(ghost[0].getAttribute('data-event-id')!.startsWith(`${id}@`)).toBe(true);
    });

    it('월: 매주 3회 → 가상 칩 3개(id = 규칙 id@originalStart) · 규칙 일정 자신은 칩이 아니다', () => {
        const { id, first } = weekly(3);
        const el = render(<MonthView value={new Date()} onChange={() => {}} peek={peek} {...noSel} />);
        const chips = el.querySelectorAll(`[data-event-id^="${id}@"]`);
        expect(new Set([...chips].map((c) => c.getAttribute('data-event-id'))).size).toBe(3);
        expect(el.querySelector(`[data-event-id="${occId(id, first)}"]`)).not.toBeNull();
        expect(el.querySelector(`[data-event-id="${id}"]`)).toBeNull();
    });

    it('카드: 가상 회차를 열기만 하면 노드 수 그대로 · 값을 고치면 그때 materialize(originalStart 유지) 후 실체로 갈아탄다', () => {
        const { id, first } = weekly(3);
        let props: { id: string; onChange: (k: string, v: unknown) => void } | null = null;
        const RecordPage = (p: typeof props) => { props = p; return null; };
        setCalendarHost({ ...host(), modules: { use: () => ({ RecordPage }) } } as unknown as PluginHost);
        render(<EventCardPeek eventId={occId(id, first)} onClose={() => {}} />);
        expect(live()).toBe(1);
        expect(props!.id).toBe(id);   // RecordPage 는 노드를 찾는다 — 가상 회차는 규칙 노드 id(F1 A)
        act(() => { props!.onChange('name', '바뀐 회의'); });
        expect(live()).toBe(2);
        const m = api().liveByType(EVENT_TYPE).find((n) => n.id !== id)!;
        expect(m.name).toBe('바뀐 회의');
        expect((m.data as SeriesData).originalStart).toBe(first);
        expect(props!.id).toBe(m.id);
        expect(api().get(id)!.name).toBe('회의');   // 규칙 일정 자체는 안 바뀐다
    });

    it('F1 A: 가상 회차 카드를 실제 RecordPage 로 열면 「없어졌습니다」 대신 회차 단추가 보이고 하루 미루기가 동작한다', () => {
        const { id, first } = weekly(3);
        const h = { ...host(), modules: { use: (k: string) => (k === 'collection' ? { RecordPage } : k === 'nodes' ? api() : undefined) } } as unknown as PluginHost;
        setCalendarHost(h);
        const el = render(<EventCardPeek eventId={occId(id, first)} onClose={() => {}} />);
        expect(el.textContent).not.toContain('이 줄이 없어졌습니다');
        expect(el.querySelector('[data-cal-occ-act="skip"]')).not.toBeNull();
        act(() => { (el.querySelector('[data-cal-occ-act="later"]') as HTMLElement).click(); });
        expect(live()).toBe(2);
        expect(el.textContent).not.toContain('이 줄이 없어졌습니다');
    });

    it('되살리기: 규칙 일정을 휴지통에서 되살리면 같이 버린 실체 회차도 돌아온다', () => {
        const { id, first } = weekly(3);
        act(() => { reschedule({ eventId: id, seriesId: id, originalStart: first, start: first, end: first, allDay: false, virtual: true }, first.replace('T09', 'T11'), first.replace('T09', 'T12')); });
        expect(live()).toBe(2);
        act(() => { removeEvent(id); });
        expect(live()).toBe(0);
        expect(restoreEvent(id)).toBe(true);
        expect(live()).toBe(2);
    });
});
