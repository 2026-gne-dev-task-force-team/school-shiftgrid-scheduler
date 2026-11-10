// @vitest-environment jsdom
/** Q5 — 월 보기 줄 높이 재측정 뒤 맨 위 주 유지 · 높이가 있으면 첫 라벨은 오늘의 달 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PeekHandle } from '../../../pane-ui-system/plugin';
import { MonthView } from './MonthView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let roCb: (() => void) | null = null;
class RO { constructor(cb: () => void) { roCb = cb; } observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
let H = 24 + 6 * 80;   // 요일 머리 + 6줄 × 80
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => H });

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });
afterEach(() => { if (desc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', desc); });

const peek = { show() {}, hide() {}, visible: false } as unknown as PeekHandle;
function mount() {
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(<MonthView value={new Date()} onChange={() => {}} peek={peek} selection={null} onSelect={() => {}} />));
    return { el, sc: el.querySelector<HTMLElement>('.overflow-y-auto')! };
}
const resize = (...hs: number[]) => act(() => { for (const h of hs) { H = 24 + 6 * h; roCb!(); } });

describe('Q5 월 보기 스크롤', () => {
    it('높이가 있으면 첫 라벨은 오늘의 달(jsdom 10월은 높이 0 탓)', () => {
        H = 24 + 6 * 80;
        const { el } = mount();
        const lbl = el.querySelector('[aria-label="년·월 고르기"] .sm\\:hidden')!.textContent;
        expect(lbl).toBe(`${new Date().getMonth() + 1}월`);
    });

    it('A→B→A 로 커밋 없이 되돌아온 뒤 스크롤하고 다시 재측정해도 옛 자리로 안 튄다', () => {
        H = 24 + 6 * 80;
        const { sc } = mount();
        resize(70, 80);                       // 커밋 없는 왕복(패턴 편집·peek 애니메이션)
        act(() => { sc.scrollTop += 3 * 80; }); // 3주 아래로
        const topWeek = sc.scrollTop / 80;
        resize(70);                           // 다음 재측정(Esc 로 카드 닫기)
        expect(sc.scrollTop / 70).toBeCloseTo(topWeek, 5);
    });
});
