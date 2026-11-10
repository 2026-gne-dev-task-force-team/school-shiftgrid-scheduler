/**
 * 달력 프리셋(약속 calendar 0.2) — 저장소 data.preset 이 낱말을 바꾼다 · 못 찾으면 기본 달력 · Disposable 로 해제.
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
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi,
    storeMenu, clearPendingCard, STORE_TYPE,
} from './nodes';
import { presetOf, DEFAULT_PRESET, __resetPresets } from './presets';
import { calendarModule } from './feed';
import type { CalendarPreset } from './contracts/calendar';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

let disp: Disposable | null = null;

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
});
afterEach(() => { disp?.dispose(); disp = null; clearPendingCard(); __resetPersistForTest(); __resetPresets(); });

const ROOM: CalendarPreset = {
    id: 'test.room', label: '방 예약', icon: 'calendar',
    words: { store: '예약 목록', event: '예약', newEvent: '새 예약', unit: '건' },
    defaultView: 'list',
};
const newEventLabel = (sid: string) => storeMenu(sid).map((i) => ('commandId' in i && i.commandId === 'calendar.newEventIn' ? i.label : null)).find(Boolean);
const mkStore = (preset?: string) => getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 's', data: preset ? { preset } : {} });

describe('달력 프리셋', () => {
    it('프리셋 없는 저장소 = 기본 달력(지금 낱말 그대로)', () => {
        const sid = mkStore();
        expect(presetOf(sid)).toBe(DEFAULT_PRESET);
        expect(newEventLabel(sid)).toBe('새 일정');
    });

    it('프리셋을 등록하면 그 저장소의 낱말이 바뀐다', () => {
        calendarModule.registerPreset(ROOM);
        const sid = mkStore('test.room');
        expect(presetOf(sid).words.event).toBe('예약');
        expect(newEventLabel(sid)).toBe('새 예약');
        expect(newEventLabel(mkStore())).toBe('새 일정');   // 다른 저장소는 그대로
    });

    it('미등록 id → 기본 달력(데이터는 그대로)', () => {
        const sid = mkStore('nope.missing');
        expect(presetOf(sid)).toBe(DEFAULT_PRESET);
        expect((getNodesApi()!.get(sid)!.data as { preset: string }).preset).toBe('nope.missing');
    });

    it('Disposable 로 해제하면 기본 달력으로 돌아간다(멱등)', () => {
        const d = calendarModule.registerPreset(ROOM);
        const sid = mkStore('test.room');
        expect(newEventLabel(sid)).toBe('새 예약');
        d.dispose(); d.dispose();
        expect(presetOf(sid)).toBe(DEFAULT_PRESET);
        expect(newEventLabel(sid)).toBe('새 일정');
    });
});
