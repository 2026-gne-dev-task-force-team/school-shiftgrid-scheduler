// @vitest-environment jsdom
/**
 * Q2 노션 얼굴 — 속성 줄(타입 아이콘·「비어 있음」) · 표 제목 칸(행 아이콘·hover 「열기」).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertyList } from './PropertyList';
import { RecordView } from '../RecordView';
import type { RecordField } from '../contracts/collection';

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

const FIELDS: RecordField[] = [
    { key: 't', label: '이름', type: 'text', locked: true },
    { key: 'n', label: '수량', type: 'number' },
];

describe('PropertyList — 노션 꼴 줄', () => {
    it('빈 값 줄에만 「비어 있음」 · 이름표 옆에 타입 아이콘', () => {
        mount(<PropertyList fields={FIELDS} values={{ t: '가나다' }} />);
        expect(q('[data-rv-prop="t"] [data-rv-empty]')).toBeNull();
        expect(q('[data-rv-prop="n"] [data-rv-empty]')?.textContent).toBe('비어 있음');
        expect(q('[data-rv-prop="n"] svg')).toBeTruthy();
    });
    it('값을 채우면 안내가 사라진다(0 은 값이다)', () => {
        mount(<PropertyList fields={FIELDS} values={{ t: '가', n: 0 }} />);
        expect(q('[data-rv-empty]')).toBeNull();
    });
});

describe('PropertyList — 비어 있음 겹침(fix-a 5)', () => {
    it('빈 값 줄은 칸의 단독 「—」 를 감추는 클래스를 달고, 값이 있으면 안 단다', () => {
        mount(<PropertyList fields={FIELDS} values={{ t: '가나다' }} />);
        expect(q('[data-rv-prop="n"] [data-rv-empty]')!.parentElement!.className).toContain('only-child]:invisible');
        expect(q('[data-rv-prop="t"] .relative')!.className).not.toContain('invisible');
    });
});

describe('RecordView — 제목 칸 아이콘·열기', () => {
    const rows = [{ id: 'a', t: '첫 줄' }, { id: 'b', t: '둘째' }];
    it('iconOf 를 주면 제목 칸에 행 아이콘 · hover 하면 「열기」가 뜨고 누르면 그 행을 연다', () => {
        const onOpen = vi.fn();
        mount(<RecordView<{ id: string }> fields={[FIELDS[0]]} records={rows} getId={(r) => r.id} viewKey="t.q2" titleKey="t"
            iconOf={(id) => (id === 'a' ? '🍎' : undefined)} onOpenRecord={onOpen} />);
        expect(q('[data-rv-icon="a"]')?.textContent).toBe('🍎');
        expect(q('[data-rv-icon="b"] svg')).toBeTruthy();   // 아이콘 없는 행은 기본 문서 아이콘
        expect(q('[data-rv-open="a"]')).toBeNull();
        act(() => { q('[data-rv-row="a"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        const row = q('[data-rv-row="a"]')!;
        act(() => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); row.dispatchEvent(new MouseEvent('mouseenter')); });
        const btn = q('[data-rv-open="a"]');
        expect(btn?.textContent).toBe('열기');
        act(() => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(onOpen).toHaveBeenCalledWith('a');
    });
});
