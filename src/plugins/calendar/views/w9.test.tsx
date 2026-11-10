// @vitest-environment jsdom
/** W9 — 일정 칩 키보드 접근 · peek 초점/Esc 한 번 · 달력 저장소 끼워 넣기(펼침) */
import { readFileSync } from 'node:fs';
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeekLayer } from '../../../pane-ui-system/shell/shared/PeekLayer';
import { TitleField } from '../../../pane-ui-system/primitives/IconPicker';
import type { NodesApi, PublicNode } from '../../explorer/contracts/nodes';
import { initCalendarNodes, calendarNodeTypeImpl, STORE_TYPE, EVENT_TYPE } from '../nodes';
import { chipKeyId } from './chip-key';
import { focusPeekTitle } from './focus-title';
import { storeRows, StoreEmbed } from './StoreEmbed';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let roots: Root[] = [];
beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true })); });
afterEach(() => { vi.unstubAllGlobals(); act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; initCalendarNodes(null); });
function mount(node: React.ReactNode) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host); roots.push(root); act(() => root.render(node)); return host;
}

describe('chipKeyId — 칩 키보드 열기', () => {
    const mk = (key: string, id: string | null) => {
        const t = document.createElement('div'); if (id) t.setAttribute('data-event-id', id);
        const pd = vi.fn();
        return { e: { key, target: t, preventDefault: pd }, pd };
    };
    it('Enter·Space 는 칩 id 를 돌려주고 기본 동작을 막는다', () => {
        for (const k of ['Enter', ' ']) { const { e, pd } = mk(k, 'ev1'); expect(chipKeyId(e)).toBe('ev1'); expect(pd).toHaveBeenCalled(); }
    });
    it('다른 키 · 칩이 아닌 곳은 null', () => {
        expect(chipKeyId(mk('a', 'ev1').e)).toBeNull();
        expect(chipKeyId(mk('Enter', null).e)).toBeNull();
    });
});

describe('peek 초점', () => {
    it('칩(초점 가능)을 눌러 연 뒤 focusPeekTitle → 초점이 미리보기 제목으로', () => {
        document.body.innerHTML = '<div id="chip" tabindex="0" data-event-id="e1"></div>';
        (document.getElementById('chip') as HTMLElement).focus();
        document.body.insertAdjacentHTML('beforeend', '<div role="complementary" aria-label="미리보기"><input aria-label="제목" value="a"></div>');
        focusPeekTitle();
        expect(document.activeElement?.getAttribute('aria-label')).toBe('제목');
    });
    it('제목 입력에서 Esc 한 번에 onClose 가 불리고, 닫히면 초점이 연 칩으로 돌아온다', () => {
        document.body.innerHTML = '<div id="chip" tabindex="0"></div>';
        const chip = document.getElementById('chip') as HTMLElement; chip.focus();
        let open = true; const onClose = vi.fn(() => { open = false; render(); });
        const host = document.createElement('div'); document.body.appendChild(host);
        const root = createRoot(host); roots.push(root);
        const render = () => act(() => root.render(open ? h(PeekLayer, { mode: 'overlay', onClose, children: h(TitleField, { value: '제목 없음', onRename: () => {} }) }) : null));
        render();
        expect(document.activeElement?.getAttribute('aria-label')).toBe('제목');
        act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(chip);
    });
});

describe('달력 저장소 끼워 넣기', () => {
    const ev = (id: string, name: string, start: string, end: string) => ({ id, type: EVENT_TYPE, name, data: { values: { when: { start, end } } } }) as unknown as PublicNode;
    it('storeRows — 그 저장소 일정만 · 휴지통 제외 · 시작 순', () => {
        const nodes = [ev('a', 'B', '2026-11-12', '2026-11-12'), ev('b', 'A', '2026-11-10T09:00', '2026-11-10T10:00'), ev('c', 'X', '2026-11-11', '2026-11-11'), ev('d', 'T', '2026-11-09', '2026-11-09')];
        const parent = (id: string) => (id === 'c' ? 'other' : 'st');
        const rows = storeRows(nodes, 'st', parent, (id) => id === 'd');
        expect(rows.map((r) => r.name)).toEqual(['A', 'B']);
        expect(rows[0].when).toBe('2026-11-10 09:00');
    });
    it('타입이 embed 를 낸다 · inline 이면 일정 이름이 보이고 「열어서 보기」 한 줄', () => {
        expect(calendarNodeTypeImpl.store.embed).toBe(StoreEmbed);
        const nodes = [ev('e1', '회의', '2026-11-10', '2026-11-10')];
        const opened: string[] = [];
        const api = {
            byType: (t: string) => (t === EVENT_TYPE ? nodes : [{ id: 'st', type: STORE_TYPE, name: '기본' }]),
            get: (id: string) => (id === 'st' ? { id: 'st', type: STORE_TYPE, name: '기본' } : undefined),
            parent: () => 'st', isTrashed: () => false, subscribe: () => ({ dispose() {} }), open: (id: string) => { opened.push(id); },
        } as unknown as NodesApi;
        initCalendarNodes(api);
        const el = mount(h(StoreEmbed, { nodeId: 'st', view: 'inline', host: {} as never }));
        expect(el.textContent).toContain('회의');
        expect(el.textContent).toContain('보기: 달력 — 열어서 보기');
        const card = mount(h(StoreEmbed, { nodeId: 'st', host: {} as never }));
        expect(card.textContent).not.toContain('회의');
        act(() => { (el.querySelector('[data-cal-inline] > div:last-child') as HTMLElement).click(); });
        expect(opened).toEqual(['st']);
    });
});

describe('W9 머리 모양(원문 검사)', () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf-8');
    it('달력 머리 달 이름은 한 줄(whitespace-nowrap)', () => {
        expect(read('./MonthView.tsx')).toMatch(/whitespace-nowrap text-body sm:text-base font-semibold/);
    });
    it('시트 열 머리 줄은 박힐 때 바탕색(bg-bg)이 있다', () => {
        expect(read('../../sheet/Table.tsx')).toContain("hasSticky ? 'sticky top-0 z-20 bg-bg' : ''");
    });
});
