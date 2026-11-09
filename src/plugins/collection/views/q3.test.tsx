// @vitest-environment jsdom
/**
 * Q3 — 하위 항목(들여쓰기 안내선·「하위 항목 추가」) · 칸 아이콘(C1) · 칸 설명 툴팁(C2).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertyList } from './PropertyList';
import { RecordView } from '../RecordView';
import type { RecordField, RecordTree } from '../contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
function mount(el: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(el); });
}
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = ''; });
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const mouse = (el: Element, type: string) => {
    const e = new MouseEvent(type, { bubbles: true });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    act(() => { el.dispatchEvent(e); });
};

const FIELDS: RecordField[] = [
    { key: 't', label: '이름', type: 'text', locked: true, icon: '🏷️', description: '이 줄의 이름이다' },
    { key: 'n', label: '수량', type: 'number' },
];

describe('칸 아이콘 · 설명 (C1·C2)', () => {
    it('속성 줄: 칸 아이콘이 있으면 이모지, 없으면 타입 아이콘', () => {
        mount(<PropertyList fields={FIELDS} values={{}} />);
        expect(q('[data-rv-prop="t"] [data-rv-glyph]')?.textContent).toBe('🏷️');
        expect(q('[data-rv-prop="n"] [data-rv-glyph]')).toBeNull();
        expect(q('[data-rv-prop="n"] svg')).toBeTruthy();
    });
    it('속성 줄 이름표에 올리면 설명이 뜬다(설명 없는 칸은 안 뜬다)', () => {
        vi.useFakeTimers();
        try {
            mount(<PropertyList fields={FIELDS} values={{}} />);
            mouse(q('[data-rv-prop="t"] span')!, 'pointerover');
            act(() => { vi.advanceTimersByTime(600); });
            expect(q('[data-tooltip]')?.textContent).toBe('이 줄의 이름이다');
            mouse(q('[data-rv-prop="t"] span')!, 'pointerout');
            mouse(q('[data-rv-prop="n"] span')!, 'pointerover');
            act(() => { vi.advanceTimersByTime(600); });
            expect(q('[data-tooltip]')).toBeNull();
        } finally { vi.useRealTimers(); }
    });
    it('표 칸 머리도 같은 아이콘·설명을 쓴다', () => {
        mount(<RecordView<{ id: string }> fields={FIELDS} records={[{ id: 'a' }]} getId={(r) => r.id} viewKey="t.q3a" titleKey="t" />);
        expect(q('[data-rv-head="t"] [data-rv-glyph]')?.textContent).toBe('🏷️');
    });
});

describe('하위 항목 (X5)', () => {
    type R = { id: string; t: string; p: string | null };
    const rows: R[] = [{ id: 'a', t: '부모', p: null }, { id: 'b', t: '자식', p: 'a' }, { id: 'c', t: '손자', p: 'b' }];
    const tree = (over: Partial<RecordTree<R>> = {}): RecordTree<R> => ({
        parentOf: (r) => r.p, collapsed: () => false, onToggleCollapse: vi.fn(), onIndent: vi.fn(), onOutdent: vi.fn(), onAddChild: vi.fn(), ...over,
    });
    const view = (t: RecordTree<R>) => mount(<RecordView<R> fields={[FIELDS[0]]} records={rows} getId={(r) => r.id} viewKey="t.q3b" titleKey="t" tree={t} />);

    it('깊이만큼 안내선이 그려진다(눈에 보이는 들여쓰기)', () => {
        view(tree());
        expect(qa('[data-rv-row="a"] [data-rv-guide]')).toHaveLength(0);
        expect(qa('[data-rv-row="b"] [data-rv-guide]')).toHaveLength(1);
        expect(qa('[data-rv-row="c"] [data-rv-guide]')).toHaveLength(2);
    });
    it('행 hover 에 「하위 항목 추가」가 뜨고 누르면 그 행 id 로 onAddChild', () => {
        const t = tree();
        view(t);
        expect(q('[data-rv-add-child]')).toBeNull();
        mouse(q('[data-rv-row="a"]')!, 'mouseover');
        act(() => { q('[data-rv-row="a"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        const btn = q('[data-rv-add-child="a"]');
        expect(btn).toBeTruthy();
        act(() => { btn!.click(); });
        expect(t.onAddChild).toHaveBeenCalledWith('a');
    });
    it('접힌 행에 추가하면 먼저 펼친다', () => {
        const t = tree({ collapsed: (id) => id === 'a' });
        view(t);
        act(() => { q('[data-rv-row="a"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        act(() => { q('[data-rv-add-child="a"]')!.click(); });
        expect(t.onToggleCollapse).toHaveBeenCalledWith('a');
        expect(t.onAddChild).toHaveBeenCalledWith('a');
    });
});
