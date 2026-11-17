/**
 * 구성원·초대 호출(③ F3 · 10절 관리자 경로) — 함수 `account` 의 P/invites…·P/members… 를 부른다.
 *   🔴 네트워크는 server-link 몫 — 클라이언트를 빌려(getClient) functions.invoke 만 부른다. ⛔ `createClient(`·`fetch(` 직접.
 *   🔴 코드·링크 원문은 이 모듈이 **들고 있지 않는다** — 응답을 그대로 화면에 넘기고 끝(캐시·기록 0). 다시 그리는 길이 없게.
 *   요청·응답 꼴의 정본은 supabase/functions/account/handler.ts(B5).
 */
import type { Failure } from '../../server-link/contracts/server-link';

/** functions.invoke 만 — 관리자 경로는 PATCH·DELETE 도 쓴다(supabase-js FunctionInvokeOptions.method). */
export interface MembersClient {
    functions: {
        invoke(name: string, opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<{ data: unknown; error: unknown }>;
    };
}

export interface Member { userId: string; roles: string[]; personRef: string | null; active: boolean }
export type InviteState = 'pending' | 'used' | 'revoked' | 'expired';
export interface InviteRow { id: string; roles: string[]; personRef: string | null; expiresAt: string; state: InviteState }
/** 만든 직후 한 번만 — 원문 code 가 든다. */
export interface NewInvite { id: string; code: string; roles: string[]; personRef: string | null; expiresAt: string }
export interface DocInvites {
    expiresAt: string;
    invites: { name: string; personRef: string; code: string; inviteId: string }[];
    skipped: { linked: number; pending: number };
}
export interface MemberPatch { roles?: string[]; personRef?: string | null; active?: boolean }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** 함수 오류 code → 선생님이 읽는 말. 모르는 code 는 server 문구. */
export const MEMBER_MESSAGES: Record<string, string> = {
    last_admin: '이 분이 마지막 관리자라서 관리자를 빼거나 정지할 수 없습니다. 다른 분을 먼저 관리자로 정해 주세요.',
    forbidden: '관리자만 할 수 있는 일입니다.',
    not_member: '이 프로젝트에 들어와 있지 않거나 정지된 계정입니다.',
    unauthorized: '다시 로그인해 주세요.',
    person_taken: '이 사람 자리는 이미 다른 계정과 이어져 있습니다.',
    invite_used: '이미 쓰인 초대라 취소할 수 없습니다.',
    not_found: '찾을 수 없습니다. 목록을 새로 불러와 보세요.',
    no_doc: '서버에 아직 시간표가 올라오지 않아 명단을 읽을 수 없습니다.',
    no_email: '이 계정에는 이메일이 없어 재설정 링크를 만들 수 없습니다.',
    bad_request: '입력한 내용을 다시 확인해 주세요.',
    unconfigured: '서버에 아직 연결되지 않았습니다. 잠시 뒤 다시 해 보세요.',
    network: '인터넷 연결을 확인해 주세요.',
    sleeping: '서버가 깨어나는 중입니다. 1~2분 뒤 다시 해 보세요.',
    server: '서버에서 처리하지 못했습니다. 잠시 뒤 다시 해 보세요.',
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const INVITE_STATES: readonly InviteState[] = ['pending', 'used', 'revoked', 'expired'];

export interface MembersApi {
    listMembers(projectId: string): Promise<ApiResult<Member[]>>;
    patchMember(projectId: string, userId: string, patch: MemberPatch): Promise<ApiResult<Member>>;
    /** 재설정 링크 — 응답에서 한 번만. */
    resetLink(projectId: string, userId: string): Promise<ApiResult<{ userId: string; link: string }>>;
    listInvites(projectId: string): Promise<ApiResult<InviteRow[]>>;
    createInvite(projectId: string, input: { roles: string[]; personRef?: string | null; days?: number }): Promise<ApiResult<NewInvite>>;
    revokeInvite(projectId: string, inviteId: string): Promise<ApiResult<{ id: string }>>;
    invitesFromDoc(projectId: string, input?: { days?: number; personRefs?: string[] }): Promise<ApiResult<DocInvites>>;
}

export function createMembersApi(deps: { getClient(): MembersClient | null; classify(e: unknown): Failure }): MembersApi {
    const failed = (code: string): { ok: false; code: string; message: string } => ({ ok: false, code, message: MEMBER_MESSAGES[code] ?? MEMBER_MESSAGES.server });

    /** 함수 오류(FunctionsHttpError)의 몸 `{error:{code}}` → code. 없으면 server-link 갈래. */
    async function codeOf(e: unknown): Promise<string> {
        if (isRec(e) && isRec(e.context) && typeof e.context.json === 'function') {
            try {
                const body = await (e.context.json as () => Promise<unknown>)();
                if (isRec(body) && isRec(body.error) && typeof body.error.code === 'string') return body.error.code;
            } catch { /* 몸이 JSON 이 아니면 갈래만 */ }
        }
        const f = deps.classify(e);
        if (f.code && MEMBER_MESSAGES[f.code]) return f.code;
        return f.kind === 'network' || f.kind === 'sleeping' || f.kind === 'unauthorized' ? f.kind : 'server';
    }

    async function call<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown, read: (d: Rec) => T | null): Promise<ApiResult<T>> {
        const c = deps.getClient();
        if (!c) return failed('unconfigured');
        let res: { data: unknown; error: unknown };
        try {
            res = await c.functions.invoke(`account/${path}`, body === undefined ? { method } : { method, body });
        } catch (e) {
            return failed(await codeOf(e));
        }
        if (res.error) return failed(await codeOf(res.error));
        const v = isRec(res.data) ? read(res.data) : null;
        return v === null ? failed('server') : { ok: true, data: v };
    }

    const P = (pid: string) => `projects/${encodeURIComponent(pid)}`;
    const member = (m: unknown): Member | null =>
        isRec(m) && typeof m.userId === 'string'
            ? { userId: m.userId, roles: strs(m.roles), personRef: strOrNull(m.personRef), active: m.active !== false }
            : null;

    return {
        listMembers: (pid) => call(`${P(pid)}/members`, 'GET', undefined, (d) =>
            Array.isArray(d.members) ? d.members.map(member).filter((m): m is Member => m !== null) : null),
        patchMember: (pid, uid, patch) => call(`${P(pid)}/members/${encodeURIComponent(uid)}`, 'PATCH', patch, member),
        resetLink: (pid, uid) => call(`${P(pid)}/members/${encodeURIComponent(uid)}/reset-link`, 'POST', {}, (d) =>
            typeof d.link === 'string' && typeof d.userId === 'string' ? { userId: d.userId, link: d.link } : null),
        listInvites: (pid) => call(`${P(pid)}/invites`, 'GET', undefined, (d) =>
            Array.isArray(d.invites)
                ? d.invites.filter(isRec).filter((r) => typeof r.id === 'string').map((r) => ({
                    id: r.id as string,
                    roles: strs(r.roles),
                    personRef: strOrNull(r.personRef),
                    expiresAt: typeof r.expiresAt === 'string' ? r.expiresAt : '',
                    state: INVITE_STATES.includes(r.state as InviteState) ? (r.state as InviteState) : 'expired',
                }))
                : null),
        createInvite: (pid, input) => call(`${P(pid)}/invites`, 'POST', input, (d) =>
            typeof d.id === 'string' && typeof d.code === 'string'
                ? { id: d.id, code: d.code, roles: strs(d.roles), personRef: strOrNull(d.personRef), expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : '' }
                : null),
        revokeInvite: (pid, id) => call(`${P(pid)}/invites/${encodeURIComponent(id)}`, 'DELETE', undefined, (d) =>
            typeof d.id === 'string' ? { id: d.id } : null),
        invitesFromDoc: (pid, input = {}) => call(`${P(pid)}/invites/from-doc`, 'POST', input, (d) =>
            Array.isArray(d.invites)
                ? {
                    expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : '',
                    invites: d.invites.filter(isRec).filter((r) => typeof r.code === 'string').map((r) => ({
                        name: typeof r.name === 'string' ? r.name : '',
                        personRef: typeof r.personRef === 'string' ? r.personRef : '',
                        code: r.code as string,
                        inviteId: typeof r.inviteId === 'string' ? r.inviteId : '',
                    })),
                    skipped: {
                        linked: isRec(d.skipped) && typeof d.skipped.linked === 'number' ? d.skipped.linked : 0,
                        pending: isRec(d.skipped) && typeof d.skipped.pending === 'number' ? d.skipped.pending : 0,
                    },
                }
                : null),
    };
}
