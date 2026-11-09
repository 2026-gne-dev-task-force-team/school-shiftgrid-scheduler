// @vitest-environment jsdom
/**
 * Q6 — 컬렉션 표 우클릭: 줄·칸 → 줄 메뉴 · 칸 머리 → 칸 메뉴 · 빈 곳 → 새로 만들기 · 입력칸 → 기본 메뉴.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordView } from '../RecordView';
import type { RecordField } from '../contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = ''; });
const FIELDS: RecordField[] = [{ key: 't', label: '이름', type: 'text', locked: true }, { key: 'n', label: '수량', type: 'number' }];
function mount(extra: Partial<React.ComponentProps<typeof RecordView<{ id: string }>>> = {}) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(<RecordView<{ id: string }> fields={FIELDS} records={[{ id: 'a' }, { id: 'b' }]} getId={(r) => r.id} viewKey="t.q6" titleKey="t" {...extra} />); });
}
function rightClick(el: Element): MouseEvent {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { el.dispatchEvent(e); });
    return e;
}
const labels = () => [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent);

describe('표 우클릭 (R6)', () => {
    it('줄 위 → 열기·삭제 메뉴, 누르면 그 줄로 부른다', () => {
        const open = vi.fn(); const del = vi.fn();
        mount({ onOpenRecord: open, onDeleteRecords: del });
        expect(rightClick(document.querySelector('[data-rv-row="b"] [data-rv-pos="1:1"]')!).defaultPrevented).toBe(true);
        expect(labels()).toEqual(expect.arrayContaining(['열기', '삭제']));
        act(() => { ([...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === '삭제') as HTMLElement).click(); });
        expect(del).toHaveBeenCalledWith(['b']);
    });
    it('칸 머리 → 칸 메뉴(머리 ⋯ 와 같은 팝오버)', () => {
        mount();
        rightClick(document.querySelector('[data-rv-head="n"]')!);
        expect(document.body.textContent).toContain('오름차순');
    });
    it('빈 곳 → 새로 만들기', () => {
        const add = vi.fn();
        mount({ onAddRecord: add });
        rightClick(document.querySelector('[data-rv-empty], [data-rv-calc-row]')!);
        expect(labels()).toEqual(['새로 만들기']);
    });
});
