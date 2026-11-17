// 함수 `account` ① (판 B4) — signup(초대 코드) · join · me · projects 만들기(아무나 · 만든 이 = 관리자).
// 설계: ② 2-3 `account` 줄 · ③ 10-3 들어오는 길 · ③ 11-1 공통. 판정은 이 파일(순수) — DB·Auth 는 주입받는다.
// 하위 경로(`/functions/v1/account/<…>`):
//   POST signup {inviteCode, email, password}      — 로그인 전(config.toml verify_jwt=false)
//   POST projects/:pid/join {inviteCode}            — 로그인
//   GET  me                                         — 로그인 · 내 프로젝트·역할·이름(복호)
//   POST projects {name}                            — 로그인 · 누구나 · 만든 이 = 관리자
// 계정은 Auth 「Allow new users to sign up」 OFF 라 service_role 의 `auth.admin.createUser` 로만 만든다(② 6절 ⬜6).
// ② (판 B5) — 관리자만(교사 403 `forbidden`) · ③ 10-3·10-4·10-5:
//   POST   projects/:pid/invites {roles, personRef?, days?}  — 코드 원문은 이 응답에서 한 번만(저장은 sha256)
//   GET    projects/:pid/invites                           — 코드 원문·해시 없음
//   DELETE projects/:pid/invites/:id                       — 철회(쓰인 것 409)
//   POST   projects/:pid/invites/from-doc {days?, personRefs?} — doc 복호 → 사람마다 코드(역할 교사) · 표는 한 번만
//   GET    projects/:pid/members
//   PATCH  projects/:pid/members/:uid {roles?, personRef?, active?} — 마지막 관리자 빼기·정지 409 `last_admin`
//   POST   projects/:pid/members/:uid/reset-link            — `auth.admin.generateLink({type:'recovery'})` 링크를 한 번만

import { ROLES, type Role } from '../../../shared/roles.ts';
import { requireProjectMember, requireUser, type AuthClient, type Member } from '../_shared/auth.ts';
import { aadPart, aadProject } from '../_shared/crypto/aad.ts';
import { open, openText, sealText, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
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
    // ── ② (B5) ──
    /** 새 초대 여럿 — 원문은 받지 않는다(해시만) */
    insertInvites(rows: NewInvite[]): Promise<void>;
    /** 목록 — code_hash 는 읽지 않는다 */
    listInvites(projectId: string): Promise<InviteListRow[]>;
    /** 조건부 철회(안 쓰였고·안 철회된 행만) — 못 집었으면 왜인지 */
    revokeInvite(projectId: string, id: string, nowIso: string): Promise<'ok' | 'missing' | 'used' | 'revoked'>;
    listMembers(projectId: string): Promise<MemberRow[]>;
    /** 없는 구성원이면 'missing' · person_ref 겹침이면 'person_taken' */
    updateMember(projectId: string, userId: string, patch: MemberPatch): Promise<'ok' | 'missing' | 'person_taken'>;
    /** doc 조각 봉투(없으면 null) */
    readDoc(projectId: string): Promise<{ version: number; ct: Bytes } | null>;
}

export interface NewInvite {
    id: string;
    projectId: string;
    codeHash: Bytes;
    roles: Role[];
    personRef: string | null;
    expiresAt: string;
    createdBy: string;
}

export interface InviteListRow extends InviteRow {
    usedBy: string | null;
    createdBy: string;
    createdAt: string;
}

export interface MemberRow {
    userId: string;
    roles: string[];
    personRef: string | null;
    active: boolean;
}

export interface MemberPatch {
    roles?: Role[];
    personRef?: string | null;
    active?: boolean;
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
            getUserById(uid: string): PromiseLike<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
            /** 재설정 링크 — Auth 가 사용자당 recovery 토큰 하나만 둔다(새로 만들면 옛 것 무효 · 쓰면 무효) */
            generateLink(params: { type: 'recovery'; email: string }): PromiseLike<{
                data: { properties?: { action_link?: string } | null } | null;
                error: unknown;
            }>;
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
    forbidden: () => new HttpError(403, 'forbidden', '관리자만 할 수 있습니다'),
    lastAdmin: () => new HttpError(409, 'last_admin', '마지막 관리자는 관리자 빼기·정지를 할 수 없습니다'),
    noInvite: () => new HttpError(404, 'not_found', '없는 초대입니다'),
    noMember: () => new HttpError(404, 'not_found', '이 프로젝트 구성원이 아닙니다'),
    noDoc: () => new HttpError(409, 'no_doc', '시간표(doc)가 아직 올라오지 않았습니다'),
    noEmail: () => new HttpError(409, 'no_email', '이 계정에는 이메일이 없습니다'),
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

// ── ② 순수 도우미 ────────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 무작위 초대 코드 12자(base32 · 60비트) — 256 은 32 의 배수라 `% 32` 가 치우치지 않는다 */
export function newInviteCode(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => B32[b % 32]).join('');
}

