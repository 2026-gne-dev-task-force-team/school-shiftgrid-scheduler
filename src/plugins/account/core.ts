/**
 * 계정 엔진 — 세션(누구)·판정(can)·증명 연결·관리 조작. 🔴 바닥 정책 0(쥔님 2026-11-08 14:54):
 *   역할 이름·권한 기본값을 박지 않는다. 붙이는 길 셋(직접·수준·역할)은 **부품**이고, 어느 길을 켤지는 정책 데이터가 쥔다.
 *
 * ⭐ 모듈 전역 상태(달력 nodes.ts·store.ts 와 같은 결) — index.ts 의 lifecycle 이 initAccount 로 쥐어 준다.
 *   세션(누가 로그인했나)은 기기별(host.storage) — 노드(프로젝트)엔 안 실린다. 열 때의 시작 상태는 프로젝트 암호 유무가 정한다.
 *
 * 🔴 import type 만 — 약속 타입은 약속 플러그인(contract-*)에서. 값은 host.modules.use 로 받는다(구조 검사 ⑱).
 */
import type { PluginHost, Disposable } from '../../pane-ui-system/plugin';
import type { CurrentUser } from '../contract-identity/types';
import type { Credential } from '../contract-credential/types';
import type { NodesApi, PublicNode } from '../contract-nodes/types';
import { makeHash, verifyHash } from './hash';
import type { Hashed } from './hash';
import {
    USER_TYPE, ROLE_TYPE, POLICY_TYPE, SECRET_TYPE,
    type UserData, type RoleData, type PolicyData, type SecretData,
} from './nodes';

// ── 전역 상태 ──
let nodesApi: NodesApi | null = null;
let hostRef: PluginHost | null = null;
let session: CurrentUser = guest();
let nodesUnsub: Disposable | null = null;
const identityListeners = new Set<() => void>();
const permitListeners = new Set<() => void>();

const SESSION_KEY = 'session';   // host.storage(기기별)

// ── 세션 꼴 ──
function master(): CurrentUser { return { kind: 'master', displayName: '마스터', verified: true, roles: [] }; }
function guest(): CurrentUser { return { kind: 'guest', displayName: '손님', verified: false, roles: [] }; }
function userSession(id: string, u: UserData, verified: boolean): CurrentUser {
    return { kind: 'user', id, displayName: u.displayName, verified, roles: [...u.roleIds], fields: { ...u.fields } };
}

// ── 노드 읽기 ──
function secretNode(): PublicNode | undefined { return nodesApi?.byType(SECRET_TYPE)[0]; }
function hasSecret(): boolean { return !!secretNode(); }
function readUser(id: string): UserData | null {
    const n = nodesApi?.get(id);
    return n && n.type === USER_TYPE ? (n.data as UserData) : null;
}
function readRole(id: string): RoleData | null {
    const n = nodesApi?.get(id);
    return n && n.type === ROLE_TYPE ? (n.data as RoleData) : null;
}
function policyData(): PolicyData {
    const n = nodesApi?.byType(POLICY_TYPE)[0];
    const d = (n?.data ?? {}) as Partial<PolicyData>;
    return {
        paths: { direct: !!d.paths?.direct, level: !!d.paths?.level, role: !!d.paths?.role },
        thresholds: d.thresholds ?? {},
        verifyRoles: d.verifyRoles ?? [],
    };
}

// ── 시작 상태(열 때) — 암호 없으면 마스터, 있으면 손님 ──
function initialState(): CurrentUser { return hasSecret() ? guest() : master(); }

// ── 알림 ──
function fireIdentity(): void { for (const f of [...identityListeners]) f(); }
function firePermit(): void { for (const f of [...permitListeners]) f(); }
export function onIdentityChange(fn: () => void): Disposable { identityListeners.add(fn); return { dispose() { identityListeners.delete(fn); } }; }
export function onPermitChange(fn: () => void): Disposable { permitListeners.add(fn); return { dispose() { permitListeners.delete(fn); } }; }

function setSession(next: CurrentUser): void {
    session = next;
    persistSession();
    fireIdentity();   // 세션이 바뀌면 누구·판정 둘 다 울린다
    firePermit();
}

/** 세션을 기기별 저장에 비춘다 — 🔴 'user'(이름만 댄 사람)만 싣는다. 마스터·손님은 열 때 암호 유무로 다시 정해진다. */
function persistSession(): void {
    if (!hostRef) return;
    if (session.kind === 'user' && session.id) hostRef.storage.set(SESSION_KEY, { kind: 'user', id: session.id });
    else hostRef.storage.remove(SESSION_KEY);
}

