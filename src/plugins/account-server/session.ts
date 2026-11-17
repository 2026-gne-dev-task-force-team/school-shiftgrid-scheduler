/**
 * account-server 본체(③ F2 · 10절) — 서버(Supabase Auth)로 「지금 누구」를 채운다. 순수 상태 + 주입받은 클라이언트.
 *   🔴 네트워크는 server-link 몫 — 여기선 server-link 가 만든 클라이언트를 빌려(getClient) supabase-js 메서드만 부른다.
 *      ⛔ `createClient(`·`fetch(` 를 이 폴더에서 직접 부르지 않는다.
 *   ⭐ 로컬 account 와 같은 약속 꼴(identity 0.2 · permit 0.1 · credential 0.1)을 낸다 — 소비자 무변경.
 *   🔴 서버 모드에서 identity.kind 에 'master' 를 내지 않는다(10-1) — 로그인 전 guest · 뒤 user.
 *   로그인 아이디 = 이메일(② 12절 1번 기본). 비밀번호는 이 모듈 밖으로 안 나간다(약속 인자·반환 0).
 */
import type { CurrentUser } from '../account/contracts/identity';
import type { CredentialMethod } from '../account/contracts/credential';
import type { Failure, LinkStatus } from '../server-link/contracts/server-link';

/** supabase-js 클라이언트에서 쓰는 만큼만(가짜로 갈아 끼울 수 있게). */
export interface AuthUser { id: string; email?: string | null }
export interface AuthClient {
    auth: {
        signInWithPassword(c: { email: string; password: string }): Promise<{ data: { user: AuthUser | null; session: unknown } | null; error: unknown }>;
        signOut(): Promise<{ error: unknown }>;
        getSession(): Promise<{ data: { session: { user: AuthUser } | null } | null; error?: unknown }>;
    };
    functions: {
        invoke(name: string, opts: { method?: 'GET' | 'POST'; body?: unknown }): Promise<{ data: unknown; error: unknown }>;
    };
}

/** 함수 `account` me 의 프로젝트 한 줄(③ 10절 · supabase/functions/account me). */
export interface MeProject { id: string; name: string | null; roles: string[]; personRef: string | null }

/**
 * 실패 갈래 — 화면이 이것으로 문구를 고른다.
 *   unconfigured: 서버 미설정·준비 전 · wrong-password: 이메일·비밀번호 틀림 · network·sleeping·server: 끊김(server-link 갈래)
 *   invalid-invite·invite-expired·invite-used·email-taken·weak-password·bad-request: 가입 함수 오류 code
 */
export type AuthFailReason =
    | 'unconfigured' | 'wrong-password' | 'network' | 'sleeping' | 'server'
    | 'invalid-invite' | 'invite-expired' | 'invite-used' | 'email-taken' | 'weak-password' | 'bad-request';
export type AuthResult = { ok: true; user: CurrentUser } | { ok: false; reason: AuthFailReason; message: string };

export const MIN_PASSWORD = 8;   // 10-5 · Auth 「Minimum password length」 8
export const PASSWORD_METHOD: CredentialMethod = { id: 'email-password', title: '이메일·비밀번호' };
/** 이 꾸러미가 identity.fields 에 꽂는 칸 이름('<pluginId>.<name>'). */
export const FIELD = {
    email: 'account-server.email',
    projectId: 'account-server.projectId',
    projectName: 'account-server.projectName',
    personRef: 'account-server.personRef',
} as const;

const GUEST: CurrentUser = Object.freeze({ kind: 'guest', displayName: '손님', verified: false, roles: [] }) as CurrentUser;

const SIGNUP_CODES: Record<string, AuthFailReason> = {
    invalid_invite: 'invalid-invite', invite_expired: 'invite-expired', invite_used: 'invite-used',
    email_taken: 'email-taken', weak_password: 'weak-password', bad_request: 'bad-request',
};