/** 역할 목록 — 배열 · 1개 이상 · 아는 낱말만 · 겹침 없앰. 아니면 null. */
export function cleanRoles(v: unknown): Role[] | null {
    if (!Array.isArray(v) || v.length === 0) return null;
    if (!v.every((r) => typeof r === 'string' && (ROLES as readonly string[]).includes(r))) return null;
    return [...new Set(v as Role[])];
}

/** personRef — null(빼기) 또는 앞뒤 공백 뺀 1~100자. 꼴이 틀리면 undefined. */
export function cleanPersonRef(v: unknown): string | null | undefined {
    if (v === null) return null;
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    return s.length >= 1 && s.length <= 100 ? s : undefined;
}

/** 기한 일수 — 없으면 7 · 정수 1~30 */
export function cleanDays(v: unknown): number | null {
    if (v === undefined) return 7;
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 30 ? v : null;
}

const isLiveAdmin = (m: { roles: readonly string[] | null; active: boolean }): boolean =>
    m.active === true && (m.roles ?? []).includes('관리자');

/**
 * 구성원 고치기 판정(순수) — 고친 뒤 행을 돌려준다. 그 사람이 「살아 있는 관리자」였다가 아니게 되는데
 * 다른 살아 있는 관리자가 없으면 409 `last_admin`(관리자 빼기·정지 둘 다).
 */
export function judgeMemberPatch(members: readonly MemberRow[], userId: string, patch: MemberPatch): MemberRow {
    const cur = members.find((m) => m.userId === userId);
    if (!cur) throw accountErrors.noMember();
    const next: MemberRow = {
        userId,
        roles: patch.roles ?? cur.roles,
        personRef: patch.personRef !== undefined ? patch.personRef : cur.personRef,
        active: patch.active ?? cur.active,
    };
    if (isLiveAdmin(cur) && !isLiveAdmin(next) && !members.some((m) => m.userId !== userId && isLiveAdmin(m))) {
        throw accountErrors.lastAdmin();
    }
    return next;
}

/** 초대 상태 — 목록 표시용 */
export function inviteState(r: InviteRow, now: Date): 'pending' | 'used' | 'revoked' | 'expired' {
    if (r.revokedAt) return 'revoked';
    if (r.usedAt) return 'used';
    return Date.parse(r.expiresAt) > now.getTime() ? 'pending' : 'expired';
}

export interface DocPerson {
    personRef: string;
    name: string;
}

/**
 * doc 본문 → 초대할 사람 목록(순수). 담임 = 반마다 `homeroom:<반>`(이름 「<반> 담임」) ·
 * 전담·비교과 = agent id(이름 그대로) — ③ 10-2 personRef 공간 · sub-engine canon-input 과 같은 뜻.
 * 꼴이 틀린 칸은 건너뛴다. personRef 겹침은 앞의 것만.
 */
export function peopleFromDoc(body: unknown): DocPerson[] {
    const b = (body && typeof body === 'object' ? body : {}) as { tracks?: unknown; agents?: unknown };
    const out: DocPerson[] = [];
    const seen = new Set<string>();
    const push = (personRef: string, name: string) => {
        if (!personRef || seen.has(personRef)) return;
        seen.add(personRef);
        out.push({ personRef, name });
    };
    for (const t of Array.isArray(b.tracks) ? b.tracks : []) {
        const name = (t as { name?: unknown } | null)?.name;
        if (typeof name === 'string' && name.trim()) push(`homeroom:${name.trim()}`, `${name.trim()} 담임`);
    }
    for (const a of Array.isArray(b.agents) ? b.agents : []) {
        const { id, name } = (a ?? {}) as { id?: unknown; name?: unknown };
        if (typeof id === 'string' && id.trim()) push(id.trim(), typeof name === 'string' ? name : id.trim());
    }
    return out;
}

/** doc 봉투 열기 — 봉투 → gunzip → `{fmt, body}` 의 body(parts 와 같은 꼴 · AAD = part|doc|version) */
export async function openDocBody(ring: KeyRing, projectId: string, version: number, ct: Bytes): Promise<unknown> {
    const gz = await open(ring, ct, (kid) => aadPart(projectId, 'doc', version, kid));
    const plain = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(plain).text()) as { body?: unknown };
    return parsed.body;
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

// ── ② 관리자 경로(B5) ────────────────────────────────────────────

