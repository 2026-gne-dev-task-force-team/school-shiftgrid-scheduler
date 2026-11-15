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
        expect(host.textContent).toContain('403');
        expect((await src.load()).monthClose).toHaveLength(1);
    });
});
