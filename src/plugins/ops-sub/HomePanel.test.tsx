// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { OpsSubHome } from './HomePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

function fakeHost(opts: { roster: boolean; onOpen?: (id: string) => void }) {
    return { views: { get: (id: string) => (opts.roster && id === 'substitute.sheet' ? {} : undefined) }, commands: { run: () => true }, workspace: { open: (id: string) => { opts.onOpen?.(id); } } } as never;
}

async function mount(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(el));
    return host;
}
const radio = (host: HTMLElement, label: string) => [...host.querySelectorAll('button[role=radio]')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

describe('보결 화면', () => {
    it('목록·내 보결 탭으로 오간다', async () => {
        const host = await mount(createElement(OpsSubHome, { host: fakeHost({ roster: false }) }));
        expect(radio(host, '보결 목록')?.getAttribute('aria-checked')).toBe('true');
        expect(radio(host, '내 보결')?.getAttribute('aria-checked')).toBe('false');
        await act(async () => { radio(host, '내 보결')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(radio(host, '내 보결')?.getAttribute('aria-checked')).toBe('true');
        expect(radio(host, '보결 목록')?.getAttribute('aria-checked')).toBe('false');
    });

    it('보결 명단이 켜져 있으면 「보결 명단 열기」가 명단 화면을 연다', async () => {
        const ran: string[] = [];
        const host = await mount(createElement(OpsSubHome, { host: fakeHost({ roster: true, onOpen: (id) => ran.push(id) }) }));
        const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === '보결 명단 열기');
        await act(async () => { btn?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(ran).toEqual(['substitute.sheet']);
    });

    it('보결 명단이 꺼져 있으면 그 단추가 없다', async () => {
        const host = await mount(createElement(OpsSubHome, { host: fakeHost({ roster: false }) }));
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === '보결 명단 열기')).toBe(false);
    });
});
