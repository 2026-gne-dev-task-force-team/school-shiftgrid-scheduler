/**
 * 비밀번호 판 묶음(③ F4·F6) — account-server 꾸러미가 등록 줄로만 꽂는다.
 *   명령 둘(비번 바꾸기 · 재설정 메일) + 상태바 자리의 창 묶음(평소 빈칸) + 재설정 링크 착지.
 *   클라이언트는 server-link 것을 빌린다(account-server 가 넘겨준 link) — ⛔ createClient·fetch.
 */
import { createElement } from 'react';
import type { Disposable } from '../../../pane-ui-system/plugin';
import type { ServerLink } from '../../server-link/contracts/server-link';
import { FIELD, type AccountServer } from '../session';
import { createPasswordOps, type PasswordClient } from './password';
import { createRecovery } from './recovery';
import { PasswordDialogs } from './PasswordDialogs';
import { createPasswordUi } from './ui';

export const PASSWORD_CMD = {
    change: 'account-server.password.change',
    reset: 'account-server.password.reset',
} as const;

export function createPasswordKit(account: AccountServer) {
    let link: ServerLink | null = null;
    const getClient = () => (link?.client() as PasswordClient | null | undefined) ?? null;
    const classify = (e: unknown) => (link ? link.classify(e) : { kind: 'network' as const });
    const ui = createPasswordUi();
    const ops = createPasswordOps({
        getClient,
        classify,
        currentEmail: () => {
            const u = account.current();
            const m = u.kind === 'user' ? u.fields?.[FIELD.email] : null;
            return typeof m === 'string' && m ? m : null;
        },
        // 재설정 링크가 지금 판(미리보기 경로 포함)으로 돌아오게 — 대시보드 Redirect URLs 에 이 주소가 있어야 한다.
        redirectTo: () => (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined),
    });
    const recovery = createRecovery({ getClient, classify });
    let authSub: Disposable | null = null;
    let linkSub: Disposable | null = null;

    const tryAttach = () => {
        if (authSub) return;
        const c = getClient();
        if (c) authSub = recovery.attach(c);
    };

    return {
        ui, ops, recovery,
        /** 활성 때 — 주소를 먼저 읽고(클라이언트가 먹기 전), link 상태를 따라간다. */
        start(l: ServerLink | null) {
            recovery.capture();
            link = l;
            if (!l) return;
            linkSub = l.onChange((s) => { tryAttach(); recovery.linkChanged(s); });
            tryAttach();
            recovery.linkChanged(l.status());
        },
        stop() {
            authSub?.dispose(); authSub = null;
            linkSub?.dispose(); linkSub = null;
            link = null;
        },
        render: () => createElement(PasswordDialogs, { ui, ops, recovery, signedIn: () => account.current().kind === 'user' }),
    };
}
export type PasswordKit = ReturnType<typeof createPasswordKit>;
