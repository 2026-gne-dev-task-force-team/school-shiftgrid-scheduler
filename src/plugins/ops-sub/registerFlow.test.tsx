// @vitest-environment jsdom
/**
 * T-10fu — 빈 저장소에서 등록 → 목록에 보임 → 새로 읽어도 남음 · 등록에서 명단 사람 고르기. 시험 자료는 지어낸 이름만.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Staff } from '../staff/contracts/staff';
import { ListPanel } from './ListPanels';
import { RegisterView } from './RegisterPanel';
import { setSlotSource, subSlotSource, getViewer } from './list';
import { setStaffGetter } from './people';
import { setNodes, subApi } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface N { id: string; type: string; name: string; data: unknown; parent: string; trashed: boolean }
function world() {
    const map = new Map<string, N>();
    let seq = 0;
    const subs = new Set<() => void>();
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t && !n.trashed),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent, trashed: false }); subs.forEach((f) => f()); return id; },
        remove: (id: string) => { const n = map.get(id); if (n) n.trashed = true; subs.forEach((f) => f()); },
        batch: (fn: () => void) => fn(),
        subscribe: (fn: () => void) => { subs.add(fn); return { dispose: () => { subs.delete(fn); } }; },
    } as unknown as NodesApi;
    return { nodes, all: () => [...map.values()] };
}
const staff = {
    lists: () => [{ id: 'L', name: '가짜명단' }],
    staffIn: () => [{ id: 's1', listId: 'L', name: '가짜선생' }],
    member: (id: string) => (id === 's1' ? { id: 's1', listId: 'L', name: '가짜선생' } : undefined),
} as unknown as Staff;
const ctx = () => ({ projectId: getViewer().projectId ?? '', userId: 'u1', userName: '가짜올림', now: () => 'n', newId: () => 'id1' });
const D = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const initial = { date: D, start: '09:40', end: '10:20', trackName: '1-1', reason: '연수' };

beforeEach(() => { setNodes(null); setStaffGetter(() => null); });
afterEach(() => { document.body.innerHTML = ''; setNodes(null); setStaffGetter(() => null); });

const mount = async (el: React.ReactElement) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(el));
    return host;
};
const click = async (host: HTMLElement, label: string) => {
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label);
    await act(async () => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('빈 저장소에서 등록 → 목록', () => {
    it('이름을 적어 등록하면 판 노드가 첫 쓰기에 생기고 열려 있던 목록에 바로 보이며 새로 읽어도 남는다', async () => {
        const w = world(); setNodes(w.nodes); setSlotSource(subSlotSource(subApi));
        const list = await mount(createElement(ListPanel));
        expect(list.textContent).toContain('오늘 보결이 없습니다');
        expect(w.all()).toHaveLength(0);
        const reg = await mount(createElement(RegisterView, { ctx: ctx(), initial: { ...initial, absentName: '가나다' } }));
        await click(reg, '등록');
        expect(reg.textContent).toContain('등록됨');
        expect(w.all().filter((n) => n.type === 'ops-sub.board')).toHaveLength(1);
        expect(w.all().filter((n) => n.type === 'ops-sub.slot')).toHaveLength(1);
        expect(list.textContent).toContain('가나다');
        const again = await mount(createElement(ListPanel));
        expect(again.textContent).toContain('가나다');
    });
    it('명단이 있으면 빠지는 사람을 명단에서 고르고, 고른 사람의 id 가 줄에 든다', async () => {
        const w = world(); setNodes(w.nodes); setSlotSource(subSlotSource(subApi));
        setStaffGetter(() => staff);
        const reg = await mount(createElement(RegisterView, { ctx: ctx(), initial }));
        const sel = reg.querySelector('select') as HTMLSelectElement;
        expect([...sel.options].map((o) => o.textContent)).toContain('가짜선생');
        await act(async () => { sel.value = 's1'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
        await click(reg, '등록');
        const row = subApi.slotsOn(D)[0];
        expect(row.body.absentRef).toBe('s1');
        expect(row.body.absentName).toBe('가짜선생');
    });
});
