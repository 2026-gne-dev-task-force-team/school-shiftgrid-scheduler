// @vitest-environment jsdom
/**
 * 관계 칸 고르개의 캐스팅 — 「다른 목록에서」 후보(막힌 목록은 안 뜸) · 하나면 바로 · 여럿이면 고르기 · 비었으면 잇기/새로 만들어 잇기.
 *   노드 시스템은 가짜 · 남의 목록 쓰기는 kit 표(registerKit)로 가로챈다.
 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi, PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { CollectionKit } from '../contracts/collection';
import { initRecordNodes } from '../nodes';
import { registerKit } from '../kits';
import { RelationCell, RelationConfigEditor } from './relation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toRooms = [{ key: 'f_room', label: '칸', type: 'relation', config: { target: { kind: 'db', nodeId: 'rl' }, many: true } }];
const nodes: Record<string, { type: string; name: string; parent: string | null; data?: unknown }> = {
    rl: { type: 'rooms.list', name: '방 목록', parent: null },
    r1: { type: 'rooms.room', name: '1실', parent: 'rl' },
    r2: { type: 'rooms.room', name: '2실', parent: 'rl' },
    yl: { type: 'school.year', name: '학년도', parent: null, data: { fields: toRooms } },
    c1: { type: 'school.class', name: '1반', parent: 'yl', data: { values: { f_room: ['r1'] } } },
    c2: { type: 'school.class', name: '2반', parent: 'yl', data: { values: { f_room: ['r1', 'r2'] } } },
    c3: { type: 'school.class', name: '3반', parent: 'yl' },
    ol: { type: 'other.list', name: '딴 목록', parent: null, data: { fields: [] } },
    o1: { type: 'other.item', name: '딴 줄', parent: 'ol' },
};
const pub = (id: string): PublicNode => ({ id, type: nodes[id].type, name: nodes[id].name, children: [], data: nodes[id].data });
const pathOf = (id: string): string[] => (nodes[id] ? [...(nodes[id].parent ? pathOf(nodes[id].parent!) : []), id] : []);
const fake = {
    get: (id: string) => (nodes[id] ? pub(id) : undefined),
    isTrashed: () => false,
    path: pathOf,
    liveByType: (t: string) => Object.keys(nodes).filter((id) => nodes[id].type === t).map(pub),
    children: (id: string) => Object.keys(nodes).filter((k) => nodes[k].parent === id).map(pub),
    parent: (id: string) => nodes[id]?.parent ?? null,
    find: (pred: (n: PublicNode) => boolean) => Object.keys(nodes).map(pub).filter(pred),
    subscribe: () => ({ dispose() {} }),
} as unknown as NodesApi;

const setValue = vi.fn();
const addItem = vi.fn(() => 'rNew');
const kitCfg = (listType: string, itemType: string) => ({ listType, itemType, baseFields: [{ key: 'title', label: '이름', type: 'text' }] }) as unknown as CollectionKit['config'];
registerKit({ config: kitCfg('school.year', 'school.class'), setValue, addItem: vi.fn() });
registerKit({ config: kitCfg('rooms.list', 'rooms.room'), setValue: vi.fn(), addItem });

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; initRecordNodes(null); vi.clearAllMocks(); });

function open(onChange: (v: unknown) => void, rowId?: string) {
    initRecordNodes(fake);
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    const field = { key: 'f_room', label: '방', type: 'relation', config: toRooms[0].config };
    act(() => root!.render(h(RelationCell, { field, value: [], config: field.config, editable: true, onChange, rowId } as never)));
    act(() => (el.querySelector('[data-rv-relation]') as HTMLElement).click());
}
const pick = (sel: string) => act(() => (document.querySelector(`${sel} [role="menuitem"], ${sel} button`) as HTMLElement).click());

describe('관계 칸 고르개 — 캐스팅', () => {
    it('다른 목록 후보 — 관계 칸 있는 목록의 줄만 · 판정이 붙는다', () => {
        open(() => {});
        const kinds = [...document.querySelectorAll('[data-rv-rel-cast]')].map((e) => `${e.getAttribute('data-rv-rel-cast')}:${e.getAttribute('data-rv-rel-cast-kind')}`);
        expect(kinds).toEqual(['c1:direct', 'c2:pick', 'c3:empty']);
    });
    it('제 목록의 줄(같은 학년도 다른 반)은 제 칸 후보에서 빠진다', () => {
        open(() => {}, 'c1');
        expect(document.querySelectorAll('[data-rv-rel-cast]').length).toBe(0);
    });
    it('하나면 반 그대로 · 여럿이면 고른 것을 넣은 칸 값에', () => {
        const onChange = vi.fn();
        open(onChange);
        pick('[data-rv-rel-cast="c1"]');
        expect(onChange).toHaveBeenLastCalledWith(['c1']);
        pick('[data-rv-rel-cast="c2"]');
        expect(document.querySelector('[data-rv-rel-cast-step="pick"]')).not.toBeNull();
        pick('[data-rv-rel-cast-target="r2"]');
        expect(onChange).toHaveBeenLastCalledWith(['c2>r2']);
        expect(setValue).not.toHaveBeenCalled();
    });
    it('비었으면 있는 항목에 잇거나 새로 만들어 잇는다 — 그 줄 쪽 칸이 채워진다', () => {
        const onChange = vi.fn();
        open(onChange);
        pick('[data-rv-rel-cast="c3"]');
        pick('[data-rv-rel-cast-target="r2"]');
        expect(setValue).toHaveBeenLastCalledWith('c3', 'f_room', ['r2']);
        expect(onChange).toHaveBeenLastCalledWith(['c3']);
        pick('[data-rv-rel-cast="c3"]');
        pick('[data-rv-rel-cast-new]');
        expect(addItem).toHaveBeenCalledWith('rl', { title: '새 항목' });
        expect(setValue).toHaveBeenLastCalledWith('c3', 'f_room', ['rNew']);
    });
});

describe('관계 칸 설정 — 가리킬 컬렉션 후보', () => {
    it('defineCollection 으로 만든 목록 타입(방 목록)도 후보에 든다', () => {
        initRecordNodes(fake);
        const el = document.createElement('div');
        document.body.appendChild(el);
        root = createRoot(el);
        const field = { key: 'f_room', label: '방', type: 'relation', config: toRooms[0].config };
        act(() => root!.render(h(RelationConfigEditor, { field, onChange: () => {} } as never)));
        const labels = [...el.querySelectorAll('[data-rv-rel-target] option, select option')].map((o) => o.textContent);
        expect(labels).toContain('방 목록');
        expect(labels).toContain('학년도');
        expect(labels).not.toContain('딴 목록');
    });
});