/** 401 → 403 not_member(비구성원·정지) → 403 forbidden(관리자 아님) */
async function requireAdmin(deps: AccountDeps, req: Request, projectId: string): Promise<Member> {
    const m = await requireProjectMember(deps.client, req.headers.get('Authorization'), projectId);
    if (!m.roles.includes('관리자')) throw accountErrors.forbidden();
    return m;
}

const nowOf = (deps: AccountDeps): Date => (deps.clock ?? systemClock)();
const expiresIso = (now: Date, days: number): string => new Date(now.getTime() + days * 86_400_000).toISOString();

async function createInvite(deps: AccountDeps, req: Request, projectId: string): Promise<Response> {
    const admin = await requireAdmin(deps, req, projectId);
    const body = await readJson(req);
    const roles = cleanRoles(body.roles);
    if (!roles) throw accountErrors.badRequest('역할은 아는 낱말 1개 이상의 배열입니다');
    const personRef = body.personRef === undefined ? null : cleanPersonRef(body.personRef);
    if (personRef === undefined) throw accountErrors.badRequest('personRef 는 1~100자 또는 null 입니다');
    const days = cleanDays(body.days);
    if (days === null) throw accountErrors.badRequest('days 는 1~30 정수입니다');
    const code = newInviteCode();
    const row: NewInvite = {
        id: (deps.newId ?? (() => ulid()))(),
        projectId,
        codeHash: await hashInviteCode(code),
        roles,
        personRef,
        expiresAt: expiresIso(nowOf(deps), days),
        createdBy: admin.userId,
    };
    await deps.store.insertInvites([row]);
    return jsonResponse({ id: row.id, code, roles, personRef, expiresAt: row.expiresAt }, 201);
}

async function listInvites(deps: AccountDeps, req: Request, projectId: string): Promise<Response> {
    await requireAdmin(deps, req, projectId);
    const now = nowOf(deps);
    const rows = await deps.store.listInvites(projectId);
    return jsonResponse({
        invites: rows.map((r) => ({
            id: r.id,
            roles: knownRoles(r.roles),
            personRef: r.personRef,
            expiresAt: r.expiresAt,
            usedAt: r.usedAt,
            usedBy: r.usedBy,
            revokedAt: r.revokedAt,
            createdBy: r.createdBy,
            createdAt: r.createdAt,
            state: inviteState(r, now),
        })),
    });
}

async function revokeInvite(deps: AccountDeps, req: Request, projectId: string, id: string): Promise<Response> {
    await requireAdmin(deps, req, projectId);
    const r = await deps.store.revokeInvite(projectId, id, nowOf(deps).toISOString());
    if (r === 'missing') throw accountErrors.noInvite();
    if (r === 'used') throw accountErrors.inviteUsed();
    return jsonResponse({ id, revoked: true });
}

async function invitesFromDoc(deps: AccountDeps, req: Request, projectId: string): Promise<Response> {
    const admin = await requireAdmin(deps, req, projectId);
    const body = await readJson(req);
    const days = cleanDays(body.days);
    if (days === null) throw accountErrors.badRequest('days 는 1~30 정수입니다');
    let only: Set<string> | null = null;
    if (body.personRefs !== undefined) {
        if (!Array.isArray(body.personRefs) || !body.personRefs.every((x) => typeof x === 'string')) {
            throw accountErrors.badRequest('personRefs 는 글자 배열입니다');
        }
        only = new Set(body.personRefs as string[]);
    }
    const doc = await deps.store.readDoc(projectId);
    if (!doc) throw accountErrors.noDoc();
    const people = peopleFromDoc(await openDocBody(await deps.keys(), projectId, doc.version, doc.ct)).filter(
        (p) => !only || only.has(p.personRef),
    );
    const now = nowOf(deps);
    const linked = new Set((await deps.store.listMembers(projectId)).map((m) => m.personRef).filter((x): x is string => !!x));
    const pending = new Set(
        (await deps.store.listInvites(projectId))
            .filter((r) => inviteState(r, now) === 'pending' && r.personRef)
            .map((r) => r.personRef as string),
    );
    const expiresAt = expiresIso(now, days);
    const out: { name: string; personRef: string; code: string; inviteId: string }[] = [];
    const rows: NewInvite[] = [];
    let skippedLinked = 0;
    let skippedPending = 0;
    for (const p of people) {
        if (linked.has(p.personRef)) {
            skippedLinked++;
            continue;
        }
        if (pending.has(p.personRef)) {
            skippedPending++;
            continue;
        }
        const code = newInviteCode();
        const id = (deps.newId ?? (() => ulid()))();
        rows.push({ id, projectId, codeHash: await hashInviteCode(code), roles: ['교사'], personRef: p.personRef, expiresAt, createdBy: admin.userId });
        out.push({ name: p.name, personRef: p.personRef, code, inviteId: id });
    }
    if (rows.length > 0) await deps.store.insertInvites(rows);
    return jsonResponse({ expiresAt, invites: out, skipped: { linked: skippedLinked, pending: skippedPending } }, 201);
}

