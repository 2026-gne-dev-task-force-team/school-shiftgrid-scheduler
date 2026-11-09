// @vitest-environment jsdom
/** P4 삭제 안전망 — 행·칸·선택지·보기를 지우면 「되돌리기」 알림이 뜨고, 되돌리면 원상(칸에 딸린 보기 정렬·필터·열 포함). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi, PublicNode } from '../../explorer/contracts/nodes';
import { DB_TYPE, ROW_TYPE, initRecordNodes, setActiveDb } from '../nodes';
import { blankDb, blankRow, newField } from '../schema';
import { DbView } from './DbView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; initRecordNodes(null); setActiveDb(null); });

interface N { id: string; type: string; name: string; data?: unknown; kids: string[]; trashedFrom?: string }

/** 되돌리기 더미까지 가진 메모리 가짜 — 가장 바깥 묶음 하나 = 더미 한 칸. */
function setup() {
    const doc = blankDb();
    const sel = { ...newField('select', '상태'), options: [{ value: 'a', label: '가' }, { value: 'b', label: '나' }] };
    const fields = [...doc.fields, sel];
    const view = { ...doc.views[0], sorts: [{ key: sel.key, dir: 'asc' as const }], columns: [...doc.views[0].columns, { key: sel.key, width: 120 }] };
    const dbDoc = { ...doc, fields, views: [view] };
    const nodes = new Map<string, N>();
    nodes.set('db1', { id: 'db1', type: DB_TYPE, name: '컬', data: dbDoc, kids: ['r1', 'r2', 'r3'] });
    for (const [i, t] of ['r1', 'r2', 'r3'].entries()) nodes.set(t, { id: t, type: ROW_TYPE, name: `행${i}`, data: blankRow({ [doc.titleKey]: `행${i}`, [sel.key]: 'a' }), kids: [] });
    nodes.set('trash', { id: 'trash', type: 'folder', name: '휴지통', kids: [] });
    const stack: string[] = [];
    let depth = 0;
    const subs = new Set<(ids: string[]) => void>();
    const parentOf = (id: string) => [...nodes.values()].find((n) => n.kids.includes(id))?.id ?? null;
    const pub = (n: N) => ({ id: n.id, type: n.type, name: n.name, data: n.data, children: n.kids, trashedFrom: n.trashedFrom }) as unknown as PublicNode;
    const snap = () => JSON.stringify([...nodes.entries()]);
    const restore = (s: string) => { nodes.clear(); for (const [k, v] of JSON.parse(s) as [string, N][]) nodes.set(k, v); };
    const fire = () => subs.forEach((f) => f([]));
    const api = {
        get: (id: string) => (nodes.has(id) ? pub(nodes.get(id)!) : undefined),
        children: (id: string) => (nodes.get(id)?.kids ?? []).map((c) => pub(nodes.get(c)!)),
        parent: parentOf, roots: { main: 'root', trash: 'trash' },
        byType: () => [pub(nodes.get('db1')!)], liveByType: () => [pub(nodes.get('db1')!)],
        isTrashed: (id: string) => parentOf(id) === 'trash',
        Frame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        subscribe: (fn: (ids: string[]) => void) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
        setData: (id: string, d: unknown) => { nodes.get(id)!.data = d; },
        rename: () => {}, setBody: () => {},
        remove: (id: string) => { const from = parentOf(id)!; nodes.get(from)!.kids = nodes.get(from)!.kids.filter((c) => c !== id); nodes.get(id)!.trashedFrom = from; nodes.get('trash')!.kids.push(id); },
        batch: (fn: () => void) => { const before = depth === 0 ? snap() : null; depth++; try { fn(); } finally { depth--; if (before !== null) { stack.push(before); fire(); } } },
        undoToken: () => stack.length,
        cmd: { undo: 'explorer.undo', redo: 'explorer.redo' },
    } as unknown as NodesApi;
    const notify = vi.fn();
    const undo = (n: { action?: { args?: { undoTop: number } } }) => { const t = n.action!.args!.undoTop; expect(t).toBe(stack.length); restore(stack.pop()!); fire(); };
    return { api, nodes, notify, undo, sel, doc };
}

function mount(s: ReturnType<typeof setup>) {
    initRecordNodes(s.api); setActiveDb('db1');
    hostEl = document.createElement('div'); document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    const host = { commands: { run: vi.fn() }, notify: s.notify } as never;
    act(() => { root!.render(<DbView host={host} peek={{} as never} leaf={{ id: 'L1' } as never} width={800} height={600} collapsed={false} />); });
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const click = (el: HTMLElement | null) => { act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const lastNote = (s: ReturnType<typeof setup>) => s.notify.mock.calls.at(-1)![0];

describe('컬렉션 삭제 안전망', () => {
    it('행 삭제 → 알림 「행 2개를 휴지통으로 옮겼습니다」 + 되돌리기 → 같은 자리로 돌아온다', () => {
        const s = setup(); mount(s);
        click(q('[data-rv-check="r1"]')); click(q('[data-rv-check="r3"]')); click(q('[data-rv-delete]'));
        expect(s.nodes.get('db1')!.kids).toEqual(['r2']);
        expect(lastNote(s).title).toBe('행 2개를 휴지통으로 옮겼습니다');
        s.undo(lastNote(s));
        expect(s.nodes.get('db1')!.kids).toEqual(['r1', 'r2', 'r3']);
    });
    it('칸 삭제 → 알림 + 되돌리기 → 칸·정렬·열이 함께 돌아온다', () => {
        const s = setup(); mount(s);
        click(q(`[data-rv-head-menu="${s.sel.key}"]`));
        const item = [...document.querySelectorAll('[role="menuitem"], button')].find((e) => e.textContent === '속성 삭제') as HTMLElement;
        click(item);
        const after = s.nodes.get('db1')!.data as { fields: unknown[]; views: { sorts: unknown[]; columns: unknown[] }[] };
        expect(after.fields).toHaveLength(1); expect(after.views[0].sorts).toHaveLength(0);
        expect(lastNote(s).title).toContain('속성 「상태」을 삭제했습니다');
        s.undo(lastNote(s));
        const back = s.nodes.get('db1')!.data as typeof after;
        expect(back.fields).toHaveLength(2); expect(back.views[0].sorts).toHaveLength(1);
        expect(back.views[0].columns).toHaveLength(2);
    });
});
