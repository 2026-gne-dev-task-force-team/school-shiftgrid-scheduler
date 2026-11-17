/**
 * 저장 전 검증(beforeSave) — 지어낸 규칙으로 거절·통과. (presets.test.ts 와 같은 뼈대)
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

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi,
    clearPendingCard, STORE_TYPE,
} from './nodes';
import { __resetPresets } from './presets';
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


const mkStore = (preset?: string) => getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 's', data: preset ? { preset } : {} });
import { createEvent, patchEvent, setEventValue, importItemsToStore } from './nodes';
import { reschedule } from './series';
import { onSaveRejected, importRejectedTitle } from './save-check';
import { registerPreset } from './presets';

// 지어낸 규칙 — 「지난 날 금지」 + 「같은 시작 시각 중복 금지」(방 예약 규칙의 모양만 흉내)
const NOW = '2026-11-17T09:00';
const FAKE: CalendarPreset = {
    id: 'test.fake', label: '가짜', icon: 'calendar',
    words: { store: '가짜 목록', event: '건', newEvent: '새 건', unit: '건' },
    beforeSave(d, ctx) {
        if (d.start < ctx.now) return { ok: false, reason: '지난 날은 못 넣습니다' };
        if (ctx.others(d.start, d.end).some((o) => o.start === d.start)) return { ok: false, reason: '같은 시간에 이미 있습니다' };
        return { ok: true };
    },
};
const at = (start: string, end: string) => ({ start, end, allDay: false });
const count = (sid: string) => getNodesApi()!.liveByType('calendar.event').filter((n) => getNodesApi()!.parent(n.id) === sid).length;

describe('저장 전 검증 beforeSave', () => {
    it('거절: 지난 날이면 만들지 않고 이유를 알린다', () => {
        registerPreset({ ...FAKE, beforeSave: (d, c) => FAKE.beforeSave!(d, { ...c, now: NOW }) });
        const sid = mkStore(FAKE.id);
        const reasons: string[] = [];
        const off = onSaveRejected((r) => reasons.push(r));
        expect(createEvent(at('2026-11-10T10:00', '2026-11-10T11:00'), 'x', sid)).toBe('');
        off();
        expect(count(sid)).toBe(0);
        expect(reasons).toEqual(['지난 날은 못 넣습니다']);
    });
    it('통과: 미래·안 겹침이면 만들어지고, 같은 시작 중복은 거절 · 자기 자신은 고쳐도 통과', () => {
        registerPreset({ ...FAKE, beforeSave: (d, c) => FAKE.beforeSave!(d, { ...c, now: NOW }) });
        const sid = mkStore(FAKE.id);
        const a = createEvent(at('2026-11-20T10:00', '2026-11-20T11:00'), 'a', sid);
        expect(a).not.toBe('');
        expect(createEvent(at('2026-11-20T10:00', '2026-11-20T12:00'), 'b', sid)).toBe('');
        expect(count(sid)).toBe(1);
        expect(patchEvent(a, { name: 'a2', ...at('2026-11-20T10:00', '2026-11-20T11:30'), memo: '' })).toEqual({ ok: true });
        expect(getNodesApi()!.get(a)!.name).toBe('a2');
        const b = createEvent(at('2026-11-21T10:00', '2026-11-21T11:00'), 'b', sid);
        expect(patchEvent(b, { name: 'b', ...at('2026-11-20T10:00', '2026-11-20T11:00'), memo: '' })).toEqual({ ok: false, reason: '같은 시간에 이미 있습니다' });
        expect(reschedule({ eventId: b, start: '', end: '', allDay: false, virtual: false }, '2026-11-20T10:00', '2026-11-20T11:00')).toBe('');
    });
    it('규칙이 없거나 던지면 통과(기본 달력 행동 변화 0)', () => {
        const plain = mkStore();
        expect(createEvent(at('2020-01-01T10:00', '2020-01-01T11:00'), 'x', plain)).not.toBe('');
        registerPreset({ ...FAKE, id: 'test.boom', beforeSave() { throw new Error('버그'); } });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sid = mkStore('test.boom');
        expect(createEvent(at('2020-01-01T10:00', '2020-01-01T11:00'), 'x', sid)).not.toBe('');
        warn.mockRestore();
    });
});

// 지어낸 칸 규칙 — 「칸 f_a 가 '막힘' 이면 거절」(방 칸·인원 칸을 흉내) · 이름 '막힘' 도 거절(.ics 가져오기용)
const VALUES_RULE: CalendarPreset = {
    id: 'test.values', label: '칸규칙', icon: 'calendar',
    words: { store: '목록', event: '건', newEvent: '새 건', unit: '건' },
    beforeSave(d) {
        if (d.values.f_a === '막힘') return { ok: false, reason: '막힌 칸 값입니다' };
        if (d.name === '막힘') return { ok: false, reason: '막힌 이름입니다' };
        return { ok: true };
    },
};

describe('저장 전 검증 — 모든 쓰기 길(T-10ev)', () => {
    it('길 1 만들기: 초안 칸 값이 훅에 넘어가 거절되고, 통과하면 그 칸 값이 저장에도 담긴다', () => {
        registerPreset(VALUES_RULE);
        const sid = mkStore(VALUES_RULE.id);
        const reasons: string[] = [];
        const off = onSaveRejected((r) => reasons.push(r));
        expect(createEvent(at('2026-11-20T10:00', '2026-11-20T11:00'), 'x', sid, { f_a: '막힘' })).toBe('');
        off();
        expect(reasons).toEqual(['막힌 칸 값입니다']);
        expect(count(sid)).toBe(0);
        const ok = createEvent(at('2026-11-20T10:00', '2026-11-20T11:00'), 'y', sid, { f_a: '열림' });
        expect(ok).not.toBe('');
        expect((getNodesApi()!.get(ok)!.data as { values: Record<string, unknown> }).values.f_a).toBe('열림');
    });
    it('길 2 칸 값 쓰기: setEventValue 도 훅을 지나 거절되면 쓰지 않는다', () => {
        registerPreset(VALUES_RULE);
        const sid = mkStore(VALUES_RULE.id);
        const id = createEvent(at('2026-11-20T10:00', '2026-11-20T11:00'), 'x', sid, { f_a: '열림' });
        const reasons: string[] = [];
        const off = onSaveRejected((r) => reasons.push(r));
        expect(setEventValue(id, 'f_a', '막힘')).toEqual({ ok: false, reason: '막힌 칸 값입니다' });
        off();
        expect(reasons).toEqual(['막힌 칸 값입니다']);
        expect(setEventValue(id, 'f_a', '또열림')).toEqual({ ok: true });
    });
    it('길 3 .ics 가져오기: 거절된 줄은 건너뛰고 사유를 모으며 건별 알림은 없다', () => {
        registerPreset(VALUES_RULE);
        const sid = mkStore(VALUES_RULE.id);
        const reasons: string[] = [];
        const off = onSaveRejected((r) => reasons.push(r));
        const item = (id: string, title: string) => ({ id, title, start: '2026-11-20T10:00', end: '2026-11-20T11:00', allDay: false });
        const r = importItemsToStore(sid, [item('u1', '막힘'), item('u2', '괜찮음'), item('u3', '막힘')]);
        off();
        expect(r).toEqual({ created: 1, skipped: 0, rejected: 2, reasons: ['막힌 이름입니다'] });
        expect(reasons).toEqual([]);
        expect(count(sid)).toBe(1);
        expect(importRejectedTitle(r.rejected, r.reasons)).toBe('2건 건너뜀 — 막힌 이름입니다');
    });
});
