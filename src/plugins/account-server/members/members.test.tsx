// @vitest-environment jsdom
/**
 * 구성원·초대 판(③ F3) — 가짜 functions.invoke 로 돈다(네트워크 0 · 실서버·키·URL 0 · 지어낸 이름만).
 *   ① 호출 꼴(경로·방법·몸) ② 코드·링크 원문은 만든 직후 한 번만 — 닫거나 판을 다시 열면 다시 그리지 않는다
 *   ③ 조작은 전부 확인창을 거친다 ④ last_admin 거절은 선생님 말로 ⑤ 이 폴더에 createClient·fetch 직접 0.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMembersApi, MEMBER_MESSAGES, type MembersClient } from './api';
import { MembersPane } from './MembersPane';
import { FIELD, type AccountServer } from '../session';
import type { Failure } from '../../server-link/contracts/server-link';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = 'QWER2345TYUI';
const LINK = 'https://example.test/recover?token=fake-once';

/** 가짜 서버 — 구성원·초대 표. 호출 기록(`방법 경로 몸`)을 남긴다. */
function fakeServer(opts: { lastAdmin?: boolean; offline?: boolean } = {}) {
    const calls: { name: string; method?: string; body?: unknown }[] = [];
    const members = [
        { userId: 'u-1', roles: ['관리자'], personRef: 'user:u-1', active: true },
        { userId: 'u-2', roles: ['교사'], personRef: 'homeroom:1-1', active: true },
    ];
    const invites: { id: string; roles: string[]; personRef: string | null; expiresAt: string; state: string }[] = [];
    const httpErr = (status: number, code: string) => ({
        name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code',
        context: { status, json: async () => ({ error: { code, message: code } }) },
    });
    const client: MembersClient = {
        functions: {
            async invoke(name, o) {
                calls.push({ name, method: o.method, body: o.body });
                if (opts.offline) throw Object.assign(new TypeError('Failed to fetch'), { name: 'FunctionsFetchError' });
                const p = name.split('/');   // account / projects / pid / ...
                if (p[3] === 'members' && p.length === 4 && o.method === 'GET') return { data: { members: members.map((m) => ({ ...m })) }, error: null };
                if (p[3] === 'members' && p.length === 5 && o.method === 'PATCH') {
                    const m = members.find((x) => x.userId === p[4]);
                    if (!m) return { data: null, error: httpErr(404, 'not_found') };
                    if (opts.lastAdmin) return { data: null, error: httpErr(409, 'last_admin') };
                    Object.assign(m, o.body);
                    return { data: { ...m }, error: null };
                }
                if (p[5] === 'reset-link' && o.method === 'POST') return { data: { userId: p[4], link: LINK }, error: null };
                if (p[3] === 'invites' && p.length === 4 && o.method === 'GET') return { data: { invites: invites.map((i) => ({ ...i })) }, error: null };
                if (p[3] === 'invites' && p.length === 4 && o.method === 'POST') {
                    const b = o.body as { roles: string[] };
                    const row = { id: `inv-${invites.length + 1}`, roles: b.roles, personRef: null, expiresAt: '2026-11-24T00:00:00.000Z', state: 'pending' };
                    invites.push(row);
                    return { data: { ...row, code: CODE }, error: null };   // 원문은 이 응답에만
                }
                if (p[4] === 'from-doc' && o.method === 'POST') {
                    return { data: { expiresAt: '2026-11-24T00:00:00.000Z', invites: [{ name: '김감자', personRef: 'teacher:t1', code: 'ZXCV6789BNMA', inviteId: 'inv-9' }], skipped: { linked: 1, pending: 0 } }, error: null };
                }
                if (p[3] === 'invites' && p.length === 5 && o.method === 'DELETE') {
                    const i = invites.find((x) => x.id === p[4]);
                    if (!i) return { data: null, error: httpErr(404, 'not_found') };
                    i.state = 'revoked';
                    return { data: { id: i.id, revoked: true }, error: null };
                }
                return { data: null, error: httpErr(404, 'not_found') };
            },
        },
    };
    return { client, calls, members, invites };
}

