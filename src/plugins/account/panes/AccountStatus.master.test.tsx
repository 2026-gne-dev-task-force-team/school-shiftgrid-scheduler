// @vitest-environment jsdom
/** 중 1 — 프로젝트 암호가 없을 때 「마스터로 들어가기」는 암호를 묻지 않고 안내한다(틀림 문구 아님). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ has: false, logout: vi.fn(), loginMaster: vi.fn(async () => false) }));
vi.mock('../core', () => ({
    getCurrent: () => ({ kind: 'user', displayName: '김', verified: true }),
    hasProjectPassword: () => m.has, logout: m.logout, loginMaster: m.loginMaster,
    openAccount: () => {}, checkLoginId: () => ({ kind: 'empty' }), loginWithPassword: async () => true,
    setupAndLogin: async () => true, credentialMethods: () => [], canLogout: () => true,
    can: () => false, currentRoleNames: () => [],
}));
vi.mock('./useAccount', () => ({ useAccountVersion: () => 0, allPermissions: () => [] }));
import { AccountStatus } from './AccountStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLElement;

function open() {
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<AccountStatus host={{} as never} />); });
    act(() => { (el.querySelector('button') as HTMLElement).click(); });
    act(() => { btn('마스터로 들어가기').click(); });
    return root;
}

describe('마스터로 들어가기 — 암호 없음', () => {
    it('걸린 암호가 없으면 안내만 뜨고 암호 칸 없이 들어간다', async () => {
        m.has = false;
        const root = open();
        expect(document.body.textContent).toContain('프로젝트 암호가 아직 없습니다');
        expect(document.querySelector('input[type=password]')).toBeNull();
        await act(async () => { btn('들어가기').click(); });
        expect(m.logout).toHaveBeenCalled();
        expect(m.loginMaster).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('암호가 맞지 않습니다');
        act(() => { root.unmount(); });
    });

    it('암호가 걸려 있으면 예전처럼 암호 칸이 뜬다', () => {
        m.has = true; document.body.innerHTML = '';
        const root = open();
        expect(document.querySelector('input[type=password]')).not.toBeNull();
        act(() => { root.unmount(); });
    });
});
