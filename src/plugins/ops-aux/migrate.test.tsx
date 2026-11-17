// @vitest-environment jsdom
/**
 * 보조 인력 명부 → 교직원 명단 이사 시험(R15) — 이사 전후 같은 값 · 두 번 돌려도 같음 · 옛 값은 안 지움 · 근태 화면이 staff 로 읽음.
 *   노드·staff 는 손으로 만든 가짜(약속 모양만) — 시험 자료는 지어낸 이름만.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Staff, StaffMember } from '../staff/contracts/staff';
import { AuxView } from './AuxPanel';
import { AUX_LIST_NAME, LS_KEY, STAFF_MOVED_KEY, auxStaffOf, migrateAuxStaffToStaff, moveLocalAuxStaff, readAuxStaff } from './migrate';
import { demoAux, memoryAuxSource } from './source';
import type { AuxStaff } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function fakeNodes() {
    const map = new Map<string, N>();
    let seq = 0;
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); return id; },
        batch: (fn: () => void) => fn(),
    } as unknown as NodesApi;
    /** staff 약속 모양 — 노드 칸 값을 약속의 읽기 꼴(kind·fields)로 바꾼다(staff/api.ts 의 toMember 와 같은 규칙). */
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
    return { nodes, staff, members: () => [...map.values()].filter((n) => n.type === 'staff.member') };
}
const rows = (): AuxStaff[] => [
    { id: 's1', name: '강사01', kind: '기초학력', unit: 'clock', active: true, allowedActivities: ['국어', '수학'], targetTracks: ['1-1'] },
    { id: 's2', name: '튜터01', kind: '디지털튜터', unit: 'period', active: false, allowedActivities: [], targetTracks: [] },
];

describe('명부 이사 — 이사 전후 같은 값', () => {
    it('옮긴 뒤 staff 로 읽으면 옛 명부와 똑같다(id·이름·세부·단위·쉼·허용 교과·대상 반)', () => {
        const w = fakeNodes();
        expect(migrateAuxStaffToStaff(w.nodes, rows())).toBe(2);
        expect(readAuxStaff(w.staff)).toEqual(rows());
        expect(w.staff.lists().map((l) => l.name)).toEqual([AUX_LIST_NAME]);
        expect(w.staff.staffIn(w.staff.lists()[0].id).every((m) => m.kind === 'assistant')).toBe(true);
    });
    it('구분이 보조인력이 아닌 교직원은 근태 명부에 안 섞인다', () => {
        const m: StaffMember = { id: 'm1', listId: 'L', name: '교사01', kind: 'homeroom' };
        expect(auxStaffOf(m)).toBeUndefined();
        expect(auxStaffOf({ ...m, kind: 'assistant' })).toMatchObject({ id: 'm1', kind: '기타', unit: 'period', active: true });
    });
});

describe('두 번 돌려도 같음 · 옛 값은 지우지 않음', () => {
    it('두 번째는 0 이고 사람 수는 그대로', () => {
        const w = fakeNodes();
        migrateAuxStaffToStaff(w.nodes, rows());
        expect(migrateAuxStaffToStaff(w.nodes, rows())).toBe(0);
        expect(w.members()).toHaveLength(2);
        expect(readAuxStaff(w.staff)).toEqual(rows());
    });
    it('옛 명부가 늘면 새 사람만 더한다', () => {
        const w = fakeNodes();
        migrateAuxStaffToStaff(w.nodes, rows());
        expect(migrateAuxStaffToStaff(w.nodes, [...rows(), { ...rows()[0], id: 's3', name: '강사03' }])).toBe(1);
        expect(w.members()).toHaveLength(3);
    });
    it('staff 가 꺼져 있으면 아무것도 안 하고 0', () => {
        const w = fakeNodes();
        expect(migrateAuxStaffToStaff(w.nodes, rows(), () => false)).toBe(0);
        expect(w.members()).toHaveLength(0);
    });
    const marks = () => { const kv = new Map<string, unknown>(); return { kv, get: <T,>(k: string, f: T) => (kv.has(k) ? kv.get(k) as T : f), set: (k: string, v: unknown) => { kv.set(k, structuredClone(v)); } }; };
    it('localStorage 옛 값은 그대로 두고 표시는 호스트 저장에만 더한다 · 다시 돌려도 같다', () => {
        const part = JSON.stringify(demoAux());
        localStorage.setItem(LS_KEY, part);
        const w = fakeNodes();
        const m = marks();
        expect(moveLocalAuxStaff(w.nodes, localStorage, m)).toBe(2);
        expect(localStorage.getItem(LS_KEY)).toBe(part);
        expect(localStorage.length).toBe(1);
        expect(m.kv.get(STAFF_MOVED_KEY)).toEqual({ staff: 2 });
        expect(moveLocalAuxStaff(w.nodes, localStorage, m)).toBe(0);
        expect(readAuxStaff(w.staff).map((s) => s.id)).toEqual(['s1', 's2']);
    });
    it('저장된 값이 깨졌어도 던지지 않는다', () => {
        localStorage.setItem(LS_KEY, '{깨짐');
        expect(moveLocalAuxStaff(fakeNodes().nodes, localStorage, marks())).toBe(0);
    });
});

describe('근태 화면 — staff 약속으로 읽는 보기', () => {
    const mount = async (props: Parameters<typeof AuxView>[0]) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AuxView, props)));
        return host;
    };
    it('staff 의 보조인력으로 명부·배정 판정이 같게 뜨고, 명부 고치기 단추는 감춘다', async () => {
        const w = fakeNodes();
        migrateAuxStaffToStaff(w.nodes, demoAux().staff);
        const src = memoryAuxSource({ ...demoAux(), staff: [] }); // 옛 명부는 비어도 staff 에서 읽는다
        const host = await mount({ source: src, staff: w.staff, viewer: { userId: 'u-a', roles: ['근태담당'] }, initialDate: '2026-11-19' });
        expect(host.textContent).toContain('명부 2명');
        expect(host.textContent).toContain('강사01 → 1-1');
        expect(host.textContent).toContain('교직원 명단');
        expect([...host.querySelectorAll('button')].some((b) => /쉬게 하기|명부에 넣기/.test(b.textContent ?? ''))).toBe(false);
    });
    it('staff 에 보조인력이 없으면 옛 명부 그대로(고치기 단추도 그대로)', async () => {
        const w = fakeNodes();
        const host = await mount({ source: memoryAuxSource(demoAux()), staff: w.staff, viewer: { userId: 'u-a', roles: ['근태담당'] }, initialDate: '2026-11-19' });
        expect(host.textContent).toContain('명부 2명');
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === '명부에 넣기')).toBe(true);
    });
});