function classify(e: unknown): Failure {
    const r = (e ?? {}) as { status?: number; message?: string; context?: { status?: number } };
    const status = r.status ?? r.context?.status;
    if (!status) return { kind: 'network', message: r.message };
    return { kind: 'server', status };
}

/** 관리자로 로그인한 「지금 누구」 대역. */
function adminSession(roles: string[] = ['관리자']): AccountServer {
    return {
        current: () => ({ kind: 'user', id: 'u-1', displayName: 'kim.gamja@example.test', verified: true, roles, fields: { [FIELD.projectId]: 'p-1' } }),
        onIdentityChange: () => ({ dispose: () => { } }),
    } as unknown as AccountServer;
}

describe('호출 꼴 — 함수 account 관리자 경로', () => {
    it('경로·방법·몸이 handler 의 라우트와 맞는다', async () => {
        const s = fakeServer();
        const api = createMembersApi({ getClient: () => s.client, classify });
        expect((await api.listMembers('p-1')).ok).toBe(true);
        await api.patchMember('p-1', 'u-2', { roles: ['교사', '교무'] });
        await api.resetLink('p-1', 'u-2');
        await api.listInvites('p-1');
        const inv = await api.createInvite('p-1', { roles: ['교사'] });
        await api.revokeInvite('p-1', 'inv-1');
        await api.invitesFromDoc('p-1');
        expect(s.calls.map((c) => `${c.method} ${c.name}`)).toEqual([
            'GET account/projects/p-1/members',
            'PATCH account/projects/p-1/members/u-2',
            'POST account/projects/p-1/members/u-2/reset-link',
            'GET account/projects/p-1/invites',
            'POST account/projects/p-1/invites',
            'DELETE account/projects/p-1/invites/inv-1',
            'POST account/projects/p-1/invites/from-doc',
        ]);
        expect(s.calls[1].body).toEqual({ roles: ['교사', '교무'] });
        expect(inv.ok && inv.data.code).toBe(CODE);
    });
    it('last_admin 은 선생님 말로 · 끊김은 network · 미설정은 unconfigured', async () => {
        const r = await createMembersApi({ getClient: () => fakeServer({ lastAdmin: true }).client, classify }).patchMember('p-1', 'u-1', { active: false });
        expect(r).toEqual({ ok: false, code: 'last_admin', message: MEMBER_MESSAGES.last_admin });
        expect(r.ok ? '' : r.message).toMatch(/마지막 관리자/);
        const off = await createMembersApi({ getClient: () => fakeServer({ offline: true }).client, classify }).listMembers('p-1');
        expect(off.ok ? '' : off.code).toBe('network');
        const none = await createMembersApi({ getClient: () => null, classify }).listMembers('p-1');
        expect(none.ok ? '' : none.code).toBe('unconfigured');
    });
});

