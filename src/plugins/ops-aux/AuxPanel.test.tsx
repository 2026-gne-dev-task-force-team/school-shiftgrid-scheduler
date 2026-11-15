// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoAux, memoryAuxSource } from './source';
import { AuxView } from './AuxPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
const click = (host: HTMLElement, label: string) => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

describe('근태 화면', () => {
    it('명부·그날 배정이 뜨고, 근태담당이 쉬게 하면 비활성이 된다', async () => {
        const src = memoryAuxSource(demoAux());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AuxView, { source: src, viewer: { userId: 'u-a', role: '근태담당' }, initialDate: '2026-11-19' })));
        expect(host.textContent).toContain('명부 2명');
        expect(host.textContent).toContain('강사01 → 1-1');
        const rest = [...host.querySelectorAll('button')].find((x) => x.textContent === '강사01 쉬게 하기') as HTMLButtonElement;
        expect(rest.className).toContain('border-'); expect(rest.className).not.toContain('border-transparent'); // 글자처럼 보이지 않는 단추 꼴
        await act(async () => { click(host, '강사01 쉬게 하기'); });
        expect((await src.load()).staff[0].active).toBe(true); // 확인 전에는 안 쉰다
        expect(host.textContent).toContain('정말 쉬게 할까요?');
        await act(async () => { click(host, '쉬게 하기 취소'); });
        expect(host.textContent).not.toContain('정말 쉬게 할까요?');
        await act(async () => { click(host, '강사01 쉬게 하기'); });
        await act(async () => { click(host, '강사01 쉬게 하기 확인'); });
        expect((await src.load()).staff[0].active).toBe(false);
        await act(async () => { click(host, '강사01 되돌리기'); });
        expect((await src.load()).staff[0].active).toBe(true);
    });
    it('줄이 접힌다(flex-wrap)', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AuxView, { source: memoryAuxSource(demoAux()), viewer: { userId: 'u-a', role: '근태담당' }, initialDate: '2026-11-19' })));
        expect([...host.querySelectorAll('[data-testid=form-row]')].every((e) => e.classList.contains('flex-wrap'))).toBe(true);
        expect(host.querySelectorAll('[data-testid=form-row]').length).toBeGreaterThan(0);
    });
    it('교사로 열어 고치면 거부 메시지가 뜨고 저장되지 않는다', async () => {
        const src = memoryAuxSource(demoAux());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AuxView, { source: src, viewer: { userId: 'u-b', role: '교사' }, initialDate: '2026-11-19' })));
        await act(async () => { click(host, '강사01 쉬게 하기'); });
        await act(async () => { click(host, '강사01 쉬게 하기 확인'); });
        expect(host.textContent).toContain('근태담당만');
        expect((await src.load()).staff[0].active).toBe(true);
    });
});
