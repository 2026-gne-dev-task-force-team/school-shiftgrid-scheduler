// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach } from 'vitest';
import { PatternEditor } from './PatternEditor';
import { DateCell } from './cells';
import type { DatePattern } from '../../../pane-ui-system/date-pattern';
import type { FieldCellProps } from '../contracts/collection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

/** 제어형으로 띄운다 — onChange 값을 다시 value 로 돌려준다. */
function mount(value: DatePattern, start = '2026-11-02', focus?: string) {
    const got: (DatePattern | null)[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (v: DatePattern) => root.render(createElement(PatternEditor, {
        value: v, start, focus, onChange: (p: DatePattern | null) => { got.push(p); if (p) draw(p); },
    }));
    act(() => draw(value));
    return { host, got, last: () => got.at(-1) };
}
const day = (h: HTMLElement, d: string) => h.querySelector(`[data-pattern-day="${d}"]`) as HTMLElement;
const pick = (sel: HTMLSelectElement, v: string) => act(() => {
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
});

describe('PatternEditor', () => {
    it('프리셋을 바꾸면 rules 꼴이 바뀐다(간격·끝은 지킨다)', () => {
        const { host, last } = mount({ rules: [{ freq: 'weekly', count: 5 }] });   // 2026-11-02 = 월
        const sel = () => host.querySelector('[data-pattern-rule] select') as HTMLSelectElement;
        pick(sel(), 'weekdays');
        expect(last()).toEqual({ rules: [{ freq: 'weekly', weekdays: [1, 2, 3, 4, 5], count: 5 }] });
        pick(sel(), 'monthNth');
        expect(last()!.rules[0]).toEqual({ freq: 'monthly', nth: { n: 1, weekday: 1 }, count: 5 });
        pick(sel(), 'monthLast');
        expect(last()!.rules[0]).toEqual({ freq: 'monthly', monthDay: -1, count: 5 });
    });

    it('「+ 규칙」은 규칙 줄을 하나 더한다 · 「패턴 풀기」는 null', () => {
        const { host, last } = mount({ rules: [{ freq: 'daily' }] });
        act(() => (host.querySelector('[data-pattern-add-rule]') as HTMLElement).click());
        expect(last()!.rules).toHaveLength(2);
        expect(host.querySelectorAll('[data-pattern-rule]')).toHaveLength(2);
        const unset = [...host.querySelectorAll('button')].find((b) => b.textContent === '패턴 풀기')!;
        act(() => unset.click());
        expect(last()).toBeNull();
    });

    it('미니 달력 — 회차 날은 exdates 로, 빈 날은 rdates 로, 다시 누르면 되돌린다', () => {
        const { host, last } = mount({ rules: [{ freq: 'weekly', weekdays: [1] }] });
        expect(host.querySelector('[data-pattern-month]')!.textContent).toBe('2026년 11월');
        expect(day(host, '2026-11-09').getAttribute('aria-pressed')).toBe('true');
        act(() => day(host, '2026-11-09').click());
        expect(last()!.exdates).toEqual(['2026-11-09']);
        expect(day(host, '2026-11-09').getAttribute('aria-pressed')).toBe('false');
        act(() => day(host, '2026-11-09').click());
        expect(last()!.exdates).toBeUndefined();
        act(() => day(host, '2026-11-11').click());
        expect(last()!.rdates).toEqual(['2026-11-11']);
        expect(day(host, '2026-11-11').getAttribute('aria-pressed')).toBe('true');
        act(() => day(host, '2026-11-11').click());
        expect(last()!.rdates).toBeUndefined();
    });

    it('focus 의 달로 열린다 · 기간 빼기를 더하면 그 기간 회차가 빠진다', () => {
        const { host, last } = mount({ rules: [{ freq: 'daily' }] }, '2026-11-02', '2026-12-15');
        expect(host.querySelector('[data-pattern-month]')!.textContent).toBe('2026년 12월');
        act(() => (host.querySelector('[data-pattern-add-except]') as HTMLElement).click());
        expect(last()!.except).toEqual([{ from: '2026-11-02', to: '2026-11-02' }]);
        expect(host.querySelectorAll('[data-pattern-except]')).toHaveLength(1);
    });
});

describe('DateCell + 패턴', () => {
    function cell(value: unknown) {
        const got: unknown[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const props = { field: { key: 'd', label: '날', type: 'date' }, value, editable: true, onChange: (v: unknown) => got.push(v) } as unknown as FieldCellProps;
        act(() => root.render(createElement(DateCell, props)));
        act(() => (host.querySelector('[data-rv-cell]') as HTMLElement).click());
        return { got };
    }

    it('날짜를 고쳐도 pattern 은 남는다 · 편집기가 같이 뜬다', () => {
        const pattern = { rules: [{ freq: 'weekly' as const }] };
        const { got } = cell({ start: '2026-11-02', pattern });
        const pop = document.querySelector('[data-popover]')!;
        expect(pop.querySelector('[data-pattern-editor]')).toBeTruthy();
        act(() => (pop.querySelector('[data-rv-date-start] [data-iso="2026-11-10"]') as HTMLElement).click());
        expect(got.at(-1)).toEqual({ start: '2026-11-10', pattern });
    });

    it('「패턴으로」는 매주 규칙을 붙인다', () => {
        const { got } = cell({ start: '2026-11-02' });
        const item = [...document.querySelectorAll('[data-popover] [role="menuitem"]')].find((b) => b.textContent?.includes('패턴으로')) as HTMLElement;
        act(() => item.click());
        expect(got.at(-1)).toEqual({ start: '2026-11-02', pattern: { rules: [{ freq: 'weekly' }] } });
    });
});
