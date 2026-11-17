// @vitest-environment jsdom
/**
 * 근태 배정·예외 → 달력 프리셋 「근태」 이사 시험(R16 · T-10fr) — 이사 전후 같은 값 · 두 번 돌려도 같음 · 약속이 꺼져 있으면 미룸 · 옛 값은 그대로 ·
 *   창구가 달력에서 읽고 씀 · 마감된 달은 달력 쪽 저장도 막음. 가짜 호스트 · 시험 자료는 지어낸 것.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { opsAuxPlugin } from './index';
import { DUTY_MOVED_KEY, PRESET_ID, dutyBeforeSave, dutyPreset, moveDutyToCalendar, readDuty } from './duty';
import { runAuxMigration } from './boot';
import { withDuty } from './dutySource';
import { applyAuxOps, addDay, addExc, closeMonth } from './ops';
import { PART_KEY, demoAux, storageAuxSource } from './source';
import type { AuxPart } from './types';

afterEach(() => { document.body.innerHTML = ''; });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function world(opts: { calendar?: boolean } = {}) {
    const map = new Map<string, N>();
    let seq = 0;
    const subs = new Set<() => void>();
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        children: (id: string) => [...map.values()].filter((n) => n.parent === id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); subs.forEach((f) => f()); return id; },
        setData: (id: string, data: unknown) => { const n = map.get(id); if (n) n.data = data; },
        remove: (id: string) => { map.delete(id); },
        batch: (fn: () => void) => fn(),
        subscribe: (fn: () => void) => { subs.add(fn); return { dispose: () => { subs.delete(fn); } }; },
    };
    const presets: string[] = [];
    const calendar = {
        registerPreset: (p: { id: string }) => { presets.push(p.id); return { dispose: () => undefined }; },
        newPresetStore: (preset: string) => nodes.create('root', { type: 'calendar.store', name: '근태 배정', data: { preset } }),
    };
    const mods: Record<string, unknown> = { nodes, ...(opts.calendar === false ? {} : { calendar }) };
    const kv = new Map<string, unknown>();
    const storage = { get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); }, remove: (k: string) => { kv.delete(k); } };
    const host = { modules: { use: (n: string) => mods[n] ?? null }, storage, workspace: { open: () => undefined } } as unknown as PluginHost;
    return { host, kv, nodes, calendar, presets, events: () => [...map.values()].filter((n) => n.type === 'calendar.event'), stores: () => [...map.values()].filter((n) => n.type === 'calendar.store') };
}

const withData = (): AuxPart => ({
    ...demoAux(),
    day: [{ id: 'd1', staffId: 's1', date: '2026-11-19', startMin: 540, endMin: 580, classKey: '1-1', source: 'manual' }],
    exceptions: [{ id: 'x1', staffId: 's1', date: '2026-11-18', kind: '지각', amount: -10, note: '' }, { id: 'x2', staffId: 's1', date: '2026-10-05', kind: '정정', amount: 30, note: '사유 있음' }],
});
const stash = (w: ReturnType<typeof world>, p: AuxPart = withData()) => w.kv.set(PART_KEY, structuredClone(p));
const noLegacy = { getItem: () => null };

describe('근태 배정·예외 이사', () => {
    it('옛 배정·예외가 달력 일정으로 같은 값으로 옮겨지고 옛 값은 그대로 · 표시가 선다', () => {
        const w = world(); stash(w);
        const before = JSON.stringify(w.kv.get(PART_KEY));
        runAuxMigration(w.host, noLegacy);
        expect(w.stores()).toHaveLength(1);
        expect((w.stores()[0].data as { preset: string }).preset).toBe(PRESET_ID);
        expect(w.events()).toHaveLength(3);
        const got = readDuty(w.nodes as never)!;
        expect(got.day).toEqual(withData().day);
        expect(got.exceptions).toEqual(withData().exceptions);
        expect(JSON.stringify(w.kv.get(PART_KEY))).toBe(before);
        expect(w.kv.get(DUTY_MOVED_KEY)).toEqual({ moved: 3 });
    });
    it('두 번 돌려도 같다 · 표시를 지워도 겹쳐 만들지 않는다', () => {
        const w = world(); stash(w);
        runAuxMigration(w.host, noLegacy);
        runAuxMigration(w.host, noLegacy);
        expect(w.events()).toHaveLength(3);
        w.kv.delete(DUTY_MOVED_KEY);
        expect(moveDutyToCalendar({ calendar: w.calendar as never, nodes: w.nodes as never }, w.host.storage, withData())).toMatchObject({ moved: 0 });
        expect(w.events()).toHaveLength(3);
    });
    it('달력이 꺼져 있으면 미루고 표시도 안 쓴다 · 켜지면 옮긴다', () => {
        const w = world({ calendar: false }); stash(w);
        runAuxMigration(w.host, noLegacy);
        expect(w.events()).toHaveLength(0);
        expect(w.kv.has(DUTY_MOVED_KEY)).toBe(false);
        const w2 = world(); stash(w2);
        runAuxMigration(w2.host, noLegacy);
        expect(w2.kv.get(DUTY_MOVED_KEY)).toEqual({ moved: 3 });
    });
    it('옮길 게 없으면 저장소를 만들지 않고 표시만 쓴다', () => {
        const w = world(); stash(w, demoAux());
        runAuxMigration(w.host, noLegacy);
        expect(w.stores()).toHaveLength(0);
        expect(w.kv.get(DUTY_MOVED_KEY)).toEqual({ moved: 0 });
    });
});

describe('창구가 달력에서 읽고 쓴다', () => {
    const viewer = { userId: 'u', roles: ['근태담당' as const] };
    it('이사 뒤 배정을 넣으면 달력 일정으로 가고 옛 호스트 저장의 배정은 안 바뀐다 · 빼면 일정이 사라진다', async () => {
        const w = world(); stash(w);
        runAuxMigration(w.host, noLegacy);
        const src = withDuty(storageAuxSource(w.host.storage as never, demoAux), w.host.modules);
        const loaded = await src.load();
        expect(loaded.day).toHaveLength(1);
        const r = applyAuxOps(viewer, loaded, [addDay({ id: 'd2', staffId: 's1', date: '2026-11-20', startMin: 540, endMin: 580, classKey: '', source: 'manual' })], () => []);
        expect(r.errors).toEqual([]);
        await src.save(r.next);
        expect(w.events()).toHaveLength(4);
        expect((await src.load()).day.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
        expect((w.kv.get(PART_KEY) as AuxPart).day.map((d) => d.id)).toEqual(['d1']);
        await src.save({ ...(await src.load()), day: [] });
        expect(w.events()).toHaveLength(2);
    });
    it('저장소가 없으면(이사 전) 옛 창구가 그대로 읽고 쓴다', async () => {
        const w = world(); stash(w);
        const src = withDuty(storageAuxSource(w.host.storage as never, demoAux), w.host.modules);
        expect((await src.load()).day).toHaveLength(1);
        await src.save({ ...(await src.load()), day: [], exceptions: [] });
        expect((w.kv.get(PART_KEY) as AuxPart).day).toHaveLength(0);
    });
    it('월 마감된 달은 applyAuxOps 가 막는다(409) · 정정 예외 추가는 통과', async () => {
        const w = world(); stash(w);
        runAuxMigration(w.host, noLegacy);
        const src = withDuty(storageAuxSource(w.host.storage as never, demoAux), w.host.modules);
        const close = applyAuxOps(viewer, await src.load(), [closeMonth({ id: 's1:2026-11', staffId: 's1', ym: '2026-11' })], () => []);
        await src.save(close.next);
        const r = applyAuxOps(viewer, await src.load(), [addDay({ id: 'd9', staffId: 's1', date: '2026-11-25', startMin: 540, endMin: 580, classKey: '', source: 'manual' })], () => []);
        expect(r.status).toBe(409);
        const ok = applyAuxOps(viewer, await src.load(), [addExc({ id: 'x9', staffId: 's1', date: '2026-11-25', kind: '정정', amount: 5, note: '사유' })], () => []);
        expect(ok.errors).toEqual([]);
    });
});

describe('달력 쪽 저장 전 검사(beforeSave)', () => {
    const ctx = (kind: 'create' | 'update' | 'move') => ({ kind, storeId: 's', now: '2026-11-17T09:00', others: () => [], storeData: {} });
    const draft = (values: Record<string, unknown>, start = '2026-11-20T09:00') => ({ name: 'a', start, end: start, allDay: false, memo: '', values });
    const check = dutyBeforeSave(() => [{ staffId: 's1', ym: '2026-11' }]);
    it('마감된 달의 배정은 만들기·고치기·옮기기 모두 거절', () => {
        for (const k of ['create', 'update', 'move'] as const) {
            expect(check(draft({ f_type: '배정', f_staff: 's1' }), ctx(k))).toMatchObject({ ok: false });
        }
    });
    it('마감된 달의 예외는 정정 만들기만 통과', () => {
        expect(check(draft({ f_type: '예외', f_staff: 's1', f_exkind: '정정' }), ctx('create'))).toEqual({ ok: true });
        expect(check(draft({ f_type: '예외', f_staff: 's1', f_exkind: '정정' }), ctx('update'))).toMatchObject({ ok: false });
        expect(check(draft({ f_type: '예외', f_staff: 's1', f_exkind: '지각' }), ctx('create'))).toMatchObject({ ok: false });
    });
    it('다른 보조·다른 달은 통과', () => {
        expect(check(draft({ f_type: '배정', f_staff: 's2' }), ctx('create'))).toEqual({ ok: true });
        expect(check(draft({ f_type: '배정', f_staff: 's1' }, '2026-12-01T09:00'), ctx('create'))).toEqual({ ok: true });
    });
    it('프리셋이 beforeSave 를 들고 있고 manifest 가 calendar 를 선언한다', () => {
        expect(typeof dutyPreset(() => []).beforeSave).toBe('function');
        expect(opsAuxPlugin.manifest.supports).toMatchObject({ calendar: '^0.2' });
    });
    it('플러그인을 켜면 프리셋이 등록된다', () => {
        const w = world();
        const life = (opsAuxPlugin as unknown as { lifecycle: { onActivate(h: PluginHost): void; onDeactivate(): void } }).lifecycle;
        life.onActivate(w.host);
        expect(w.presets).toContain(PRESET_ID);
        life.onDeactivate();
    });
});
