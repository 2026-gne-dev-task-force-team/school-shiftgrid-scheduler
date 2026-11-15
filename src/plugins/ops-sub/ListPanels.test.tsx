// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { VisibleRow } from './list';
import { ListPanel, MineView } from './ListPanels';
import { opsSubPlugin } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const row = {
    id: 'r1', projectId: 'p1', date: '2026-11-12', trackName: '1-1', startMin: 580, endMin: 620, status: '확정', createdAt: 'a', updatedAt: 'a',
    body: { absentRef: 'homeroom:1-1', absentName: '가나다', registeredByName: 'x', registeredBy: 'u', label: '', subject: null, reason: '병가', memo: '', allDay: false, preApproved: false },
    take: { takerRef: 'me', takerName: '나' },
} as unknown as VisibleRow;

async function mount(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(el));
    return host;
}

describe('보결 목록 패널', () => {
    it('「올리기」 단추가 등록 열기를 부른다', async () => {
        let n = 0;
        const host = await mount(createElement(ListPanel, { onRegister: () => { n++; } }));
        const b = [...host.querySelectorAll('button')].find((x) => x.textContent === '올리기');
        await act(async () => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(n).toBe(1);
    });
    it('플러그인 목록 화면이 ops-sub.open-register 명령을 부른다', () => {
        const ran: string[] = [];
        const el = (opsSubPlugin.components!.List as unknown as (p: unknown) => unknown)({ host: { commands: { run: (id: string) => { ran.push(id); return true; } }, workspace: { open: () => {} } } } as never) as React.ReactElement<{ onRegister: () => void }>;
        el.props.onRegister();
        expect(ran).toEqual(['ops-sub.open-register']);
    });
});

describe('내 보결', () => {
    it('li 안에 li 가 없다', async () => {
        const host = await mount(createElement(MineView, { rows: [row], personRef: 'me' }));
        expect(host.querySelectorAll('li').length).toBeGreaterThan(0);
        expect(host.querySelector('li > li')).toBeNull();
    });
});
