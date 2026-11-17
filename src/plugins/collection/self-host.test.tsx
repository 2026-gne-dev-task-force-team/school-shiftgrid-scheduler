// @vitest-environment jsdom
/**
 * T-10fk 회귀 — 약속으로 내준 부품(컬렉션 RecordPage·openInTab · 노트 page-doc)은 **제공자 자기 host** 로 모듈을 받는다.
 *   실제 host(makeHost)는 선언 안 한 인터페이스를 use 하면 던진다. 옛 꼴은 부른 쪽 host 로 use 해서
 *     - page-doc: 문서에 표 블록이 있으면 TableBlock 이 손님 host 로 table 을 use — table 을 적은 손님이 없어 계정·컬렉션 레코드 문서가 던졌다(지금 터지던 것).
 *     - collection: RecordPage·openInTab 이 부른 쪽 host 로 nodes·page-doc 을 use — 지금 손님은 다 적어 두어 안 터졌지만 안 적은 손님이면 던진다.
 *   🔴 가짜 host 대신 진짜 레지스트리(activateAll)·진짜 makeHost·진짜 manifest 로 잰다(T-10fe self-host 시험과 같은 꼴).
 */
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAll, makeHost, type PluginModule } from '../../pane-ui-system/plugin';
import type { RecordViewApi } from './contracts/collection';
import { collectionPlugin } from './index';
import { pagePlugin } from '../page/index';
import { accountPlugin } from '../account/index';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function provider(id: string, iface: string, mod: unknown): PluginModule {
    return {
        manifest: { id, name: id, version: '0.1.0', minHostVersion: '0.1.0', provides: { [iface]: '0.1.0' } },
        modules: { [iface]: mod },
    } as PluginModule;
}

/** 표 블록 하나가 든 레코드 문서 — 표를 그리는 TableBlock 이 table 을 use 한다. */
const TABLE_DOC = { blocks: [{ id: 'b1', type: 'table', text: '', table: { columns: [{ key: 'a', title: '가' }], rows: [{ id: 'x', cells: { a: '첫 칸' } }] } }] };
const ROW = { id: 'r1', type: 't10fk.row', name: '첫 줄', body: TABLE_DOC, data: {} };
/** 노드 약속 — 레코드 열기 페이지가 쓰는 만큼만. Frame 은 머리 자리만 비워 둔 채 몸통을 그린다. */
const fakeNodes = {
    get: (id: string) => (id === 'r1' ? ROW : undefined),
    isTrashed: () => false,
    parent: () => null,
    children: () => [],
    setBody: () => {},
    open: vi.fn(),
    subscribe: () => ({ dispose() {} }),
    registerContributed: () => ({ dispose() {} }),   // 노드 타입 기여 창구(꾸러미 활성이 부른다)
    Frame: ({ children }: { children: ReactNode | ((header: ReactNode) => ReactNode) }) =>
        h('div', { 'data-frame': '' }, typeof children === 'function' ? children(null) : children),
};

/** 아무 모듈도 선언 안 한 손님 — collection 만 쓴다(nodes·page-doc·table 을 안 적었다). */
const guestPlugin = {
    manifest: { id: 't10fk-guest', name: '손님', version: '0.1.0', minHostVersion: '0.1.0', requires: { collection: '^0.2' } },
} as PluginModule;

let root: Root | null = null;
let el: HTMLDivElement;
beforeEach(() => {
    activateAll([provider('t10fk-nodes', 'nodes', fakeNodes), collectionPlugin, pagePlugin, guestPlugin]);
    el = document.createElement('div');
    document.body.appendChild(el);
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    el.remove();
});

/** 부르는 쪽 플러그인의 진짜 host — 그 플러그인 manifest 의 선언으로만 use 된다. */
const hostOf = (p: PluginModule) => makeHost(p.manifest.id, undefined, p.manifest);

function renderRecord(p: PluginModule) {
    const host = hostOf(p);
    const rv = host.modules.use<RecordViewApi>('collection');
    expect(rv).not.toBeNull();
    root = createRoot(el);
    act(() => root!.render(h(rv!.RecordPage, { host, id: 'r1', fields: [], values: {} } as never)));
}

describe('부른 쪽이 선언 안 한 인터페이스를 부품이 대신 use 하지 않는다', () => {
    it('증거 — 계정은 table 을, 손님은 nodes·page-doc 을 선언하지 않는다(증상 고침으로 덮지 않았다)', () => {
        expect(() => hostOf(accountPlugin).modules.use('table')).toThrow(/선언 안 한 인터페이스/);
        for (const i of ['nodes', 'page-doc', 'table']) expect(() => hostOf(guestPlugin).modules.use(i)).toThrow(/선언 안 한 인터페이스/);
    });
    it.each([accountPlugin, guestPlugin])('$manifest.id 의 host 로 연 레코드 페이지 — 표 블록 문서가 던지지 않고 그려진다', (p) => {
        expect(() => renderRecord(p)).not.toThrow();
        expect(el.querySelector('[data-frame]')).toBeTruthy();   // 노트 편집기(page-doc)가 노드 틀까지 그렸다
        expect(el.textContent).not.toContain('항목 화면 기능이 꺼져');
    });
    it.each([accountPlugin, guestPlugin])('$manifest.id 의 host 로 부른 openInTab — 던지지 않고 연다', (p) => {
        const host = hostOf(p);
        const rv = host.modules.use<RecordViewApi>('collection')!;
        expect(() => rv.openInTab(host, 'r1')).not.toThrow();
    });
});