const MESSAGES: Record<AuthFailReason, string> = {
    'unconfigured': '서버에 아직 연결되지 않았습니다. 잠시 뒤 다시 해 보세요.',
    'wrong-password': '이메일이나 비밀번호가 맞지 않습니다.',
    'network': '인터넷 연결을 확인해 주세요.',
    'sleeping': '서버가 깨어나는 중입니다. 1~2분 뒤 다시 해 보세요.',
    'server': '서버에서 처리하지 못했습니다. 잠시 뒤 다시 해 보세요.',
    'invalid-invite': '초대 코드가 맞지 않습니다.',
    'invite-expired': '초대 코드 기한이 지났습니다. 관리자에게 새 코드를 받으세요.',
    'invite-used': '이미 쓰인 초대 코드입니다.',
    'email-taken': '이미 가입된 이메일입니다. 로그인한 뒤 초대 코드로 참여하세요.',
    'weak-password': `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`,
    'bad-request': '입력한 내용을 다시 확인해 주세요.',
};

const fail = (reason: AuthFailReason, message?: string): AuthResult => ({ ok: false, reason, message: message ?? MESSAGES[reason] });

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

export interface AccountServerDeps {
    /** server-link 가 만든 클라이언트 — 미설정·준비 전이면 null. */
    getClient(): AuthClient | null;
    /** server-link 의 끊김 갈래(classify) — 같은 네 갈래로 접는다. */
    classify(e: unknown): Failure;
}

export interface AccountServer {
    current(): CurrentUser;
    onIdentityChange(fn: () => void): { dispose(): void };
    can(permission: string): boolean;
    methods(): CredentialMethod[];
    challenge(methodId: string, userId: string): Promise<boolean>;
    signIn(email: string, password: string): Promise<AuthResult>;
    signUp(inviteCode: string, email: string, password: string): Promise<AuthResult>;
    signOut(): Promise<void>;
    /** 내 프로젝트들(me) — 로그인 뒤 채워진다. */
    projects(): MeProject[];
    /** 지금 프로젝트를 바꾼다(역할·personRef 가 그 프로젝트 것으로). 모르는 id 면 false. */
    selectProject(id: string): boolean;
    /** server-link 상태가 바뀌었을 때 — 로그아웃이면 손님으로, 로그인인데 사람을 모르면(새로고침 복원) 세션에서 읽는다. */
    linkChanged(s: LinkStatus): Promise<void>;
}

