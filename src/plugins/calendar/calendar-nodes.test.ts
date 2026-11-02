/**
 * 달력 노드 타입 증명(C1) — 「일정(calendar.event)은 탐색기에 0줄, API·저장엔 일반 노드」.
 *   record-node.test.ts 꼴: 노드 스토어(kv)를 메모리 Map 으로 모킹하고 탐색기 스토어를 세운 뒤,
 *   달력이 꽂는 타입 둘(registerCalendarTypes)로 저장소·일정을 만들어 본다.
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

import { initStore, getState } from '../project-explorer/store';
import { __resetPersistForTest } from '../project-explorer/persist';
import { makeNodesApi } from '../project-explorer/api';
import { registerType, clearTypes, isRecordType, isContainerType } from '../project-explorer/model/types';
import { clearDerived } from '../project-explorer/model/derive';
import { flatten } from '../project-explorer/model/tree';
import { buildMainRows } from '../project-explorer/views/rows';
import { calendarNodeTypes, calendarNodeTypeImpl, STORE_TYPE, EVENT_TYPE } from './nodes';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { __resetPersistForTest(); });

describe('달력 타입 둘 — 저장소는 보이고, 일정(record)은 탐색기 0줄', () => {
    it('접두사 calendar. · 저장소는 flatten 에 · 일정은 안 보이고 byType·children 엔 있다', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const api = makeNodesApi('calendar');
        for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());

        // 접두사 규칙(요구명세) — 둘 다 'calendar.' 로 시작
        expect(STORE_TYPE.startsWith('calendar.')).toBe(true);
        expect(EVENT_TYPE.startsWith('calendar.')).toBe(true);

        const root = api.roots.main;
        const sid = api.create(root, { type: STORE_TYPE, name: '기본' });
        const eid = api.create(sid, { type: EVENT_TYPE, name: '교직원 회의', data: { start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false } });
        expect(sid).not.toBe('');
        expect(eid).not.toBe('');

        const tree = getState().tree;

        // ① 저장소는 탐색기에 보이고, 일정은 flatten·buildMainRows 어디에도 없다
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(sid);
        expect(flatIds).not.toContain(eid);
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(eid);

        // ② API 론 보인다
        expect(api.byType(EVENT_TYPE).map((n) => n.id)).toEqual([eid]);
        expect(api.byType(STORE_TYPE).map((n) => n.id)).toEqual([sid]);
        expect(api.children(sid).map((n) => n.id)).toContain(eid);
    });

    it('저장소는 하위 가능 — 폴더·저장소를 품고(accepts), 일정(레코드)도 품되 탐색기엔 안 드러난다 (쥔님 11-02 10:34)', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const api = makeNodesApi('calendar');
        for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
        const sid = api.create(api.roots.main, { type: STORE_TYPE, name: '기본' });

        // move 는 accepts 를 본다 — 폴더·저장소는 저장소 밑으로 든다
        const fid = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.move(fid, sid);
        expect(api.parent(fid)).toBe(sid);
        const sub = api.create(sid, { type: STORE_TYPE, name: '하위 저장소' });
        expect(api.parent(sub)).toBe(sid);
        // 일정은 레코드 — children 엔 있지만 탐색기 flatten 엔 없다(record-node.test 가 flatten 쪽을 못 박는다)
        const eid = api.create(sid, { type: EVENT_TYPE, name: '일정', data: { start: '2026-11-02T00:00', end: '2026-11-03T00:00', allDay: true } });
        expect(api.children(sid).map((n) => n.id)).toEqual(expect.arrayContaining([fid, sub, eid]));
    });
});
