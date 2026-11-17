// 함수 `account` ① (판 B4) — signup(초대 코드) · join · me · projects 만들기(아무나 · 만든 이 = 관리자).
// 설계: ② 2-3 `account` 줄 · ③ 10-3 들어오는 길 · ③ 11-1 공통. 판정은 이 파일(순수) — DB·Auth 는 주입받는다.
// 하위 경로(`/functions/v1/account/<…>`):
//   POST signup {inviteCode, email, password}      — 로그인 전(config.toml verify_jwt=false)
//   POST projects/:pid/join {inviteCode}            — 로그인
//   GET  me                                         — 로그인 · 내 프로젝트·역할·이름(복호)
//   POST projects {name}                            — 로그인 · 누구나 · 만든 이 = 관리자
// 계정은 Auth 「Allow new users to sign up」 OFF 라 service_role 의 `auth.admin.createUser` 로만 만든다(② 6절 ⬜6).

import { ROLES, type Role } from '../../../shared/roles.ts';
import { requireUser, type AuthClient } from '../_shared/auth.ts';
import { aadProject } from '../_shared/crypto/aad.ts';
import { openText, sealText, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle, subPath } from '../_shared/http.ts';
import { systemClock, type Clock } from '../_shared/clock.ts';

export const FN_NAME = 'account';

/** 초대 행(필요한 칸만) */
export interface InviteRow {
    id: string;
    projectId: string;
    roles: string[];
    personRef: string | null;
    expiresAt: string;
    usedAt: string | null;
    revokedAt: string | null;
}

export interface MembershipRow {
    projectId: string;
    roles: string[] | null;
    personRef: string | null;
    active: boolean;
}

/** DB 쪽 — service_role 로 도는 표 읽기·쓰기(store.ts 가 supabase-js 로 채운다) */
export interface AccountStore {
    findInviteByHash(codeHash: Bytes): Promise<InviteRow | null>;
    /** 조건부 UPDATE — 안 쓰였고·안 철회됐고·안 지난 행만 used_at 을 채운다. 집었으면 true. */
    claimInvite(id: string, nowIso: string): Promise<boolean>;
    /** 집은 뒤 다음 단계가 실패했을 때 되돌림 */
    releaseInvite(id: string): Promise<void>;
    setInviteUser(id: string, userId: string): Promise<void>;
    memberExists(projectId: string, userId: string): Promise<boolean>;
    /** person_ref 겹침(23505)이면 'person_taken' · 그 밖 실패는 던진다 */
    insertMember(row: { projectId: string; userId: string; roles: Role[]; personRef: string | null }): Promise<'ok' | 'person_taken'>;
    insertProject(row: { id: string; nameCt: Bytes; dataEpoch: string; createdBy: string }): Promise<void>;
    deleteProject(id: string): Promise<void>;
    listMemberships(userId: string): Promise<MembershipRow[]>;
    projectNames(ids: string[]): Promise<{ id: string; nameCt: Bytes }[]>;
}

/** Auth 관리 API 결과(supabase-js `auth.admin.createUser` 의 쓰는 부분) */
export interface CreateUserResult {
    data: { user: { id: string } | null };
    error: { status?: number; code?: string; message?: string } | null;
}

export interface AccountAuth extends AuthClient {
    auth: AuthClient['auth'] & {
        admin: {
            createUser(attrs: { email: string; password: string; email_confirm: boolean }): PromiseLike<CreateUserResult>;
        };
    };
}

export interface AccountDeps {
    client: AccountAuth;
    store: AccountStore;
    keys(): Promise<KeyRing>;
    allowedOrigin: string | undefined;
    clock?: Clock;
    /** 프로젝트 id(ULID 꼴) · data_epoch 만들기 — 시험은 고정값 */
    newId?: () => string;
    newEpoch?: () => string;
}

