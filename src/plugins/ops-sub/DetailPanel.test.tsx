// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoRows, memorySource } from './list';
import { DetailView } from './DetailPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
const date = '2026-11-12';
const viewer = { loggedIn: true, projectId: 'p1', userId: 'u-a', personRef: 'T-a', role: '교사' as const };

async function setup(src = memorySource(demoRows(date))) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(DetailView, { source: src, viewer, date, rowId: 'd1', now: () => date })));
    return { host, src };
}

describe('보결 상세 화면', () => {
    it('대기 줄에 「맡기」가 보이고 누르면 확정된다', async () => {
        const { host, src } = await setup();
        const btn = [...host.querySelectorAll('button')].find((x) => x.textContent === '맡기');
        expect(btn).toBeTruthy();
        await act(async () => { btn?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(host.textContent).toContain('맡았습니다');
        expect((await src.loadSlots(date)).find((r) => r.id === 'd1')?.take?.takerRef).toBe('T-a');
        expect([...host.querySelectorAll('button')].some((x) => x.textContent === '맡기')).toBe(false);
    });
    it('다른 분이 먼저 맡았으면 맡기 버튼이 없다', async () => {
        const rows = demoRows(date); rows[0] = { ...rows[0], status: '확정', take: { takerRef: 'T-z', takerName: '가짜전담', takerUserId: null, confirmedAt: '' } };
        const { host } = await setup(memorySource(rows));
        expect([...host.querySelectorAll('button')].some((x) => x.textContent === '맡기')).toBe(false);
        expect(host.textContent).toContain('가짜전담');
    });
});
