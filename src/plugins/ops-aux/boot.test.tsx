// @vitest-environment jsdom
/**
 * 기동 때 이사 시험(T-10f7) — 활성하면 옛 명부가 교직원 명단으로 옮겨지고 · staff 가 꺼져 있으면 미루고 · 두 번 돌아도 같고 ·
 *   월 정산 화면이 옮긴 값(이름)을 staff 약속에서 읽는다(옛 명부가 비어도 이름이 id 로 안 보임). 가짜 호스트 · 지어낸 이름만.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Staff, StaffMember } from '../staff/contracts/staff';
import { opsAuxPlugin } from './index';
import { initAuxMigration, runAuxMigration } from './boot';
import { LS_KEY, movedKeyOf } from './migrate';
import { MonthView } from './month/MonthPanel';
import { demoAux, memoryAuxSource } from './source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function world(staffOn = true) {
    const map = new Map<string, N>();
    let seq = 0;
    const subs = new Set<() => void>();
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); return id; },
        batch: (fn: () => void) => fn(),
        subscribe: (fn: () => void) => { subs.add(fn); return { dispose: () => { subs.delete(fn); } }; },
    };
    const staff = {
        lists: () => [...map.values()].filter((n) => n.type === 'staff.list').map((n) => ({ id: n.id, name: n.name })),
        staffIn: (listId: string): StaffMember[] => [...map.values()].filter((n) => n.type === 'staff.member' && n.parent === listId).map((n) => {
            const v = (n.data as { values: Record<string, unknown> }).values;
            const fields: Record<string, unknown> = {};
            for (const [k, x] of Object.entries(v)) if (!['f_kind', 'memo'].includes(k) && !(x == null || x === '' || (Array.isArray(x) && x.length === 0))) fields[k] = x;
            return { id: n.id, listId, name: n.name, kind: v.f_kind as string, ...(Object.keys(fields).length ? { fields } : {}) };
        }),
        onChange: () => ({ dispose() { /* 가짜 */ } }),
    } as unknown as Staff;
    const mods: Record<string, unknown> = { nodes, ...(staffOn ? { staff } : {}) };
    const host = { modules: { use: (n: string) => mods[n] ?? null } } as unknown as PluginHost;
    return { host, staff, members: () => [...map.values()].filter((n) => n.type === 'staff.member'), mods, fire: () => subs.forEach((f) => f()) };
}

describe('근태 — 기동 때 이사', () => {
    it('활성하면 옛 명부가 교직원 명단으로 옮겨지고 옛 값은 그대로 · 표시가 선다', () => {
        const part = JSON.stringify(demoAux());
        localStorage.setItem(LS_KEY, part);
        const w = world();
        opsAuxPlugin.lifecycle!.onActivate!(w.host);
        expect(w.members()).toHaveLength(2);
        expect(localStorage.getItem(LS_KEY)).toBe(part);
        expect(localStorage.getItem(movedKeyOf())).not.toBeNull();
        opsAuxPlugin.lifecycle!.onDeactivate!();
    });
    it('staff 가 꺼져 있으면 미루고 표시도 안 쓴다 — 켜진 뒤 한 번 돌고 두 번째는 건너뛴다', () => {
        localStorage.setItem(LS_KEY, JSON.stringify(demoAux()));
        expect(runAuxMigration(world(false).host)).toBeNull();
        expect(localStorage.getItem(movedKeyOf())).toBeNull();
        const on = world();
        expect(runAuxMigration(on.host)).toBe(2);
        expect(runAuxMigration(on.host)).toBeNull();
        expect(on.members()).toHaveLength(2);
    });
    it('노드가 바뀔 때 다시 시도한다 — staff 가 늦게 켜져도 따라잡는다', () => {
        localStorage.setItem(LS_KEY, JSON.stringify(demoAux()));
        const w = world();
        const staffMod = w.mods.staff;
        delete w.mods.staff;
        const d = initAuxMigration(w.host);
        expect(w.members()).toHaveLength(0);
        w.mods.staff = staffMod;
        w.fire();
        expect(w.members()).toHaveLength(2);
        d.dispose();
    });
});

describe('월 정산 화면 — 이름을 staff 약속으로', () => {
    it('옛 명부가 비어도 옮긴 명단의 이름이 뜬다(id 로 안 보임)', async () => {
        localStorage.setItem(LS_KEY, JSON.stringify(demoAux()));
        const w = world();
        runAuxMigration(w.host);
        const src = memoryAuxSource({ ...demoAux(), staff: [] });
        const el = document.createElement('div');
        document.body.appendChild(el);
        await act(async () => createRoot(el).render(createElement(MonthView, { source: src, staff: w.staff, viewer: { userId: 'u', role: '근태담당' }, initialYm: '2026-10' })));
        expect(el.textContent).toContain('강사01 근무');
        expect(el.textContent).not.toContain('s1 근무');
    });
});
