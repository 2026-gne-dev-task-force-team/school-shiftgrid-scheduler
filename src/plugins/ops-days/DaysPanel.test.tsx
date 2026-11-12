// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoDays, memoryDaysSource } from './source';
import { DaysView } from './DaysPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

describe('학사 화면', () => {
    it('일정·변경이 달 목록에 뜨고, 교사는 자기 변경을 지울 수 있다', async () => {
        const src = memoryDaysSource(demoDays());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { source: src, viewer: { userId: 'u-a', role: '교사' }, initialMonth: '2026-11' })));
        expect(host.textContent).toContain('[휴업] 개교기념일');
        expect(host.textContent).toContain('시간표 변경 1건');
        await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === '3-2 4교시 지우기')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect((await src.load()).changes).toHaveLength(0);
    });
});