/**
 * 초기화/재시작 — index.ts onActivate 가 부른다. 🔴 상태를 깨끗이 다시 세운다(세션·구독·청취자).
 *   세션은 host.storage 의 'user' 를 되살리되(기기 연속성), 되살린 사람은 verified: false(증명은 세션마다 다시).
 *   암호가 없으면 무조건 마스터, 있는데 되살릴 'user' 가 없으면 손님.
 */
export function initAccount(host: PluginHost, nodes: NodesApi | null): void {
    hostRef = host;
    nodesApi = nodes;
    nodesUnsub?.dispose();
    nodesUnsub = nodes ? nodes.subscribe(() => firePermit()) : null;   // 역할·정책·사용자가 바뀌면 판정이 바뀐다
    identityListeners.clear();
    permitListeners.clear();

    // 시작 상태 — 암호 유무가 정한다. 암호가 있을 때만 기기 저장의 'user' 를 되살린다(마스터는 절대 되살리지 않는다).
    if (hasSecret()) {
        const saved = host.storage.get<{ kind?: string; id?: string } | null>(SESSION_KEY, null);
        const u = saved?.kind === 'user' && saved.id ? readUser(saved.id) : null;
        session = u && saved?.id ? userSession(saved.id, u, false) : guest();
    } else {
        session = master();
    }
}

// ── 약속으로 받는 읽기 창구(index.ts 의 per-caller 모듈이 부른다) ──
export function getCurrent(): CurrentUser { return session; }

/** 🔴 이걸 해도 되나 — 화면 가리기용. 마스터면 항상 true. 세 길(직접·역할·수준)은 정책이 켠 것만 본다. */
export function can(permission: string): boolean {
    if (session.kind === 'master') return true;
    const pol = policyData();
    // 길① 사용자에 직접 붙인 권한
    if (pol.paths.direct && session.kind === 'user' && session.id) {
        const u = readUser(session.id);
        if (u?.directPermissions.includes(permission)) return true;
    }
    // 길③ 역할이 담은 권한
    if (pol.paths.role) {
        for (const rid of session.roles) {
            if (readRole(rid)?.permissions.includes(permission)) return true;
        }
    }
    // 길② 역할 수준이 권한 문턱 이상
    if (pol.paths.level) {
        const need = pol.thresholds[permission];
        if (need != null) {
            for (const rid of session.roles) {
                const r = readRole(rid);
                if (r && r.level >= need) return true;
            }
        }
    }
    return false;
}

function credentialProvider(): Credential | null {
    return hostRef?.modules.use<Credential>('credential') ?? null;
}
function policyRequiresVerify(roleIds: string[]): boolean {
    const pol = policyData();
    return roleIds.some((r) => pol.verifyRoles.includes(r));
}

// ── 로그인 ──
/**
 * 그 사용자로 로그인 — 🔴 두 갈래(현재가 누구냐):
 *   · 마스터가 다른 사용자로 갈 때 → **반드시 증명**(쥔님 위조 방지). 증명 통과해야 그 사용자, 실패·제공자 없으면 마스터 그대로.
 *   · 손님/사용자가 이름을 댈 때 → 「이름만」 로그인(verified: false). 정책이 그 역할에 증명을 요구하고 제공자가 있으면 그때만 증명.
 *   돌려주는 값: 세션이 그 사용자로 바뀌었나.
 */
export async function login(userId: string): Promise<boolean> {
    const u = readUser(userId);
    if (!u || !nodesApi) return false;

    if (session.kind === 'master') {
        const cred = credentialProvider();
        if (!cred) return false;                 // 증명할 길이 없으면 전환 불가(위조 방지)
        const m = cred.methods()[0];
        if (!m) return false;
        const ok = await cred.challenge(m.id, userId);
        if (!ok) return false;                   // 실패 → 마스터 그대로
        setSession(userSession(userId, u, true));
        return true;
    }

    let verified = false;
    if (policyRequiresVerify(u.roleIds)) {
        const cred = credentialProvider();
        if (cred) {
            const m = cred.methods()[0];
            if (m) verified = await cred.challenge(m.id, userId);
        }
    }
    setSession(userSession(userId, u, verified));
    return true;
}

/** 프로젝트 암호로 마스터 로그인 — 손님/사용자가 마스터로. 맞으면 true + onChange, 아니면 그대로. */
export async function loginMaster(password: string): Promise<boolean> {
    const sn = secretNode();
    if (!sn) return false;
    if (await verifyHash(password, sn.data as SecretData)) {
        setSession(master());
        return true;
    }
    return false;
}

