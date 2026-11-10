// @vitest-environment jsdom
/**
 * W13 「레코드 = 속성이 붙은 문서」 — ① 문서 화면 한 벌(page-doc 의 PageEditor)을 페이지·레코드가 같이 쓰나 ② 탭으로 열기
 *   (미리보기 머리 단추·⌘Enter · 목록 ⌘클릭·가운데 클릭·줄 메뉴 · 이미 떠 있으면 그 탭 = 싱글턴).
 */
import { act, createElement as h, isValidElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setWorkspaceBridge, type PluginHost } from '../../pane-ui-system/plugin';
import { RecordPage } from './views/RecordPage';
import { RecordView } from './RecordView';
import { RecordTab, openRecordTab, registerRecordTab, RECORD_TAB_ID } from './tab-open';
import { setPlatform } from '../../pane-ui-system/platform-keys';
import { PeekLayer } from '../../pane-ui-system/shell/shared/PeekLayer';
import { pagePlugin } from '../page/index';
import { PageEditor } from '../page/views/PageView';
import { collectionPlugin } from './index';
import type { RecordField } from './contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
function mount(el: React.ReactElement) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const r = createRoot(div); roots.push(r);
    act(() => { r.render(el); });
}
afterEach(() => { act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; });
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function fakeHost(mods: Record<string, unknown>, open = vi.fn(() => 'leaf1')): PluginHost {
    return { modules: { use: (n: string) => mods[n] }, workspace: { open }, notify: vi.fn() } as unknown as PluginHost;
}

describe('문서 화면 한 벌 — 페이지와 레코드가 같은 편집기', () => {
    it('page-doc 모듈의 문서는 페이지 노드 편집기와 같은 PageEditor 다', () => {
        const PageDoc = (pagePlugin as unknown as { modules: { 'page-doc': { PageDoc: (p: unknown) => unknown } } }).modules['page-doc'].PageDoc;
        const el = PageDoc({ host: {} as PluginHost, docKey: 'n1', value: undefined, onChange: () => {} });
        expect(isValidElement(el) && el.type).toBe(PageEditor);
    });
    it('레코드 열기 페이지(RecordPage)는 page-doc 문서에 속성 칸을 넘겨 그린다 — 제목·본문은 문서가, 속성만 레코드가', () => {
        const PageDoc = vi.fn((p: { properties?: React.ReactNode }) => h('div', { 'data-doc': '' }, p.properties));
        const nodes = { get: () => ({ id: 'r1', type: 't.row', name: '첫 줄', body: undefined }), setBody: vi.fn() };
        const fields: RecordField[] = [{ key: 't', label: '이름', type: 'text', locked: true }, { key: 'n', label: '수량', type: 'number' }];
        mount(h(RecordPage, { host: fakeHost({ nodes, 'page-doc': { PageDoc } }), id: 'r1', fields, values: { t: '첫 줄', n: 3 } }));
        expect(PageDoc).toHaveBeenCalled();
        const props = PageDoc.mock.calls[0][0] as unknown as { docKey: string; properties: unknown };
        expect(props.docKey).toBe('r1');
        expect(q('[data-doc] [data-rv-prop="n"]')).toBeTruthy();   // 속성 칸이 문서 머리 밑에 들어갔다
    });
});

describe('탭으로 열기 — 미리보기 머리', () => {
    it('openInTab 을 주면 머리에 「탭으로 열기」 — 누르면 부른다 · ⌘Enter 도', () => {
        const onOpenInTab = vi.fn();
        mount(h(PeekLayer, { mode: 'overlay', onClose: () => {}, onOpenInTab, children: h('input', { id: 'in' }) }));
        act(() => { q('[data-peek-open-tab]')!.click(); });
        expect(onOpenInTab).toHaveBeenCalledTimes(1);
        act(() => { q('#in')!.focus(); });
        act(() => { q('#in')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })); });
        expect(onOpenInTab).toHaveBeenCalledTimes(2);
    });
    it('안 주면 단추가 없다', () => {
        mount(h(PeekLayer, { mode: 'overlay', onClose: () => {}, children: h('div') }));
        expect(q('[data-peek-open-tab]')).toBeNull();
    });
});

