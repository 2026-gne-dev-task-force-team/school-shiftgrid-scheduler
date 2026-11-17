// @vitest-environment jsdom
/**
 * 상태바 「지금 누구」 팝오버 들머리(T-10gs) — 역할별 단추 · 누르면 host 명령이 불린다(가짜 세션 · 지어낸 이름만).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ServerAccountStatus, MEMBERS_CMD } from './ServerAccountStatus';
import { PASSWORD_CMD } from '../password';
import type { AccountServer } from '../session';
import type { CurrentUser } from '../../account/contracts/identity';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const guest: CurrentUser = { kind: 'guest', displayName: '손님', verified: false, roles: [] };
const as = (roles: string[]): CurrentUser => ({ kind: 'user', id: 'u-1', displayName: 'kim.gamja@example.test', verified: true, roles });

const fakeSession = (cur: CurrentUser) => ({
    current: () => cur,
    onIdentityChange: () => ({ dispose() {} }),
} as unknown as AccountServer);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); host?.remove(); root = null; host = null; document.body.innerHTML = ''; });

function mount(cur: CurrentUser) {
    const ran: string[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(<ServerAccountStatus session={fakeSession(cur)} run={(id) => { ran.push(id); }} />); });
    act(() => { (document.querySelector('[data-acc-server-status]') as HTMLElement).click(); });
    return ran;
}
const act_ = (name: string) => document.querySelector<HTMLElement>(`[data-acc-act="${name}"]`);

describe('팝오버 들머리 단추', () => {
    it('교사: 비밀번호 바꾸기만 — 구성원·초대 없음', () => {
        mount(as(['교사']));
        expect(act_('password-change')).not.toBeNull();
        expect(act_('members')).toBeNull();
        expect(act_('password-reset')).toBeNull();
    });
    it('관리자: 구성원·초대도 보인다', () => {
        mount(as(['관리자']));
        expect(act_('members')).not.toBeNull();
    });
    it('손님(로그인 전): 비밀번호를 잊었어요만', () => {
        mount(guest);
        expect(act_('password-reset')).not.toBeNull();
        expect(act_('password-change')).toBeNull();
        expect(act_('members')).toBeNull();
    });
    it('누르면 해당 명령이 불리고 팝오버가 닫힌다', () => {
        let ran = mount(as(['관리자']));
        act(() => { act_('password-change')!.click(); });
        expect(ran).toEqual([PASSWORD_CMD.change]);
        expect(document.querySelector('[data-acc-pop]')).toBeNull();
        root!.unmount(); host!.remove();
        ran = mount(as(['관리자']));
        act(() => { act_('members')!.click(); });
        expect(ran).toEqual([MEMBERS_CMD]);
        root!.unmount(); host!.remove();
        ran = mount(guest);
        act(() => { act_('password-reset')!.click(); });
        expect(ran).toEqual([PASSWORD_CMD.reset]);
    });
});
