// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoAux, memoryAuxSource } from '../source';
import { MonthView } from './MonthPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
const click = (host: HTMLElement, label: string) => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

describe('월 정산 화면', () => {
    it('마감하면 [마감] 이 뜨고, 근태담당의 해제는 403 으로 막힌다', async () => {
        const src = memoryAuxSource(demoAux());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(MonthView, { source: src, viewer: { userId: 'u', role: '근태담당' }, initialYm: '2026-10' })));
        expect(host.textContent).toContain('강사01 근무 200');
        await act(async () => { click(host, '강사01 마감'); });
        expect(host.textContent).toContain('[마감]');
        await act(async () => { click(host, '강사01 마감 해제'); });
        expect(host.textContent).toContain('관리자만');
        expect(host.textContent).not.toMatch(/\b(403|409)\b/);
        expect((await src.load()).monthClose).toHaveLength(1);
    });
    let seq = 0;
    const mount = async (src: ReturnType<typeof memoryAuxSource>) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(MonthView, { source: src, viewer: { userId: 'u', role: '근태담당' }, initialYm: '2026-10', newId: () => `e${++seq}` })));
        return host;
    };
    it('예외를 더하면 빼기 줄이 생기고, 되묻고 나서야 빠진다', async () => {
        const src = memoryAuxSource(demoAux());
        const host = await mount(src);
        await act(async () => { click(host, '예외 넣기'); });
        expect((await src.load()).exceptions).toHaveLength(1);
        await act(async () => { click(host, '강사01 2026-10-01 결근 빼기'); });
        expect(host.textContent).toContain('정말 뺄까요?');
        expect((await src.load()).exceptions).toHaveLength(1);
        await act(async () => { click(host, '빼기 취소'); });
        expect(host.textContent).not.toContain('정말 뺄까요?');
        await act(async () => { click(host, '강사01 2026-10-01 결근 빼기'); });
        await act(async () => { click(host, '강사01 2026-10-01 결근 빼기 확인'); });
        expect((await src.load()).exceptions).toHaveLength(0);
    });
    it('마감된 달의 예외는 빼기 단추 없이 이유가 보이고, 거부 문구에 번호가 없다', async () => {
        const src = memoryAuxSource(demoAux());
        const host = await mount(src);
        await act(async () => { click(host, '예외 넣기'); });
        await act(async () => { click(host, '강사01 마감'); });
        expect(host.textContent).toContain('마감된 달이라 뺄 수 없습니다.');
        expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('빼기'))).toBe(false);
        await act(async () => { click(host, '예외 넣기'); });
        expect(host.querySelector('[role=alert]')?.textContent).toContain('마감된 달(2026-10)');
        expect(host.querySelector('[role=alert]')?.textContent).not.toMatch(/\d{3}:/);
    });
    it('예외 더하기 줄이 접힌다(flex-wrap)', async () => {
        const host = await mount(memoryAuxSource(demoAux()));
        expect([...host.querySelectorAll('[data-testid=form-row]')].every((e) => e.classList.contains('flex-wrap'))).toBe(true);
        expect(host.querySelectorAll('[data-testid=form-row]').length).toBeGreaterThan(0);
    });
});