export function createAccountServer(deps: AccountServerDeps): AccountServer {
    let user: AuthUser | null = null;
    let projects: MeProject[] = [];
    let projectId: string | null = null;
    let cached: CurrentUser = GUEST;
    const listeners = new Set<() => void>();

    const build = (): CurrentUser => {
        if (!user) return GUEST;
        const p = projects.find((x) => x.id === projectId) ?? null;
        const email = user.email ?? '';
        const fields: Record<string, unknown> = { [FIELD.email]: email };
        if (p) {
            fields[FIELD.projectId] = p.id;
            fields[FIELD.projectName] = p.name;
            fields[FIELD.personRef] = p.personRef;
        }
        return { kind: 'user', id: user.id, displayName: email || '이름 없는 계정', verified: true, roles: p ? [...p.roles] : [], fields };
    };
    const emit = () => {
        cached = build();
        for (const fn of [...listeners]) fn();
    };

    function reason(e: unknown, signupCode?: string): AuthFailReason {
        if (signupCode && SIGNUP_CODES[signupCode]) return SIGNUP_CODES[signupCode];
        const f = deps.classify(e);
        if (f.kind === 'network' || f.kind === 'sleeping') return f.kind;
        if (f.kind === 'server' && f.status === 400 && (f.code === 'invalid_credentials' || /invalid login/i.test(f.message ?? ''))) return 'wrong-password';
        if (f.kind === 'unauthorized') return 'wrong-password';
        return 'server';
    }

    /** 함수 오류(FunctionsHttpError)의 몸 `{error:{code,message}}` 를 읽어 code 를 꺼낸다 — 몸이 이미 풀려 있으면 그대로. */
    async function errorCode(e: unknown): Promise<string | undefined> {
        if (!isRec(e)) return undefined;
        const ctx = e.context;
        if (isRec(ctx) && typeof ctx.json === 'function') {
            try {
                const body = await (ctx.json as () => Promise<unknown>)();
                if (isRec(body) && isRec(body.error) && typeof body.error.code === 'string') return body.error.code;
            } catch { /* 몸이 JSON 이 아니면 갈래만 */ }
        }
        return deps.classify(e).code;
    }

    async function loadMe(c: AuthClient): Promise<void> {
        try {
            const { data, error } = await c.functions.invoke('account/me', { method: 'GET' });
            if (error || !isRec(data) || !Array.isArray(data.projects)) return;
            projects = (data.projects as unknown[]).filter(isRec).map((p) => ({
                id: String(p.id),
                name: typeof p.name === 'string' ? p.name : null,
                roles: Array.isArray(p.roles) ? p.roles.filter((r): r is string => typeof r === 'string') : [],
                personRef: typeof p.personRef === 'string' ? p.personRef : null,
            }));
            if (!projects.some((p) => p.id === projectId)) projectId = projects[0]?.id ?? null;
        } catch { /* me 가 실패해도 로그인은 산다 — 역할 없음으로 */ }
    }

    async function settle(c: AuthClient, u: AuthUser): Promise<CurrentUser> {
        user = { id: u.id, email: u.email ?? null };
        await loadMe(c);
        emit();
        return cached;
    }

    function reset() {
        if (!user && projects.length === 0) return;
        user = null; projects = []; projectId = null;
        emit();
    }

    async function signIn(email: string, password: string): Promise<AuthResult> {
        const c = deps.getClient();
        if (!c) return fail('unconfigured');
        const mail = email.trim().toLowerCase();
        if (!mail || !password) return fail('wrong-password');
        let res: Awaited<ReturnType<AuthClient['auth']['signInWithPassword']>>;
        try {
            res = await c.auth.signInWithPassword({ email: mail, password });
        } catch (e) {
            return fail(reason(e));
        }
        if (res.error || !res.data?.user) return fail(reason(res.error ?? { status: 400, code: 'invalid_credentials' }));
        return { ok: true, user: await settle(c, res.data.user) };
    }

    async function signUp(inviteCode: string, email: string, password: string): Promise<AuthResult> {
        const c = deps.getClient();
        if (!c) return fail('unconfigured');
        const code = inviteCode.trim();
        const mail = email.trim().toLowerCase();
        if (!code) return fail('invalid-invite');
        if (!mail.includes('@')) return fail('bad-request', '이메일 꼴이 아닙니다.');
        if (password.length < MIN_PASSWORD) return fail('weak-password');
        let res: { data: unknown; error: unknown };
        try {
            res = await c.functions.invoke('account/signup', { method: 'POST', body: { inviteCode: code, email: mail, password } });
        } catch (e) {
            return fail(reason(e));
        }
        if (res.error) return fail(reason(res.error, await errorCode(res.error)));
        // ③ 10-3 — 가입 함수가 계정을 만들면 화면이 이어서 signInWithPassword(바로 로그인 상태).
        return signIn(mail, password);
    }

    return {
        current: () => cached,
        onIdentityChange(fn) {
            listeners.add(fn);
            return { dispose: () => { listeners.delete(fn); } };
        },
        // 🔴 화면 가리기만 — 막는 것은 함수의 권한 검사(10-1). 손님은 아무것도, 로그인한 구성원은 다 보인다(가안).
        can: () => cached.kind === 'user',
        methods: () => [PASSWORD_METHOD],
        // 증명 = 지금 그 사람으로 로그인돼 있나. 입력 화면은 상태바 로그인 판이 띄운다(비밀번호는 약속 밖).
        challenge: async (methodId, userId) => methodId === PASSWORD_METHOD.id && cached.kind === 'user' && cached.id === userId,
        signIn,
        signUp,
        async signOut() {
            const c = deps.getClient();
            try { await c?.auth.signOut(); } catch { /* 끊겨도 이 기기에선 손님으로 */ }
            reset();
        },
        projects: () => projects.map((p) => ({ ...p, roles: [...p.roles] })),
        selectProject(id) {
            if (!projects.some((p) => p.id === id)) return false;
            if (id !== projectId) { projectId = id; emit(); }
            return true;
        },
        async linkChanged(s) {
            if (s !== 'signed-in') { reset(); return; }
            if (user) return;
            const c = deps.getClient();
            if (!c) return;
            try {
                const { data } = await c.auth.getSession();
                const u = data?.session?.user;
                if (u && !user) await settle(c, u);
            } catch { /* 세션을 못 읽으면 손님으로 남는다 */ }
        },
    };
}