describe('구성원·초대 판', () => {
    let root: Root; let container: HTMLDivElement;
    beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
    afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; });

    const flush = async () => { for (let n = 0; n < 5; n++) await act(async () => { await Promise.resolve(); }); };
    const btn = (label: string, scope: ParentNode = document.body) =>
        [...scope.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
    const click = async (b: HTMLButtonElement | undefined) => { expect(b).toBeTruthy(); await act(async () => { b!.click(); }); await flush(); };
    const dialog = (title: string) => [...document.querySelectorAll('[role="dialog"]')].find((d) => (d.getAttribute('aria-label') ?? '').includes(title));
    const render = async (api: ReturnType<typeof createMembersApi>, session = adminSession()) => {
        await act(async () => { root.render(<MembersPane session={session} api={api} />); });
        await flush();
    };

    it('초대 코드 원문은 만든 직후 한 번만 — 창을 닫거나 판을 다시 열면 다시 그리지 않는다', async () => {
        const s = fakeServer();
        const api = createMembersApi({ getClient: () => s.client, classify });
        await render(api);
        await click(btn('초대 코드 만들기'));
        expect(s.calls.some((c) => c.method === 'POST')).toBe(false);          // 확인창 전엔 안 부른다
        await click(btn('코드 만들기'));
        expect(document.body.textContent).toContain(CODE);
        expect(document.querySelector('[data-secret]')).not.toBeNull();
        await click(btn('닫기', dialog('새 초대 코드')!));
        expect(document.body.textContent).not.toContain(CODE);
        expect(document.querySelector('[data-invite-row="inv-1"]')).not.toBeNull();   // 목록엔 줄만(원문 없음)
        // 판을 닫았다 다시 연다
        act(() => root.unmount());
        root = createRoot(container);
        await render(api);
        expect(document.body.textContent).not.toContain(CODE);
        expect(document.querySelector('[data-secret]')).toBeNull();
    });

    it('재설정 링크도 한 번만 · 명단 초대 표도 한 번만', async () => {
        const s = fakeServer();
        await render(createMembersApi({ getClient: () => s.client, classify }));
        const row = document.querySelector('[data-member-row="u-2"]')!;
        await click(btn('재설정 링크', row));
        await click(btn('링크 만들기'));
        expect(document.body.textContent).toContain(LINK);
        await click(btn('닫기', dialog('재설정 링크')!));
        expect(document.body.textContent).not.toContain(LINK);
        await click(btn('명단으로 초대'));
        await click(btn('명단으로 만들기'));
        expect(document.body.textContent).toContain('ZXCV6789BNMA');
        expect(document.body.textContent).toContain('김감자');
        await click(btn('닫기', dialog('명단 초대 코드')!));
        expect(document.body.textContent).not.toContain('ZXCV6789BNMA');
    });

    it('정지·역할·초대 취소는 확인창을 거친다 — 취소하면 안 부른다', async () => {
        const s = fakeServer();
        s.invites.push({ id: 'inv-7', roles: ['교사'], personRef: null, expiresAt: '2026-11-24T00:00:00.000Z', state: 'pending' });
        await render(createMembersApi({ getClient: () => s.client, classify }));
        const writes = () => s.calls.filter((c) => c.method !== 'GET').length;
        // 정지 — 취소하면 0, 확인하면 1
        await click(btn('정지', document.querySelector('[data-member-row="u-2"]')!));
        expect(dialog('정지할까요')).toBeTruthy();
        await click(btn('취소', dialog('정지할까요')!));
        expect(writes()).toBe(0);
        await click(btn('정지', document.querySelector('[data-member-row="u-2"]')!));
        await click(btn('정지', dialog('정지할까요')!));
        expect(s.calls.at(-3)).toMatchObject({ method: 'PATCH', body: { active: false } });
        expect(s.members[1].active).toBe(false);
        // 역할 — 고르기 창 → 확인창 → PATCH
        await click(btn('역할', document.querySelector('[data-member-row="u-2"]')!));
        await click(btn('다음'));
        expect(dialog('역할을 바꿀까요')).toBeTruthy();
        await click(btn('역할 바꾸기'));
        expect(s.calls.filter((c) => c.method === 'PATCH').length).toBe(2);
        // 초대 취소
        await click(btn('취소', document.querySelector('[data-invite-row="inv-7"]')!));
        expect(writes()).toBe(2);
        await click(btn('초대 취소'));
        expect(s.calls.some((c) => c.method === 'DELETE')).toBe(true);
    });

    it('last_admin 거절이 오면 선생님 말로 안내한다', async () => {
        const s = fakeServer({ lastAdmin: true });
        await render(createMembersApi({ getClient: () => s.client, classify }));
        await click(btn('정지', document.querySelector('[data-member-row="u-1"]')!));
        await click(btn('정지', dialog('정지할까요')!));
        expect(document.querySelector('[data-members-msg]')?.textContent).toBe(MEMBER_MESSAGES.last_admin);
    });

    it('관리자가 아니면 목록을 부르지 않고 안내만', async () => {
        const s = fakeServer();
        await render(createMembersApi({ getClient: () => s.client, classify }), adminSession(['교사']));
        expect(s.calls.length).toBe(0);
        expect(document.body.textContent).toContain('관리자만');
    });
});

describe('경계 — 네트워크는 server-link 몫', () => {
    it('members/ 에 createClient·fetch 직접 호출 0', () => {
        const dir = join(__dirname);
        for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !n.includes('.test.'))) {
            const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 주석 속 경고문은 뺀다
            expect(src, f).not.toMatch(/createClient\(|(?<![.\w])fetch\(/);
        }
    });
});
