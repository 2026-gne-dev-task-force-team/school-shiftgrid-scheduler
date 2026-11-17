// @vitest-environment jsdom
/**
 * 관계 칸 — 가리킬 항목이 없을 때의 안내. 옵션(emptyHint·emptyAction)이 없으면 옛 문구 그대로 · 있으면 새 문구 + 단추가 넘겨 준 명령을 돈다.
 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi, PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { initRecordNodes, registerListType } from '../nodes';
import { bindCollectionHost } from '../self-host';
import { RelationCell, relationConfig } from './relation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nodes: Record<string, { type: string; name: string; parent: string | null }> = { rl: { type: 'rooms.list', name: '방 목록', parent: null } };
const pub = (id: string): PublicNode => ({ id, type: nodes[id].type, name: nodes[id].name, children: [] });
const fake = {
    get: (id: string) => (nodes[id] ? pub(id) : undefined),
    isTrashed: () => false,
    path: (id: string) => [id],
    liveByType: (t: string) => Object.keys(nodes).filter((id) => nodes[id].type === t).map(pub),
    children: (id: string) => Object.keys(nodes).filter((k) => nodes[k].parent === id).map(pub),
    parent: (id: string) => nodes[id]?.parent ?? null,
    find: (pred: (n: PublicNode) => boolean) => Object.keys(nodes).map(pub).filter(pred),
    subscribe: () => ({ dispose() {} }),
} as unknown as NodesApi;
registerListType('rooms.list', '방 목록');

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; initRecordNodes(null); bindCollectionHost(null); });

const OLD = '가리킬 컬렉션에 항목이 없어요';
function open(extra: Record<string, unknown>) {
    initRecordNodes(fake);
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    const config = { target: { kind: 'db', nodeId: 'rl' }, many: false, ...extra };
    const field = { key: 'f_room', label: '방', type: 'relation', config };
    act(() => root!.render(h(RelationCell, { field, value: [], config, editable: true, onChange: () => {} } as never)));
    act(() => (el.querySelector('[data-rv-relation]') as HTMLElement).click());
}
const emptyText = () => document.querySelector('[data-rv-rel-empty]')?.textContent ?? '';

describe('관계 칸 — 항목이 없을 때 안내', () => {
    it('옵션이 없으면 옛 문구 그대로 · 단추 없음', () => {
        open({});
        expect(emptyText()).toBe(OLD);
        expect(document.querySelector('[data-rv-rel-empty-action]')).toBeNull();
    });
    it('emptyHint·emptyAction 이 있으면 새 문구 + 단추 — 누르면 그 명령을 돈다', () => {
        const run = vi.fn(() => true);
        bindCollectionHost({ commands: { run } } as unknown as PluginHost);
        open({ emptyHint: '특별실 관리에서 방을 먼저 더해 주세요', emptyAction: { label: '특별실 관리 열기', cmd: 'x.cmd' } });
        expect(emptyText()).toContain('특별실 관리에서 방을 먼저 더해 주세요');
        expect(emptyText()).not.toContain(OLD);
        const btn = document.querySelector('[data-rv-rel-empty-action]') as HTMLElement;
        expect(btn.textContent).toBe('특별실 관리 열기');
        act(() => btn.click());
        expect(run).toHaveBeenCalledWith('x.cmd');
    });
    it('틀린 꼴(라벨·명령이 글이 아님)은 버린다', () => {
        expect(relationConfig({ emptyAction: { label: 1, cmd: 'c' }, emptyHint: 3 })).toEqual({ target: undefined, many: true });
    });
});
