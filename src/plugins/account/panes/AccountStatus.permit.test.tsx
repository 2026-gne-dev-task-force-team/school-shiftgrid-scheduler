// @vitest-environment jsdom
/** QK-2 — 상태바 이름 메뉴에 지금 가진 역할 이름들과 권한 수(마스터·손님은 그 사실만)를 보인다. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ cur: { kind: 'user', displayName: '김', verified: true } as { kind: string; displayName: string; verified: boolean }, roles: ['역할자', '열람'] }));
vi.mock('../core', () => ({
    getCurrent: () => m.cur, can: (p: string) => p !== 'c',
    currentRoleNames: () => m.roles,
    hasProjectPassword: () => false, logout: () => {}, loginMaster: async () => false,
    openAccount: () => {}, checkLoginId: () => ({ kind: 'empty' }), loginWithPassword: async () => true,
    setupAndLogin: async () => true, credentialMethods: () => [], canLogout: () => true,
}));
vi.mock('./useAccount', () => ({ useAccountVersion: () => 0, allPermissions: () => [{ id: 'a', title: 'a' }, { id: 'b', title: 'b' }, { id: 'c', title: 'c' }] }));
import { AccountStatus } from './AccountStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function line(): string {
    document.body.innerHTML = '';
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<AccountStatus host={{} as never} />); });
    act(() => { (el.querySelector('button') as HTMLElement).click(); });
    const t = document.querySelector('[data-acc-permit]')?.textContent ?? '';
    act(() => { root.unmount(); });
    return t;
}

describe('상태바 이름 메뉴 — 지금 권한', () => {
    it('사용자: 역할 이름들과 권한 수', () => {
        m.cur = { kind: 'user', displayName: '김', verified: true };
        expect(line()).toBe('역할 역할자·열람 · 권한 2개');
    });
    it('마스터·손님은 그 사실만', () => {
        m.cur = { kind: 'master', displayName: '마스터', verified: true };
        expect(line()).toBe('모든 권한');
        m.cur = { kind: 'guest', displayName: '손님', verified: false };
        expect(line()).toBe('손님 권한');
    });
});
