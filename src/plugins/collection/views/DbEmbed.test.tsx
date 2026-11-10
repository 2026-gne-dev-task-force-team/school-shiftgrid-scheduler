// @vitest-environment jsdom
/** R3-E 컬렉션 끼워 넣기 — 기본은 링크 한 줄 · view 'inline' 이면 표가 그 자리에서 보이고, 거기서 고치면 원본 노드가 바뀐다. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { NodesApi, PublicNode } from '../../explorer/contracts/nodes';
import { DB_TYPE, ROW_TYPE, initRecordNodes, recordNodeTypeImpl } from '../nodes';
import { blankDb, blankRow } from '../schema';
import { DbEmbed } from './DbEmbed';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; el = null; initRecordNodes(null); });

interface N { id: string; type: string; name: string; data?: unknown; kids: string[] }
function setup() {
    const doc = blankDb();
    const nodes = new Map<string, N>();
    nodes.set('db1', { id: 'db1', type: DB_TYPE, name: '명단', data: doc, kids: ['r1'] });
    nodes.set('r1', { id: 'r1', type: ROW_TYPE, name: '첫 줄', data: blankRow({ [doc.titleKey]: '첫 줄' }), kids: [] });
    nodes.set('trash', { id: 'trash', type: 'folder', name: '', kids: [] });
    const subs = new Set<(ids: string[]) => void>();
    const fire = () => subs.forEach((f) => f([]));
    const parentOf = (id: string) => [...nodes.values()].find((n) => n.kids.includes(id))?.id ?? null;
    const pub = (n: N) => ({ id: n.id, type: n.type, name: n.name, data: n.data, children: n.kids }) as unknown as PublicNode;
    let seq = 0;
    const opened: string[] = [];
    const api = {
        get: (id: string) => (nodes.has(id) ? pub(nodes.get(id)!) : undefined),
        children: (id: string) => (nodes.get(id)?.kids ?? []).map((c) => pub(nodes.get(c)!)),
        parent: parentOf, roots: { main: 'root', trash: 'trash' },
        isTrashed: (id: string) => parentOf(id) === 'trash',
        subscribe: (fn: (ids: string[]) => void) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
        setData: (id: string, d: unknown) => { nodes.get(id)!.data = d; },
        rename: (id: string, name: string) => { nodes.get(id)!.name = name; },
        create: (parent: string, spec: { type: string; name: string; data?: unknown }) => { const id = `new${++seq}`; nodes.set(id, { id, type: spec.type, name: spec.name, data: spec.data, kids: [] }); nodes.get(parent)!.kids.push(id); return id; },
        batch: (fn: () => void) => { fn(); fire(); },
        open: (id: string) => { opened.push(id); },
    } as unknown as NodesApi;
    return { api, nodes, opened };
}
function mount(view?: string) {
    el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    const host = { commands: { run() {} }, notify() {} } as never;
    act(() => { root!.render(<DbEmbed nodeId="db1" view={view} host={host} />); });
}

describe('DbEmbed', () => {
    it('컬렉션 노드 타입이 embed 로 DbEmbed 를 낸다(nodes.Embed 창구)', () => {
        expect(recordNodeTypeImpl.db.embed).toBe(DbEmbed);
    });
    it('view 없음 = 링크 한 줄(표 없음) · 누르면 연다', () => {
        const s = setup(); initRecordNodes(s.api); mount();
        expect(el!.querySelector('[data-rv-root]')).toBeNull();
        expect(el!.textContent).toContain('명단');
        act(() => { (el!.firstElementChild as HTMLElement).click(); });
        expect(s.opened).toEqual(['db1']);
    });
    it('view inline = 표가 그 자리에 · 「새로 만들기」로 더한 줄이 원본 컬렉션 노드 밑에 생긴다', () => {
        const s = setup(); initRecordNodes(s.api); mount('inline');
        expect(el!.querySelector('[data-db-inline="db1"] [data-rv-root]')).toBeTruthy();
        expect(el!.textContent).toContain('첫 줄');
        act(() => { (el!.querySelector('[data-rv-add]') as HTMLElement).click(); });
        expect(s.nodes.get('db1')!.kids.length).toBe(2);
        expect(el!.querySelector('[data-rv-row="new1"]')).toBeTruthy();   // 같은 노드 — 끼운 자리 표에도 바로 보인다
    });
});
