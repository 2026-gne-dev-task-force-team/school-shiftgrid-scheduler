// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DateField } from './DateField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ''; });

function mount(value: string, time = false, openAt?: string) {
    const got: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement(DateField, { value, time, openAt, onChange: (v: string) => got.push(v) })));
    return { host, got };
}

describe('DateField', () => {
    it('값을 보여 주고, 누르면 달력이 뜨고, 날을 고르면 그 날을 넘기고 닫힌다', () => {
        const { host, got } = mount('2026-11-09');
        const btn = host.querySelector('button')!;
        expect(btn.textContent).toBe('2026-11-09');
        act(() => btn.click());
        const pop = document.querySelector('[data-popover]')!;
        expect(pop).toBeTruthy();
        const day = pop.querySelector('[data-iso="2026-11-20"]') as HTMLElement;
        act(() => day.click());
        expect(got.at(-1)).toBe('2026-11-20');
        expect(document.querySelector('[data-popover]')).toBeNull();
    });

    it('비어 있으면 자리 글자를 보여 준다', () => {
        const { host } = mount('');
        expect(host.querySelector('button')!.textContent).toBe('날짜');
    });

    it('time 이면 시각까지 보여 주고 고른 뒤에도 열려 있다', () => {
        const { host, got } = mount('2026-11-09T09:30', true);
        const btn = host.querySelector('button')!;
        expect(btn.textContent).toBe('2026-11-09 09:30');
        act(() => btn.click());
        const day = document.querySelector('[data-popover] [data-iso="2026-11-20"]') as HTMLElement;
        act(() => day.click());
        expect(got.at(-1)).toBe('2026-11-20T09:30');
        expect(document.querySelector('[data-popover]')).toBeTruthy();
    });
});

describe('DateField — 열렸을 때 보이는 달', () => {
    const month = () => document.querySelector('[data-popover] [role="grid"]')!.getAttribute('aria-label');
    afterEach(() => { vi.useRealTimers(); });
    it('값이 비면 오늘의 달 · 오늘 칸을 누르면 오늘이 골라진다(다음 달로 안 넘어간다)', () => {
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 10, 9));
        const { host, got } = mount('');
        act(() => host.querySelector('button')!.click());
        expect(month()).toBe('2026년 11월');
        const today = document.querySelector('[data-popover] [data-iso="2026-11-10"]') as HTMLElement;
        act(() => today.click());
        expect(got.at(-1)).toBe('2026-11-10');
    });
    it('값이 있으면 값의 달', () => {
        const { host } = mount('2026-03-05');
        act(() => host.querySelector('button')!.click());
        expect(month()).toBe('2026년 3월');
    });
    it('값이 비고 openAt 이 있으면 openAt 의 달(끝 날짜 칸 = 시작일의 달)', () => {
        const { host } = mount('', false, '2027-02-14');
        act(() => host.querySelector('button')!.click());
        expect(month()).toBe('2027년 2월');
    });
});
