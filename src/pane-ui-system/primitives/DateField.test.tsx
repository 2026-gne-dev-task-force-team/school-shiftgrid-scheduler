// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach } from 'vitest';
import { DateField } from './DateField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ''; });

function mount(value: string, time = false) {
    const got: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement(DateField, { value, time, onChange: (v: string) => got.push(v) })));
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
