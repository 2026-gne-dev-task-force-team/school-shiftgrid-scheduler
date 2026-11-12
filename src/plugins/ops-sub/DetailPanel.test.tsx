// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoRows, memorySource, setSlotSource } from './list';
import { setSelection } from './detail';
import { ListPanel } from './ListPanels';
import { DetailPanel, DetailView } from './DetailPanel';

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

describe('맡기 취소 · 목록 연결', () => {
    const taken = (by: string) => { const rows = demoRows(date); rows[0] = { ...rows[0], status: '확정', updatedAt: 't0', take: { takerRef: by, takerName: '가짜전담', takerUserId: null, confirmedAt: '' } }; return memorySource(rows); };
    const btn = (host: HTMLElement, t: string) => [...host.querySelectorAll('button')].find((x) => x.textContent === t);
    it('내가 맡은 줄엔 「맡기 취소」가 보이고 누르면 대기로 돌아가 「맡기」가 다시 열린다', async () => {
        const { host, src } = await setup(taken('T-a'));
        await act(async () => { btn(host, '맡기 취소')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(host.textContent).toContain('취소했습니다');
        expect((await src.loadSlots(date)).find((r) => r.id === 'd1')).toMatchObject({ status: '대기', take: null });
        expect(btn(host, '맡기')).toBeTruthy();
    });
    it('남이 맡은 줄엔 취소 버튼이 없다', async () => {
        const { host } = await setup(taken('T-z'));
        expect(btn(host, '맡기 취소')).toBeUndefined();
    });
    it('목록에서 줄을 누르면 그 줄의 상세가 열린다(고정 d1 아님)', async () => {
        setSlotSource(memorySource(demoRows(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }))));
        setSelection(null);
        const host = document.createElement('div'); document.body.appendChild(host);
        const root = createRoot(host);
        let opened = 0;
        await act(async () => root.render(createElement('div', null, createElement(ListPanel, { onOpen: () => { opened++; } }), createElement(DetailPanel))));
        expect(host.textContent).toContain('고른 보결이 없습니다');
        const li = [...host.querySelectorAll('li')].find((x) => x.textContent?.includes('3-1'));
        await act(async () => { li?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(opened).toBe(1);
        expect(host.textContent).toContain('담임 결근 · 라마바');
        expect([...host.querySelectorAll('button')].some((x) => x.textContent === '맡기 취소')).toBe(true);
        expect(host.textContent).toContain('맡은 이 사아자');
        setSelection(null);
    });
});
