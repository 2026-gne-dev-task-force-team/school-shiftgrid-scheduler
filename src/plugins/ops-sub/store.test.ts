// @vitest-environment jsdom
/**
 * 보결 저장·사람 읽기·이사 시험(T-10fg R13) — 가짜 노드 세계(NodesApi 모양만) · 시험 자료는 지어낸 이름만.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Staff } from '../staff/contracts/staff';
import { opsSubPlugin } from './index';
import { LS_KEY, demoRows, subSlotSource } from './list/source';
import { getSlotSource, setSlotSource, localSlotSource } from './list/source';
import { isMoved, moveLocalSlots, runSlotMigration } from './migrate';
import { absentShown, isHomeroomRef, setStaffGetter, takerShown } from './people';
import { absentKindOf } from './detail/detail';
import { setNodes, subApi } from './store';

beforeEach(() => { localStorage.clear(); setNodes(null); setStaffGetter(() => null); });

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
const D = '2026-11-19';
const stash = () => localStorage.setItem(LS_KEY, JSON.stringify(demoRows(D)));

describe('등록 → 목록(노드 저장)', () => {
    it('저장한 줄이 약속 sub 로 읽히고 같은 열쇠는 지우고 새로 쓴다', async () => {
        const w = world(); setNodes(w.nodes);
        const src = subSlotSource(subApi);
        const [a] = demoRows(D);
        expect((await src.saveSlot(a, { ifMatch: null })).ok).toBe(true);
        expect((await src.loadSlots(D)).map((r) => r.id)).toEqual(['d1']);
        expect(subApi.slot('d1')?.body.absentName).toBe('가나다');
        expect((await src.saveSlot(a, { ifMatch: null })).ok).toBe(false); // 이미 있음
        expect((await src.saveSlot({ ...a, status: '확정' }, { ifMatch: a.updatedAt })).ok).toBe(true);
        expect((await src.loadSlots(D))[0].status).toBe('확정');
        expect(w.all().filter((n) => n.type === 'ops-sub.slot' && !n.trashed)).toHaveLength(1);
        expect((await src.deleteSlot(a, { ifMatch: 'x' })).ok).toBe(false);
        expect((await src.deleteSlot(a)).ok).toBe(true);
        expect(await src.loadSlots(D)).toEqual([]);
    });
    it('노드가 없으면 빈 목록 · 쓰기는 충돌', () => {
        expect(subApi.slotsOn(D)).toEqual([]);
        expect(subApi.save(demoRows(D)[0]).ok).toBe(false);
    });
});

describe('옛 기기 저장소 이사', () => {
    it('이사 전후 같은 값 · 옛 값은 남고 · 두 번 돌아도 같다', () => {
        const w = world(); setNodes(w.nodes); stash();
        const before = localStorage.getItem(LS_KEY);
        expect(moveLocalSlots(w.nodes, localStorage)).toMatchObject({ moved: 2, skipped: 0, done: false });
        expect(subApi.slotsOn(D)).toEqual(demoRows(D));
        expect(localStorage.getItem(LS_KEY)).toBe(before);
        expect(isMoved(localStorage)).toBe(true);
        expect(moveLocalSlots(w.nodes, localStorage)).toMatchObject({ moved: 0, done: true });
        expect(subApi.slotsOn(D)).toHaveLength(2);
    });
    it('표시를 못 써도 같은 id 는 건너뛴다', () => {
        const w = world(); setNodes(w.nodes); stash();
        const noMark = { getItem: (k: string) => localStorage.getItem(k), setItem: () => { throw new Error('막힘'); } };
        moveLocalSlots(w.nodes, noMark); const again = moveLocalSlots(w.nodes, noMark);
        expect(again).toMatchObject({ moved: 0, skipped: 2 });
        expect(subApi.slotsOn(D)).toHaveLength(2);
    });
    it('노드 약속이 꺼져 있으면 미루고 표시를 안 쓴다', () => {
        stash();
        expect(runSlotMigration(null, localStorage)).toBeNull();
        expect(isMoved(localStorage)).toBe(false);
    });
    it('옛 값이 없으면 데모 줄은 옮기지 않는다', () => {
        const w = world(); setNodes(w.nodes);
        expect(moveLocalSlots(w.nodes, localStorage)).toMatchObject({ moved: 0, skipped: 0 });
        expect(subApi.slotsOn(D)).toEqual([]);
    });
});

describe('사람 읽기(staff 약속)', () => {
    const staff = { member: (id: string) => (id === 's1' ? { id: 's1', listId: 'L', name: '가짜담임', kind: 'homeroom' } : id === 's2' ? { id: 's2', listId: 'L', name: '가짜전담', kind: 'subject' } : undefined) } as unknown as Staff;
    it('staff 가 꺼져 있으면 얼려 둔 이름 · 켜지면 명단 이름', () => {
        const b = { absentRef: 's1', absentName: '옛이름' };
        expect(absentShown(b)).toBe('옛이름');
        setStaffGetter(() => staff);
        expect(absentShown(b)).toBe('가짜담임');
        expect(absentShown({ absentRef: 'homeroom:1-1', absentName: '가나다' })).toBe('가나다');
        expect(takerShown({ takerRef: 's2', takerName: '' })).toBe('가짜전담');
        expect(takerShown({ takerRef: 'zz', takerName: '' })).toBe('알 수 없음');
    });
    it('담임 판정 — 반 참조이거나 명단 구분이 담임', () => {
        setStaffGetter(() => staff);
        expect(absentKindOf('homeroom:1-1')).toBe('담임');
        expect(absentKindOf('s1')).toBe('담임');
        expect(absentKindOf('s2')).toBe('지정');
        expect(isHomeroomRef('nobody')).toBe(false);
    });
});

describe('활성', () => {
    it('활성하면 창구가 노드로 바뀌고 옛 줄이 한 번 옮겨진다', async () => {
        const w = world(); stash();
        const mods: Record<string, unknown> = { nodes: w.nodes };
        const host = { modules: { use: (n: string) => mods[n] ?? null } } as unknown as PluginHost;
        const prev = getSlotSource();
        opsSubPlugin.lifecycle!.onActivate!(host);
        expect(await getSlotSource().loadSlots(D)).toHaveLength(2);
        opsSubPlugin.lifecycle!.onActivate!(host);
        expect(await getSlotSource().loadSlots(D)).toHaveLength(2);
        opsSubPlugin.lifecycle!.onDeactivate!();
        setSlotSource(prev ?? localSlotSource(() => []));
    });
    it('manifest 가 약속을 내고 쓰는 약속을 선언한다', () => {
        const m = opsSubPlugin.manifest;
        expect(m.provides).toEqual({ sub: '0.1.0' });
        expect(m.requires).toEqual({ nodes: '^0.1' });
        expect(m.supports).toEqual({ staff: '^0.1' });
        expect(opsSubPlugin.modules?.sub).toBe(subApi);
    });
});