// ── 오류 낱말(이 함수 몫) ──────────────────────────────────────────
export const accountErrors = {
    badRequest: (msg: string) => new HttpError(400, 'bad_request', msg),
    invalidInvite: () => new HttpError(400, 'invalid_invite', '초대 코드가 맞지 않습니다'),
    inviteExpired: () => new HttpError(400, 'invite_expired', '초대 코드 기한이 지났습니다'),
    inviteUsed: () => new HttpError(409, 'invite_used', '이미 쓰인 초대 코드입니다'),
    emailTaken: () => new HttpError(409, 'email_taken', '이미 가입된 이메일입니다 — 로그인 뒤 초대 코드로 참여하세요'),
    weakPassword: () => new HttpError(400, 'weak_password', '비밀번호가 규칙에 맞지 않습니다'),
    alreadyMember: () => new HttpError(409, 'already_member', '이미 이 프로젝트 구성원입니다'),
    personTaken: () => new HttpError(409, 'person_taken', '이 사람 자리는 이미 다른 계정과 이어져 있습니다'),
};

// ── 순수 도우미 ──────────────────────────────────────────────────
const CODE_ALPHABET = /^[A-Z2-7]{12}$/;

/** 초대 코드 정리 — 공백·하이픈을 빼고 대문자로. base32 12자가 아니면 null. */
export function normalizeInviteCode(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const s = raw.replace(/[\s-]/g, '').toUpperCase();
    return CODE_ALPHABET.test(s) ? s : null;
}

/** sha256(정리한 코드) — invites.code_hash 와 같은 꼴 */
export async function hashInviteCode(code: string): Promise<Bytes> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    return new Uint8Array(d);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(v: unknown): v is string {
    return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

/** 길이만 본다(규칙 본체는 Auth 몫 · bcrypt 72바이트 상한) */
export function validPassword(v: unknown): v is string {
    return typeof v === 'string' && v.length >= 8 && new TextEncoder().encode(v).length <= 72;
}

/** 프로젝트 이름 — 앞뒤 공백 뺀 1~100자 */
export function cleanProjectName(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s.length >= 1 && s.length <= 100 ? s : null;
}

const knownRoles = (rs: readonly string[] | null): Role[] =>
    (rs ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));