describe('탭으로 열기 — 목록 줄', () => {
    const FIELDS: RecordField[] = [{ key: 't', label: '이름', type: 'text', locked: true }, { key: 'n', label: '수량', type: 'number' }];
    const rows = [{ id: 'a', t: '첫 줄', n: 1 }];
    const cell = (fi: number) => q(`[data-rv-row="a"] [data-rv-pos="0:${fi}"]`)!;
    function setup() {
        const onOpen = vi.fn(); const onTab = vi.fn();
        mount(h(RecordView<{ id: string }>, { fields: FIELDS, records: rows, getId: (r) => r.id, viewKey: 't.w13', titleKey: 't', onOpenRecord: onOpen, onOpenRecordTab: onTab }));
        return { onOpen, onTab };
    }
    it('제목 칸 ⌘클릭 · 가운데 클릭 = 탭으로 · 그냥 누르면 안 간다 · 다른 칸 ⌘클릭도 안 간다', () => {
        const { onTab } = setup();
        act(() => { cell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
        expect(onTab).not.toHaveBeenCalled();
        act(() => { cell(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, metaKey: true })); });
        expect(onTab).not.toHaveBeenCalled();
        act(() => { cell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, metaKey: true })); });
        expect(onTab).toHaveBeenCalledWith('a');
        act(() => { cell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1 })); });
        expect(onTab).toHaveBeenCalledTimes(2);
    });
    it('hover 하면 행 끝 「탭으로 열기」 단추 · 「열기」 ⌘클릭도 탭으로', () => {
        const { onOpen, onTab } = setup();
        const row = q('[data-rv-row="a"]')!;
        act(() => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        act(() => { q('[data-rv-open-tab="a"]')!.click(); });
        expect(onTab).toHaveBeenCalledWith('a');
        act(() => { q('[data-rv-open="a"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })); });
        expect(onTab).toHaveBeenCalledTimes(2);
        expect(onOpen).not.toHaveBeenCalled();
    });
    it('줄 우클릭 메뉴에 「탭으로 열기」', () => {
        const { onTab } = setup();
        act(() => { cell(1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); });
        const item = [...document.querySelectorAll('[role="menuitem"], button')].find((b) => b.textContent?.includes('탭으로 열기')) as HTMLElement | undefined;
        expect(item).toBeTruthy();
        act(() => { item!.click(); });
        expect(onTab).toHaveBeenCalledWith('a');
    });
});

describe('탭으로 열기 — 여는 길', () => {
    const leafOf = (recordId: string, id = 'L1') => ({ id, viewId: RECORD_TAB_ID, title: '', params: { recordId } });
    it('제 탭이 없는 레코드는 레코드마다 「레코드」 탭 — 레코드 id 를 params 로 싣고 reuse 로 연다(싱글턴 아님)', () => {
        registerRecordTab('t.row', (_h, id) => h('p', { 'data-rendered': id }));
        const nodes = { get: (id: string) => ({ id, type: 't.row', name: `이름${id}` }), isTrashed: () => false, open: vi.fn(), subscribe: () => ({ dispose() {} }) };
        const open = vi.fn(() => 'leaf1');
        const host = fakeHost({ nodes }, open);
        openRecordTab(host, 'r1');
        openRecordTab(host, 'r2');
        expect(open).toHaveBeenNthCalledWith(1, RECORD_TAB_ID, { where: 'center', reuse: true, params: { recordId: 'r1' }, title: '이름r1' });
        expect(open).toHaveBeenNthCalledWith(2, RECORD_TAB_ID, { where: 'center', reuse: true, params: { recordId: 'r2' }, title: '이름r2' });
        expect(nodes.open).not.toHaveBeenCalled();
        const view = collectionPlugin.manifest.contributes!.views!.find((v) => `collection.${v.id}` === RECORD_TAB_ID);
        expect(view?.placement?.singleton).toBeFalsy();
    });
    it('탭 몸통은 저장된 params.recordId 레코드를 그린다 — 두 탭은 각자 제 레코드(복원 뒤에도 같다)', () => {
        registerRecordTab('t.row', (_h, id) => h('p', { 'data-rendered': id }));
        const nodes = { get: (id: string) => ({ id, type: 't.row', name: id }), isTrashed: () => false, subscribe: () => ({ dispose() {} }) };
        const host = fakeHost({ nodes });
        mount(h(RecordTab, { host, leaf: leafOf('r1') } as never));
        mount(h(RecordTab, { host, leaf: leafOf('r2', 'L2') } as never));
        expect([...document.querySelectorAll('[data-rendered]')].map((e) => e.getAttribute('data-rendered'))).toEqual(['r1', 'r2']);
        document.body.innerHTML = '';
        mount(h(RecordTab, { host, leaf: { id: 'L3', viewId: RECORD_TAB_ID, title: '' } } as never));   // params 없음 = 안내
        expect(q('[data-rendered]')).toBeNull();
    });
    it('제목·아이콘은 레코드를 따라가고 바뀌면 갱신 — 휴지통에 가면 「삭제된 문서」', () => {
        registerRecordTab('t.row', (_h, id) => h('p', { 'data-rendered': id }));
        const state = { name: '첫 이름', icon: '🍎', trashed: false };
        const subs = new Set<() => void>();
        const nodes = { get: (id: string) => ({ id, type: 't.row', name: state.name, icon: state.icon }), isTrashed: () => state.trashed, subscribe: (fn: () => void) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; } };
        const titles: Array<[string, string]> = []; const glyphs: Array<[string, string | undefined]> = [];
        setWorkspaceBridge({ open: () => null, close: () => {}, setTitle: (l: string, t: string) => { titles.push([l, t]); }, setGlyph: (l: string, g: string | undefined) => { glyphs.push([l, g]); } } as never);
        mount(h(RecordTab, { host: fakeHost({ nodes }), leaf: leafOf('r1') } as never));
        expect(titles.at(-1)).toEqual(['L1', '첫 이름']); expect(glyphs.at(-1)).toEqual(['L1', '🍎']);
        act(() => { state.name = '새 이름'; subs.forEach((f) => f()); });
        expect(titles.at(-1)).toEqual(['L1', '새 이름']);
        act(() => { state.trashed = true; subs.forEach((f) => f()); });
        expect(q('[data-rendered]')).toBeNull();
        expect(document.body.textContent).toContain('삭제된 문서');
        expect(titles.at(-1)).toEqual(['L1', '삭제된 문서']);
        setWorkspaceBridge(null);
    });
    it('안내 문구의 클릭 표기는 플랫폼을 따른다 — 윈도우 Ctrl+클릭 · 맥 ⌘클릭', () => {
        const nodes = { get: () => undefined, isTrashed: () => false, subscribe: () => ({ dispose() {} }) };
        const leaf = { id: 'L9', viewId: RECORD_TAB_ID, title: '' };
        try {
            setPlatform('win');
            mount(h(RecordTab, { host: fakeHost({ nodes }), leaf } as never));
            expect(document.body.textContent).toContain('Ctrl+클릭'); expect(document.body.textContent).not.toContain('⌘');
            document.body.innerHTML = '';
            setPlatform('mac');
            mount(h(RecordTab, { host: fakeHost({ nodes }), leaf } as never));
            expect(document.body.textContent).toContain('⌘클릭');
        } finally { setPlatform(null); }
    });
    it('레코드가 아예 사라지면 「삭제된 레코드」 — 휴지통의 「삭제된 문서」와 구분 · 제목도 갱신', () => {
        const titles: Array<[string, string]> = [];
        setWorkspaceBridge({ open: () => null, close: () => {}, setTitle: (l: string, t: string) => { titles.push([l, t]); }, setGlyph: () => {} } as never);
        const nodes = { get: () => undefined, isTrashed: () => false, subscribe: () => ({ dispose() {} }) };
        mount(h(RecordTab, { host: fakeHost({ nodes }), leaf: leafOf('gone') } as never));
        expect(document.body.textContent).toContain('이 레코드는 삭제되었습니다');
        expect(document.body.textContent).not.toContain('삭제된 문서');
        expect(titles.at(-1)).toEqual(['L1', '삭제된 레코드']);
        setWorkspaceBridge(null);
    });
    it('제 편집 탭이 있는 노드(사용자·역할·페이지)는 노드 열기 그대로', () => {
        const nodes = { get: (id: string) => ({ id, type: 'account.user' }), open: vi.fn() };
        const open = vi.fn();
        openRecordTab(fakeHost({ nodes }, open), 'u1');
        expect(nodes.open).toHaveBeenCalledWith('u1');
        expect(open).not.toHaveBeenCalled();
    });
});
