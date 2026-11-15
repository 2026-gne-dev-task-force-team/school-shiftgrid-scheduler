// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoAux, memoryAuxSource } from './source';
import { AuxStatus } from './AuxStatus';
import { AuxPanel } from './AuxPanel';
import { opsAuxPlugin } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
const mount = async (el: ReactElement) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    await act(async () => createRoot(host).render(el));
    return host;
};

describe('상태바 배지', () => {
    it('14일 안 재배정 필요 건수를 보이고, 0건이면 숨긴다', async () => {
        const bad = demoAux(); bad.base[0].classKey = '3-2'; // 목요일 3-2 → 11-19 체험학습에 걸린다
        const host = await mount(<AuxStatus source={memoryAuxSource(bad)} today="2026-11-15" />);
        expect(host.textContent).toBe('재배정 필요 1건');
        const none = await mount(<AuxStatus source={memoryAuxSource(demoAux())} today="2026-11-15" />);
        expect(none.textContent).toBe('');
    });
    it('배지를 누르면(클릭·Enter) 열기가 불린다', async () => {
        const bad = demoAux(); bad.base[0].classKey = '3-2';
        let opened = 0;
        const host = await mount(<AuxStatus source={memoryAuxSource(bad)} today="2026-11-15" onOpen={() => { opened++; }} />);
        const b = host.querySelector('[role="button"][data-testid="aux-status"]')!;
        await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(opened).toBe(1);
        await act(async () => { b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(opened).toBe(2);
    });
    it('상태바 render 가 host.commands.run(ops-aux.open) 으로 잇는다', async () => {
        const ran: string[] = [];
        const el = opsAuxPlugin.renders!.AuxStatus({ commands: { run: (id: string) => { ran.push(id); return true; } } } as never) as ReactElement<{ onOpen: () => void }>;
        el.props.onOpen();
        expect(ran).toEqual(['ops-aux.open']);
    });
    it('플러그인이 상태바 오른쪽에 배지를 건다', () => {
        const sb = opsAuxPlugin.manifest.contributes?.statusBar;
        expect(sb?.[0]).toMatchObject({ id: 'ops-aux.badge', side: 'right', render: 'AuxStatus' });
    });
});

describe('근태 패널 탭', () => {
    it('「월 정산」 탭을 누르면 MonthView 가 뜬다', async () => {
        const host = await mount(<AuxPanel source={memoryAuxSource(demoAux())} viewer={{ userId: 'u', role: '근태담당' }} />);
        expect(host.textContent).toContain('명부 2명');
        await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === '월 정산')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(host.textContent).toContain('예외 더하기');
        expect(host.textContent).not.toContain('명부 2명');
    });
    const toMonth = async () => {
        const host = await mount(<AuxPanel source={memoryAuxSource(demoAux())} viewer={{ userId: 'u', role: '근태담당' }} />);
        await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === '월 정산')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(host.textContent).toContain('예외 더하기');
        return host;
    };
    it('이미 「월 정산」 탭인 패널에서 배지 길을 타면 「배정」 탭으로 바뀐다', async () => {
        const host = await toMonth();
        const el = opsAuxPlugin.renders!.AuxStatus({ commands: { run: () => true } } as never) as ReactElement<{ onOpen: () => void }>;
        await act(async () => { el.props.onOpen(); });
        expect(host.textContent).toContain('명부 2명');
    });
    it('일반 열기(명령만)는 탭을 바꾸지 않는다', async () => {
        const host = await toMonth();
        await act(async () => { opsAuxPlugin.commands!['ops-aux.open']({ workspace: { open: () => {} } } as never); });
        expect(host.textContent).toContain('예외 더하기');
        expect(host.textContent).not.toContain('명부 2명');
    });
});
