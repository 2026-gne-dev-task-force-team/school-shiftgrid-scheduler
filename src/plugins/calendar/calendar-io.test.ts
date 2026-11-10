/**
 * 가져오기·내보내기 끝단(노드) — 실제 탐색기 스토어 + 달력 다리로:
 *   · 가져오기 → calendar.event 노드 생성 · 같은 파일 두 번 → UID 중복 건너뜀
 *   · 내보내기(저장소/전체) → .ics, 다시 파싱하면 같은 일정(왕복)
 * (record-node.test.ts·calendar-nodes.test.ts 와 같은 kv 모킹 harness)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
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
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes,
    importItemsToStore, collectForExport, STORE_TYPE, EVENT_TYPE,
} from './nodes';
import { parseIcs, writeIcs } from './ics';
import type { CalendarItem } from './contracts/calendar';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

let dispose: { dispose(): void } | null = null;

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    dispose = initCalendarNodes(api);
    return api;
});
afterEach(() => { dispose?.dispose(); dispose = null; __resetPersistForTest(); });

const ICS = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN',
    'BEGIN:VEVENT', 'UID:h1', 'DTSTART;VALUE=DATE:20260101', 'DTEND;VALUE=DATE:20260102', 'SUMMARY:신정', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:h2', 'DTSTART:20260601T090000', 'DTEND:20260601T100000', 'SUMMARY:회의', 'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

function newStore(): string {
    const api = makeNodesApi('calendar');
    return api.create(api.roots.main, { type: STORE_TYPE, name: '내 달력' });
}

describe('가져오기 → calendar.event 노드', () => {
    it('두 일정이 저장소 밑에 생긴다', () => {
        const sid = newStore();
        const r = importItemsToStore(sid, parseIcs(ICS));
        expect(r.created).toBe(2);
        expect(r.skipped).toBe(0);
        const api = makeNodesApi('calendar');
        const evs = api.children(sid).filter((n) => n.type === EVENT_TYPE);
        expect(evs.map((n) => n.name).sort()).toEqual(['신정', '회의']);
    });
    it('같은 파일을 두 번 넣으면 UID 중복으로 건너뛴다', () => {
        const sid = newStore();
        importItemsToStore(sid, parseIcs(ICS));
        const r2 = importItemsToStore(sid, parseIcs(ICS));
        expect(r2.created).toBe(0);
        expect(r2.skipped).toBe(2);
        const api = makeNodesApi('calendar');
        expect(api.children(sid).filter((n) => n.type === EVENT_TYPE).length).toBe(2);
    });
});

describe('내보내기 — 저장소/전체, 왕복', () => {
    it('저장소 하나를 내보내면 그 저장소 일정만', () => {
        const a = newStore();
        const b = newStore();
        importItemsToStore(a, parseIcs(ICS));
        importItemsToStore(b, [{ id: 'x', title: '남의 저장소', start: '2026-07-01', end: '2026-07-02', allDay: true } as CalendarItem]);
        const outA = collectForExport(a);
        expect(outA.map((e) => e.title).sort()).toEqual(['신정', '회의']);
    });
    it('전체(null)는 모든 저장소 일정', () => {
        const a = newStore();
        const b = newStore();
        importItemsToStore(a, parseIcs(ICS));
        importItemsToStore(b, [{ id: 'x', title: '별도', start: '2026-07-01', end: '2026-07-02', allDay: true } as CalendarItem]);
        expect(collectForExport(null).length).toBe(3);
    });
    it('내보내기 → 파싱하면 같은 일정(왕복)', () => {
        const a = newStore();
        importItemsToStore(a, parseIcs(ICS));
        const round = parseIcs(writeIcs(collectForExport(a)));
        const titles = round.map((e) => e.title).sort();
        expect(titles).toEqual(['신정', '회의']);
        const sinjeong = round.find((e) => e.title === '신정')!;
        expect(sinjeong.allDay).toBe(true);
    });
});

describe('내보내기 — 노드 단위(저장소+하위 저장소)', () => {
    it('저장소를 내보내면 하위 저장소 일정까지 담는다', () => {
        const parent = newStore();
        const api = makeNodesApi('calendar');
        const child = api.create(parent, { type: STORE_TYPE, name: '하위 저장소' });
        importItemsToStore(parent, [{ id: 'p1', title: '부모 일정', start: '2026-03-01', end: '2026-03-02', allDay: true } as CalendarItem]);
        importItemsToStore(child, [{ id: 'c1', title: '자식 일정', start: '2026-03-10', end: '2026-03-11', allDay: true } as CalendarItem]);
        // 부모를 내보내면 둘 다(path 가 부모를 지난다)
        expect(collectForExport(parent).map((e) => e.title).sort()).toEqual(['부모 일정', '자식 일정']);
        // 자식만 내보내면 자식 일정만
        expect(collectForExport(child).map((e) => e.title)).toEqual(['자식 일정']);
    });
});
