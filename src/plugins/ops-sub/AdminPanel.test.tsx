// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoRows, memorySource, type Viewer } from './list';
import { AdminView } from './AdminPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
const date = '2026-11-12';
const viewer = (role: Viewer['role']): Viewer => ({ loggedIn: true, projectId: 'p1', userId: 'u-m', personRef: 'T-m', role });
const btn = (host: HTMLElement, t: string) => [...host.querySelectorAll('button')].find((x) => x.textContent === t);
const click = (el?: Element) => act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
async function setup(role: Viewer['role'], now = () => date) {
    const src = memorySource(demoRows(date));
    const host = document.createElement('div'); document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(AdminView, { source: src, viewer: viewer(role), date, now })));
    return { host, src };
}

describe('보결 관리 화면', () => {
    it('교사에겐 막힘 문구만 보인다', async () => {
        const { host } = await setup('교사');
        expect(host.textContent).toContain('관리 권한이 없습니다');
        expect(host.querySelectorAll('button').length).toBe(0);
    });
    it('삭제는 인라인 확인을 거쳐야 지워진다(취소하면 그대로)', async () => {
        const { host, src } = await setup('교무');
        await click(btn(host, '삭제'));
        expect(host.querySelector('[role=alertdialog]')?.textContent).toContain('되돌릴 수 없습니다');
        expect((await src.loadSlots(date)).length).toBe(2);
        await click(btn(host, '취소'));
        expect((await src.loadSlots(date)).length).toBe(2);
        await click(btn(host, '삭제'));
        await click(btn(host, '확인'));
        expect((await src.loadSlots(date)).length).toBe(1);
        expect(host.textContent).toContain('삭제 처리했습니다');
    });
    it('지난 날 줄: 관리자 아닌 관리 역할은 버튼 없이 안내만', async () => {
        const src = memorySource(demoRows('2026-11-10'));
        const host = document.createElement('div'); document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AdminView, { source: src, viewer: viewer('교무'), date: '2026-11-10', now: () => date })));
        expect(btn(host, '삭제')).toBeUndefined();
        expect(host.textContent).toContain('관리자만 처리할 수 있습니다');
    });
});