/** 초대 행 판정(순수) — 없음·철회 400 · 쓰임 409 · 지남 400. 통과면 그 행. */
export function judgeInvite(row: InviteRow | null, now: Date): InviteRow {
    if (!row || row.revokedAt) throw accountErrors.invalidInvite();
    if (row.usedAt) throw accountErrors.inviteUsed();
    if (!(Date.parse(row.expiresAt) > now.getTime())) throw accountErrors.inviteExpired();
    if (knownRoles(row.roles).length === 0) throw accountErrors.invalidInvite();
    return row;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID 꼴(시각 10자 + 무작위 16자) */
export function ulid(now: number = Date.now()): string {
    let t = '';
    let n = now;
    for (let i = 0; i < 10; i++) {
        t = CROCKFORD[n % 32] + t;
        n = Math.floor(n / 32);
    }
    const r = crypto.getRandomValues(new Uint8Array(16));
    return t + Array.from(r, (b) => CROCKFORD[b % 32]).join('');
}

const randomEpoch = (): string =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');

async function readJson(req: Request): Promise<Record<string, unknown>> {
    let v: unknown;
    try {
        v = await req.json();
    } catch {
        throw accountErrors.badRequest('본문이 JSON 이 아닙니다');
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw accountErrors.badRequest('본문이 객체가 아닙니다');
    return v as Record<string, unknown>;
}

// ── 경로 ─────────────────────────────────────────────────────────

/** 코드 → 판정한 초대 행 → 1회 집기. 지는 쪽(동시·두 번째)은 409. */
async function takeInvite(deps: AccountDeps, rawCode: unknown, projectId?: string): Promise<InviteRow> {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw accountErrors.invalidInvite();
    const now = (deps.clock ?? systemClock)();
    const row = judgeInvite(await deps.store.findInviteByHash(await hashInviteCode(code)), now);
    if (projectId !== undefined && row.projectId !== projectId) throw accountErrors.invalidInvite();
    return row;
}

async function claimOr409(deps: AccountDeps, row: InviteRow): Promise<void> {
    const now = (deps.clock ?? systemClock)();
    if (!(await deps.store.claimInvite(row.id, now.toISOString()))) throw accountErrors.inviteUsed();
}

async function addMemberFromInvite(deps: AccountDeps, row: InviteRow, userId: string): Promise<void> {
    const r = await deps.store.insertMember({
        projectId: row.projectId,
        userId,
        roles: knownRoles(row.roles),
        personRef: row.personRef,
    });
    if (r === 'person_taken') throw accountErrors.personTaken();
    await deps.store.setInviteUser(row.id, userId);
}

async function signup(deps: AccountDeps, req: Request): Promise<Response> {
    const body = await readJson(req);
    if (!validEmail(body.email)) throw accountErrors.badRequest('이메일 꼴이 아닙니다');
    if (!validPassword(body.password)) throw accountErrors.weakPassword();
    const row = await takeInvite(deps, body.inviteCode);
    await claimOr409(deps, row);
    try {
        const { data, error } = await deps.client.auth.admin.createUser({
            email: body.email.trim().toLowerCase(),
            password: body.password,
            email_confirm: true,
        });
        if (error || !data.user) {
            if (error?.code === 'email_exists' || (error?.status === 422 && /already/i.test(error.message ?? ''))) {
                throw accountErrors.emailTaken();
            }
            if (error?.code === 'weak_password') throw accountErrors.weakPassword();
            throw new Error('createUser 실패');
        }
        await addMemberFromInvite(deps, row, data.user.id);
        return jsonResponse({ userId: data.user.id, projectId: row.projectId, roles: knownRoles(row.roles) }, 201);
    } catch (e) {
        await deps.store.releaseInvite(row.id).catch(() => undefined);
        throw e;
    }
}

async function join(deps: AccountDeps, req: Request, projectId: string): Promise<Response> {
    const userId = await requireUser(deps.client, req.headers.get('Authorization'));
    const body = await readJson(req);
    const row = await takeInvite(deps, body.inviteCode, projectId);
    if (await deps.store.memberExists(projectId, userId)) throw accountErrors.alreadyMember();
    await claimOr409(deps, row);
    try {
        await addMemberFromInvite(deps, row, userId);
    } catch (e) {
        await deps.store.releaseInvite(row.id).catch(() => undefined);
        throw e;
    }
    return jsonResponse({ projectId, roles: knownRoles(row.roles) }, 201);
}

async function me(deps: AccountDeps, req: Request): Promise<Response> {
    const userId = await requireUser(deps.client, req.headers.get('Authorization'));
    const rows = (await deps.store.listMemberships(userId)).filter((m) => m.active === true && knownRoles(m.roles).length > 0);
    const names = new Map<string, string | null>();
    if (rows.length > 0) {
        const ring = await deps.keys();
        for (const p of await deps.store.projectNames(rows.map((m) => m.projectId))) {
            try {
                names.set(p.id, await openText(ring, p.nameCt, (kid) => aadProject(p.id, kid)));
            } catch {
                names.set(p.id, null);
            }
        }
    }
    return jsonResponse({
        userId,
        projects: rows.map((m) => ({
            id: m.projectId,
            name: names.get(m.projectId) ?? null,
            roles: knownRoles(m.roles),
            personRef: m.personRef,
        })),
    });
}

async function createProject(deps: AccountDeps, req: Request): Promise<Response> {
    const userId = await requireUser(deps.client, req.headers.get('Authorization'));
    const body = await readJson(req);
    const name = cleanProjectName(body.name);
    if (!name) throw accountErrors.badRequest('프로젝트 이름은 1~100자입니다');
    const id = (deps.newId ?? (() => ulid()))();
    const ring = await deps.keys();
    const nameCt = await sealText(ring, name, (kid) => aadProject(id, kid));
    await deps.store.insertProject({ id, nameCt, dataEpoch: (deps.newEpoch ?? randomEpoch)(), createdBy: userId });
    try {
        await deps.store.insertMember({ projectId: id, userId, roles: ['관리자'], personRef: null });
    } catch (e) {
        await deps.store.deleteProject(id).catch(() => undefined);
        throw e;
    }
    return jsonResponse({ id, name, roles: ['관리자'] }, 201);
}

export function accountHandler(deps: AccountDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            const method = r.method.toUpperCase();
            const p = subPath(r.url, FN_NAME);
            if (p.length === 1 && p[0] === 'signup') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return signup(deps, r);
            }
            if (p.length === 1 && p[0] === 'me') {
                if (method !== 'GET') throw errors.methodNotAllowed();
                return me(deps, r);
            }
            if (p.length === 1 && p[0] === 'projects') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return createProject(deps, r);
            }
            if (p.length === 3 && p[0] === 'projects' && p[2] === 'join') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return join(deps, r, p[1]);
            }
            throw errors.notFound();
        });
}