/** 로그아웃 — 그 프로젝트의 시작 상태로(암호 없으면 마스터, 있으면 손님). */
export function logout(): void { setSession(initialState()); }

// ── 프로젝트 암호(마스터만) ──
/**
 * 프로젝트 암호를 걸거나 바꾸거나 해제한다 — 🔴 마스터만. 해제는 newPw 에 빈 값.
 *   이미 걸려 있으면 oldPw 로 확인한 뒤 바꾼다. 저장은 솔트 해시(평문 0). 잊으면 복구 수단 없음(걸 때 경고는 UI 몫).
 */
export async function setProjectPassword(oldPw: string, newPw: string): Promise<boolean> {
    if (session.kind !== 'master' || !nodesApi) return false;
    const sn = secretNode();
    if (sn && !(await verifyHash(oldPw, sn.data as SecretData))) return false;
    if (newPw === '') {
        if (sn) nodesApi.remove(sn.id);          // 해제
    } else {
        const hashed: Hashed = await makeHash(newPw);
        if (sn) nodesApi.setData(sn.id, hashed);
        else nodesApi.create(nodesApi.roots.main, { type: SECRET_TYPE, name: '프로젝트 암호', data: hashed });
    }
    return true;
}
export function hasProjectPassword(): boolean { return hasSecret(); }

// ── 관리 조작(역할·사용자·정책) — 정책 편집 화면이 부른다. can()·마스터 게이트는 화면이 건다 ──
export function createUser(displayName: string, opts?: Partial<Omit<UserData, 'displayName'>>): string {
    if (!nodesApi) return '';
    const data: UserData = {
        displayName,
        directPermissions: opts?.directPermissions ?? [],
        roleIds: opts?.roleIds ?? [],
        fields: opts?.fields ?? {},
    };
    return nodesApi.create(nodesApi.roots.main, { type: USER_TYPE, name: displayName, data });
}
export function createRole(name: string, opts?: Partial<Omit<RoleData, 'name'>>): string {
    if (!nodesApi) return '';
    const data: RoleData = {
        name,
        permissions: opts?.permissions ?? [],
        level: opts?.level ?? 0,
        fields: opts?.fields ?? {},
    };
    return nodesApi.create(nodesApi.roots.main, { type: ROLE_TYPE, name, data });
}
export function deleteRole(roleId: string): void { nodesApi?.remove(roleId); }
export function deleteUser(userId: string): void { nodesApi?.remove(userId); }

function patchUser(userId: string, patch: Partial<UserData>): void {
    const u = readUser(userId);
    if (!u || !nodesApi) return;
    nodesApi.setData(userId, { ...u, ...patch });
}
function patchRole(roleId: string, patch: Partial<RoleData>): void {
    const r = readRole(roleId);
    if (!r || !nodesApi) return;
    nodesApi.setData(roleId, { ...r, ...patch });
}
export function setUserRoles(userId: string, roleIds: string[]): void { patchUser(userId, { roleIds: [...roleIds] }); }
export function setUserDirect(userId: string, permissions: string[]): void { patchUser(userId, { directPermissions: [...permissions] }); }
export function setRolePermissions(roleId: string, permissions: string[]): void { patchRole(roleId, { permissions: [...permissions] }); }
export function setRoleLevel(roleId: string, level: number): void { patchRole(roleId, { level }); }

/** 정책을 고친다 — 없으면 만든다. 길 켬/끔·문턱·증명 요구 역할을 부분 갱신. */
export function setPolicy(patch: Partial<PolicyData>): void {
    if (!nodesApi) return;
    const cur = policyData();
    const next: PolicyData = {
        paths: { ...cur.paths, ...(patch.paths ?? {}) },
        thresholds: { ...cur.thresholds, ...(patch.thresholds ?? {}) },
        verifyRoles: patch.verifyRoles ?? cur.verifyRoles,
    };
    const existing = nodesApi.byType(POLICY_TYPE)[0];
    if (existing) nodesApi.setData(existing.id, next);
    else nodesApi.create(nodesApi.roots.main, { type: POLICY_TYPE, name: '정책', data: next });
}

// ── 화면이 읽는 조회(설정 패널용) ──
export function getPolicy(): PolicyData { return policyData(); }
export function listUsers(): { id: string; data: UserData }[] {
    return (nodesApi?.byType(USER_TYPE) ?? []).map((n) => ({ id: n.id, data: n.data as UserData }));
}
export function listRoles(): { id: string; data: RoleData }[] {
    return (nodesApi?.byType(ROLE_TYPE) ?? []).map((n) => ({ id: n.id, data: n.data as RoleData }));
}
