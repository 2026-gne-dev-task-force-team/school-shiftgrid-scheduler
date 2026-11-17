// @vitest-environment jsdom
/**
 * 학사 → 달력 프리셋 「학사」 이사 시험(T-10fb) — 이사 전후 같은 값 · 두 번 돌려도 같음 · 약속이 꺼져 있으면 미룸 · 옛 값은 그대로 · 보기가 달력에서 읽음.
 *   가짜 호스트(약속 모양만) · 시험 자료는 지어낸 것.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { opsDaysPlugin } from './index';
import { ACADEMIC_PRESET, KIND_FIELD, LS_KEY, PRESET_ID, TTCHANGE_FIELD, isMoved, movedKeyOf, readAcademic } from './academic';
import { initDaysMigration, runDaysMigration } from './boot';
import { DaysView, resetDaysTab } from './DaysPanel';
import { demoDays } from './source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; resetDaysTab(); });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function world(opts: { calendar?: boolean } = {}) {
    const map = new Map<string, N>();
    let seq = 0;
    const subs = new Set<() => void>();
    const presets: string[] = [];
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        children: (id: string) => [...map.values()].filter((n) => n.parent === id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); subs.forEach((f) => f()); return id; },
        batch: (fn: () => void) => fn(),
        subscribe: (fn: () => void) => { subs.add(fn); return { dispose: () => { subs.delete(fn); } }; },
        open: () => undefined,
    };
    const calendar = {
        registerPreset: (p: { id: string }) => { presets.push(p.id); return { dispose: () => undefined }; },
        newPresetStore: (preset: string) => nodes.create('root', { type: 'calendar.store', name: '학사 일정', data: { preset } }),
        occurrences: (storeId: string, from: string, to: string) => [...map.values()].filter((n) => n.type === 'calendar.event' && n.parent === storeId)
            .map((n) => { const w = (n.data as { values: { when: { start: string; end?: string } } }).values.when; const start = `${w.start}T00:00`; return { eventId: n.id, start, end: `${w.end ?? w.start}T23:59` }; })
            .filter((o) => o.start < to && from < o.end),
    };
    const mods: Record<string, unknown> = { nodes, ...(opts.calendar === false ? {} : { calendar }) };
    const kv = new Map<string, unknown>();
    const storage = { get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); }, remove: (k: string) => { kv.delete(k); } };
    const host = { modules: { use: (n: string) => mods[n] ?? null }, storage, workspace: { open: () => undefined } } as unknown as PluginHost;
    return { host, kv, nodes, calendar, presets, events: () => [...map.values()].filter((n) => n.type === 'calendar.event'), stores: () => [...map.values()].filter((n) => n.type === 'calendar.store') };
}
const stash = () => localStorage.setItem(LS_KEY, JSON.stringify(demoDays()));

describe('학사 이사', () => {
    it('옛 일정·변경이 달력 일정으로 같은 값으로 옮겨지고 옛 값은 그대로 · 옮김 표시가 선다', () => {
        stash();
        const before = localStorage.getItem(LS_KEY);
        const w = world();
        expect(runDaysMigration(w.host)).toMatchObject({ moved: 3 });
        expect(w.stores()).toHaveLength(1);
        expect((w.stores()[0].data as { preset: string }).preset).toBe(PRESET_ID);
        const ev = w.events().map((e) => ({ name: e.name, v: (e.data as { values: Record<string, unknown> }).values }));
        expect(ev.find((e) => e.name === '개교기념일')?.v).toMatchObject({ when: { start: '2026-11-16' }, [KIND_FIELD]: '휴업', [TTCHANGE_FIELD]: false });
        expect(ev.find((e) => e.name === '가을 체험학습')?.v).toMatchObject({ when: { start: '2026-11-19', end: '2026-11-20' }, [KIND_FIELD]: '행사' });
        expect(ev.find((e) => e.name === '3-2 4교시 체육')?.v).toMatchObject({ when: { start: '2026-11-17' }, [KIND_FIELD]: '수업변경', [TTCHANGE_FIELD]: true, f_grade: ['3'] });
        expect(localStorage.getItem(LS_KEY)).toBe(before);
        expect(isMoved(localStorage)).toBe(true);
    });
    it('두 번 돌려도 같다 · 표시를 지워도 겹쳐 만들지 않는다', () => {
        stash();
        const w = world();
        runDaysMigration(w.host);
        expect(runDaysMigration(w.host)).toBeNull();
        localStorage.removeItem(movedKeyOf());
        expect(runDaysMigration(w.host)).toMatchObject({ moved: 0 });
        expect(w.events()).toHaveLength(3);
        expect(w.stores()).toHaveLength(1);
    });
    it('달력 약속이 꺼져 있으면 미루고 표시도 안 쓴다 — 켜진 뒤 돈다', () => {
        stash();
        const off = world({ calendar: false });
        expect(runDaysMigration(off.host)).toBeNull();
        expect(off.events()).toHaveLength(0);
        expect(localStorage.getItem(movedKeyOf())).toBeNull();
        expect(runDaysMigration(world().host)).toMatchObject({ moved: 3 });
    });
    it('활성하면 프리셋을 등록하고 이사한다 · 프리셋 칸은 종류·대상 학년·시간표 변경', () => {
        stash();
        const w = world();
        opsDaysPlugin.lifecycle!.onActivate!(w.host);
        expect(w.presets).toEqual([PRESET_ID]);
        expect(w.events()).toHaveLength(3);
        opsDaysPlugin.lifecycle!.onDeactivate!();
        expect((ACADEMIC_PRESET.baseFields as { label: string }[]).map((f) => f.label)).toEqual(['종류', '대상 학년', '시간표 변경']);
    });
    it('옛 값이 없으면 저장소를 만들지 않고 표시만 쓴다', () => {
        const w = world();
        const d = initDaysMigration(w.host);
        expect(w.stores()).toHaveLength(0);
        expect(isMoved(localStorage)).toBe(true);
        d.dispose();
    });
});

describe('학사 보기 — 달력에서 읽는다', () => {
    it('이사 전후 같은 목록이 보인다(옛 자료 보기 = 달력 보기)', async () => {
        stash();
        const w = world();
        expect(readAcademic(w.calendar as never, w.nodes as never, '2026-11')).toBeNull(); // 이사 전: 옛 자료로 본다
        runDaysMigration(w.host);
        const rows = readAcademic(w.calendar as never, w.nodes as never, '2026-11')!;
        expect(rows.map((r) => `${r.date} ${r.kind} ${r.name}`)).toEqual(['2026-11-16 휴업 개교기념일', '2026-11-17 수업변경 3-2 4교시 체육', '2026-11-19 행사 가을 체험학습']);
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { host: w.host, viewer: { userId: 'u-a', roles: ['교사'] }, initialMonth: '2026-11' })));
        expect(host.textContent).toContain('[휴업] 개교기념일');
        expect(host.textContent).toContain('학사 일정 2건');
        expect(host.textContent).toContain('시간표 변경 1건');
        expect(host.textContent).toContain('3-2 4교시 체육');
    });
});
