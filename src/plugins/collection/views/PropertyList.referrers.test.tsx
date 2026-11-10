// @vitest-environment jsdom
/**
 * 속성 목록의 「나를 가리키는 것」 — 역참조 칩(반 경유 포함 · 여럿 그대로 · 비었으면 안 보인다).
 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { NodesApi, PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { initRecordNodes } from '../nodes';
import { PropertyList } from './PropertyList';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toRooms = [{ key: 'f_room', label: '교실', type: 'relation', config: { target: { kind: 'db', nodeId: 'rl' }, many: true } }];
const nodes: Record<string, { type: string; name: string; parent: string | null; data?: unknown }> = {
    rl: { type: 'rooms.list', name: '방 목록', parent: null },
    r1: { type: 'rooms.room', name: '1실', parent: 'rl' },
    r2: { type: 'rooms.room', name: '2실', parent: 'rl' },
    yl: { type: 'school.year', name: '학년도', parent: null, data: { fields: toRooms } },
    c1: { type: 'school.class', name: '1반', parent: 'yl', data: { values: { f_room: ['r1'] } } },
    bs: { type: 'cal.store', name: '예약', parent: null, data: { fields: toRooms } },
    b1: { type: 'cal.ev', name: '가 예약', parent: 'bs', data: { values: { f_room: ['c1'] } } },   // 반 경유
    b2: { type: 'cal.ev', name: '나 예약', parent: 'bs', data: { values: { f_room: ['r1'] } } },
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

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; initRecordNodes(null); });
function show(rowId: string) {
    initRecordNodes(fake);
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(h(PropertyList, { fields: [], values: {}, rowId })));
    return el;
}

describe('역참조 표시', () => {
    it('방: 직접 가리키는 줄 + 반을 거쳐 가리키는 줄이 여럿 그대로 칩으로 뜬다', () => {
        const el = show('r1');
        expect([...el.querySelectorAll('[data-rv-referrer]')].map((e) => e.getAttribute('data-rv-referrer')).sort()).toEqual(['b1', 'b2', 'c1']);
    });
    it('가리키는 줄이 없으면 아무것도 안 보인다', () => {
        expect(show('r2').querySelector('[data-rv-referrers]')).toBeNull();
    });
});