async function listMembers(deps: AccountDeps, req: Request, projectId: string): Promise<Response> {
    await requireAdmin(deps, req, projectId);
    const rows = await deps.store.listMembers(projectId);
    return jsonResponse({
        members: rows.map((m) => ({ userId: m.userId, roles: knownRoles(m.roles), personRef: m.personRef, active: m.active })),
    });
}

async function patchMember(deps: AccountDeps, req: Request, projectId: string, userId: string): Promise<Response> {
    await requireAdmin(deps, req, projectId);
    const body = await readJson(req);
    const patch: MemberPatch = {};
    if (body.roles !== undefined) {
        const roles = cleanRoles(body.roles);
        if (!roles) throw accountErrors.badRequest('역할은 아는 낱말 1개 이상의 배열입니다');
        patch.roles = roles;
    }
    if (body.personRef !== undefined) {
        const pr = cleanPersonRef(body.personRef);
        if (pr === undefined) throw accountErrors.badRequest('personRef 는 1~100자 또는 null 입니다');
        patch.personRef = pr;
    }
    if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') throw accountErrors.badRequest('active 는 참/거짓입니다');
        patch.active = body.active;
    }
    if (Object.keys(patch).length === 0) throw accountErrors.badRequest('roles·personRef·active 중 하나는 있어야 합니다');
    const next = judgeMemberPatch(await deps.store.listMembers(projectId), userId, patch);
    const r = await deps.store.updateMember(projectId, userId, patch);
    if (r === 'missing') throw accountErrors.noMember();
    if (r === 'person_taken') throw accountErrors.personTaken();
    return jsonResponse({ userId, roles: knownRoles(next.roles), personRef: next.personRef, active: next.active });
}

async function resetLink(deps: AccountDeps, req: Request, projectId: string, userId: string): Promise<Response> {
    await requireAdmin(deps, req, projectId);
    if (!(await deps.store.listMembers(projectId)).some((m) => m.userId === userId)) throw accountErrors.noMember();
    const u = await deps.client.auth.admin.getUserById(userId);
    if (u.error || !u.data.user) throw accountErrors.noMember();
    const email = u.data.user.email;
    if (!email) throw accountErrors.noEmail();
    const g = await deps.client.auth.admin.generateLink({ type: 'recovery', email });
    const link = g.data?.properties?.action_link;
    if (g.error || !link) throw new Error('generateLink 실패');
    // 링크는 저장·기록하지 않는다 — 이 응답(no-store)에서 한 번만 보인다.
    return jsonResponse({ userId, link }, 201);
}

const ADMIN_ROUTES: {
    match: (p: string[]) => boolean;
    method: string;
    run: (deps: AccountDeps, req: Request, p: string[]) => Promise<Response>;
}[] = [
    { match: (p) => p.length === 3 && p[2] === 'invites', method: 'POST', run: (d, r, p) => createInvite(d, r, p[1]) },
    { match: (p) => p.length === 3 && p[2] === 'invites', method: 'GET', run: (d, r, p) => listInvites(d, r, p[1]) },
    { match: (p) => p.length === 4 && p[2] === 'invites' && p[3] === 'from-doc', method: 'POST', run: (d, r, p) => invitesFromDoc(d, r, p[1]) },
    { match: (p) => p.length === 4 && p[2] === 'invites' && p[3] !== 'from-doc', method: 'DELETE', run: (d, r, p) => revokeInvite(d, r, p[1], p[3]) },
    { match: (p) => p.length === 3 && p[2] === 'members', method: 'GET', run: (d, r, p) => listMembers(d, r, p[1]) },
    { match: (p) => p.length === 4 && p[2] === 'members', method: 'PATCH', run: (d, r, p) => patchMember(d, r, p[1], p[3]) },
    { match: (p) => p.length === 5 && p[2] === 'members' && p[4] === 'reset-link', method: 'POST', run: (d, r, p) => resetLink(d, r, p[1], p[3]) },
];

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
            if (p[0] === 'projects' && p.length >= 3) {
                const hits = ADMIN_ROUTES.filter((x) => x.match(p));
                const hit = hits.find((x) => x.method === method);
                if (hit) return hit.run(deps, r, p);
                if (hits.length > 0) throw errors.methodNotAllowed();
            }
            throw errors.notFound();
        });
}
