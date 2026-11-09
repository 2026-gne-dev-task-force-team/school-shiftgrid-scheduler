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
import type { CurrentUser } from './contracts/identity';
import type { Credential } from './contracts/credential';
import type { NodesApi, PublicNode } from '../explorer/contracts/nodes';
import { makeHash, verifyHash } from './hash';
import type { Hashed } from './hash';
import {
    ROOT_TYPE, USERS_FOLDER_TYPE, ROLES_FOLDER_TYPE, PERMS_FOLDER_TYPE,
    USER_TYPE, ROLE_TYPE, POLICY_TYPE, SECRET_TYPE,
    type UserData, type RoleData, type PolicyData, type SecretData,
} from './nodes';

// ── 전역 상태 ──
let nodesApi: NodesApi | null = null;
let hostRef: PluginHost | null = null;
let session: CurrentUser = guest();
let nodesUnsub: Disposable | null = null;
// 🔴 비동기 저장소 경합 방어 — onActivate 시점엔 노드가 아직 안 왔을 수 있다(explorer 의 loadTree 가 await).
//    그 사이 hasSecret() 가 거짓이라 암호 걸린 프로젝트도 마스터로 시작해 버린다. 로드가 끝나 「첫 알림」이 오면
//    초기 상태를 딱 한 번 다시 센다(store 가 loadTree 완료 때 빈 나무→실나무 diff 로 subscribe 를 깨운다).
//    사용자가 그 전에 명시적으로 로그인/로그아웃하면 끈다(setSession 이 false 로).
let awaitingFirstLoad = false;
const identityListeners = new Set<() => void>();
const permitListeners = new Set<() => void>();

const SESSION_KEY = 'session';   // host.storage(기기별)

// ── 세션 꼴 ──
function master(): CurrentUser { return { kind: 'master', displayName: '마스터', verified: true, roles: [] }; }
function guest(): CurrentUser { return { kind: 'guest', displayName: '손님', verified: false, roles: [] }; }
function userSession(id: string, u: UserData, verified: boolean): CurrentUser {
    // 🔴 표시 이름은 노드 이름을 먼저 본다 — 탐색기 F2 로 이름을 바꿔도 반영된다(data.displayName 은 보조).
    const name = nodesApi?.get(id)?.name ?? u.displayName;
    return { kind: 'user', id, displayName: name, verified, roles: [...(u.roleIds ?? [])], fields: { ...(u.fields ?? {}) } };
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

// ── 시작 상태(열 때) — 암호 없으면 마스터, 있으면 손님(기기 저장의 'user' 를 되살릴 수 있으면 그 사람) ──
function initialState(): CurrentUser { return hasSecret() ? guest() : master(); }
/** 열 때의 초기 세션을 센다 — 암호 유무가 정하고, 암호가 있으면 기기 저장의 'user'(증명 안 됨)를 되살린다. */
function deriveInitial(): CurrentUser {
    if (!hasSecret()) return master();
    const saved = hostRef?.storage.get<{ kind?: string; id?: string } | null>(SESSION_KEY, null) ?? null;
    const u = saved?.kind === 'user' && saved.id ? readUser(saved.id) : null;
    return u && saved?.id ? userSession(saved.id, u, false) : guest();
}

// ── 알림 ──
function fireIdentity(): void { for (const f of [...identityListeners]) f(); }
function firePermit(): void { for (const f of [...permitListeners]) f(); }
export function onIdentityChange(fn: () => void): Disposable { identityListeners.add(fn); return { dispose() { identityListeners.delete(fn); } }; }
export function onPermitChange(fn: () => void): Disposable { permitListeners.add(fn); return { dispose() { permitListeners.delete(fn); } }; }

function setSession(next: CurrentUser): void {
    awaitingFirstLoad = false;   // 🔴 사용자가 명시적으로 바꿨으면 늦은 재초기화를 끈다(로드 알림이 와도 덮지 않는다)
    session = next;
    persistSession();
    tryMigrate();     // 마스터가 되면(암호 로그인) 옛 평면 노드를 새 구조로 이사한다(idempotent)
    nudgeExplorer();  // 🔴 세션이 바뀌면 탐색기가 hidden/can 을 다시 세게 깨운다(노드는 안 바뀌어도 가림 판정이 바뀐다)
    fireIdentity();   // 세션이 바뀌면 누구·판정 둘 다 울린다
    firePermit();
}

/**
 * 🔴 탐색기를 다시 그리게 깨운다 — 세션이 바뀌면 노드 데이터는 그대로지만 hidden/can 판정이 바뀐다(로그인/로그아웃/전환).
 *   공개 API invalidate 는 유도 캐시를 버리고 emit() 해 뷰를 다시 그린다 — 나무를 안 건드린다(저장·되돌리기 churn 0).
 */
function nudgeExplorer(): void {
    if (!nodesApi) return;
    nodesApi.invalidate(nodesApi.roots.main);
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
    identityListeners.clear();
    permitListeners.clear();

    // 시작 상태 — 암호 유무가 정한다(마스터는 절대 되살리지 않는다). 🔴 비동기 저장소면 지금은 노드가 비어 있을 수 있다.
    session = deriveInitial();
    awaitingFirstLoad = true;
    nodesUnsub = nodes ? nodes.subscribe(() => {
        // 🔴 로드가 끝나 처음 알림이 오면 초기 상태를 한 번 다시 센다(비어 보여 마스터로 굳은 걸 바로잡는다).
        //    그 뒤로는(사용자 조작·데이터 변경) 다시 세지 않는다 — 마스터가 암호를 걸어도 강등되지 않는다.
        if (awaitingFirstLoad) {
            awaitingFirstLoad = false;
            const next = deriveInitial();
            if (next.kind !== session.kind || next.id !== session.id) {
                session = next;
                persistSession();
                fireIdentity();
            }
            tryMigrate();   // 🔴 비동기 로드 완료 뒤에도 한 번 이사 확인(노드가 그제야 보인다)
        }
        firePermit();   // 역할·정책·사용자가 바뀌면 판정이 바뀐다
    }) : null;
    tryMigrate();   // 동기 저장소(암호 없음 → 마스터)면 지금 바로 이사한다
}

// ── 약속으로 받는 읽기 창구(index.ts 의 per-caller 모듈이 부른다) ──
export function getCurrent(): CurrentUser { return session; }

/** 지금 마스터인가 — 노드 조작 판정(root 만들기·지우기·이사)이 쓴다. 권한 체계 밖(쥔님 2026-11-08). */
export function isMaster(): boolean { return session.kind === 'master'; }

// ── 계정 노드 구조(루트 → 사용자/역할 폴더 + 정책) ──
/** 계정 루트 노드 id(없으면 null). */
export function accountRootId(): string | null { return nodesApi?.byType(ROOT_TYPE)[0]?.id ?? null; }

function childOfType(parentId: string, type: string): string | null {
    const hit = (nodesApi?.children(parentId) ?? []).find((n) => n.type === type);
    return hit ? hit.id : null;
}

const emptyPolicy = (): PolicyData => ({ paths: { direct: false, level: false, role: false }, thresholds: {}, verifyRoles: [] });

/**
 * 계정 구조를 세운다 — 루트가 없으면 만들고, 사용자/역할 폴더 + 정책이 없으면 채운다. 루트 id 를 돌려준다.
 *   🔴 루트 만들기는 canCreate(마스터만) 관문을 지난다 — 마스터가 아니면 못 만들고 null.
 *   🔴 탐색기(실 제공자)는 루트를 만들 때 자동 슬롯으로 폴더·정책을 같이 세운다 — 아래 「없으면 만들기」는 그때 전부 건너뛴다(idempotent).
 *      슬롯을 안 돌리는 제공자(테스트 인메모리)에서도 구조가 서게 보강한다.
 */
function ensureStructure(): string | null {
    if (!nodesApi) return null;
    let rootId = accountRootId();
    if (!rootId) rootId = nodesApi.create(nodesApi.roots.main, { type: ROOT_TYPE, name: '계정' }) || null;
    if (!rootId) return null;   // canCreate(마스터만)에 막히면 '' → null
    if (!childOfType(rootId, USERS_FOLDER_TYPE)) nodesApi.create(rootId, { type: USERS_FOLDER_TYPE, name: '사용자' });
    if (!childOfType(rootId, ROLES_FOLDER_TYPE)) nodesApi.create(rootId, { type: ROLES_FOLDER_TYPE, name: '역할' });
    if (!childOfType(rootId, PERMS_FOLDER_TYPE)) nodesApi.create(rootId, { type: PERMS_FOLDER_TYPE, name: '권한' });
    // 🔴 정책은 트리에 하나도 없을 때만 만든다(싱글턴) — 옛 평면 정책이 있으면 이사(tryMigrate)가 그걸 루트 밑으로 옮긴다(중복 방지).
    if (nodesApi.byType(POLICY_TYPE).length === 0) nodesApi.create(rootId, { type: POLICY_TYPE, name: '정책', data: emptyPolicy() });
    return rootId;
}
function usersFolderId(): string | null { const r = ensureStructure(); return r ? childOfType(r, USERS_FOLDER_TYPE) : null; }
function rolesFolderId(): string | null { const r = ensureStructure(); return r ? childOfType(r, ROLES_FOLDER_TYPE) : null; }

/**
 * 옛 평면 노드 이사 — 설정 패널 시절의 사용자·역할·정책 노드(루트 밖 평면)를 새 구조(폴더/루트) 아래로 옮긴다. 🔴 날리지 않는다(옮기기만).
 *   · 마스터만 한다(루트 만들기가 마스터 관문이라 · 손님은 어차피 보기 권한 0이라 안 보인다 — 마스터가 들어오면 그때 정리).
 *   · idempotent — 이미 제자리면 아무 일 없음(두 번 불러도 안전 · 증명 비밀 이사 코드와 별개로 돈다).
 */
function tryMigrate(): void {
    if (!nodesApi || !isMaster()) return;
    const users = nodesApi.byType(USER_TYPE);
    const roles = nodesApi.byType(ROLE_TYPE);
    const policies = nodesApi.byType(POLICY_TYPE);
    // 루트도 없고 옛 노드도 없으면 할 일 없음(새 프로젝트는 마스터가 「새로 만들기」로 루트를 세운다).
    if (!accountRootId() && users.length === 0 && roles.length === 0 && policies.length === 0) return;
    const rootId = ensureStructure();
    if (!rootId) return;
    const uf = childOfType(rootId, USERS_FOLDER_TYPE);
    const rf = childOfType(rootId, ROLES_FOLDER_TYPE);
    for (const u of users) if (uf && nodesApi.parent(u.id) !== uf) nodesApi.move(u.id, uf);
    for (const r of roles) if (rf && nodesApi.parent(r.id) !== rf) nodesApi.move(r.id, rf);
    for (const p of policies) if (nodesApi.parent(p.id) !== rootId) nodesApi.move(p.id, rootId);
}

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
    const folder = usersFolderId();
    if (!nodesApi || !folder) return '';
    const data: UserData = {
        displayName,
        directPermissions: opts?.directPermissions ?? [],
        roleIds: opts?.roleIds ?? [],
        fields: opts?.fields ?? {},
    };
    return nodesApi.create(folder, { type: USER_TYPE, name: displayName, data });
}
export function createRole(name: string, opts?: Partial<Omit<RoleData, 'name'>>): string {
    const folder = rolesFolderId();
    if (!nodesApi || !folder) return '';
    const data: RoleData = {
        name,
        permissions: opts?.permissions ?? [],
        level: opts?.level ?? 0,
        fields: opts?.fields ?? {},
    };
    return nodesApi.create(folder, { type: ROLE_TYPE, name, data });
}
export function deleteRole(roleId: string): void { nodesApi?.remove(roleId); }
export function deleteUser(userId: string): void { nodesApi?.remove(userId); }
/** 사용자·역할 목록의 순서 바꾸기 — beforeId 앞으로(null 이면 끝). 같은 폴더 안에서만. */
export function reorderAccount(id: string, beforeId: string | null): void {
    const parent = nodesApi?.parent(id);
    if (!nodesApi || !parent) return;
    const sibs = nodesApi.children(parent).map((n) => n.id).filter((x) => x !== id);
    const at = beforeId ? sibs.indexOf(beforeId) : sibs.length;
    nodesApi.move(id, parent, at < 0 ? sibs.length : at);
}
/** 부모 노드 id — 편집기의 「← 목록」이 쓴다(사용자·역할은 나무에 안 보인다). */
export function parentOf(id: string): string | null { return nodesApi?.parent(id) ?? null; }

// 🔴 노드 data 원본 — 문서(body)·아이콘처럼 UserData/RoleData 밖 짐을 고치기 때 안 잃게 같이 싣는다.
const rawOf = (id: string): Record<string, unknown> => ({ ...((nodesApi?.get(id)?.data ?? {}) as Record<string, unknown>) });
function patchUser(userId: string, patch: Partial<UserData>): void {
    const u = readUser(userId);
    if (!u || !nodesApi) return;
    nodesApi.setData(userId, { ...rawOf(userId), ...u, ...patch });
}
function patchRole(roleId: string, patch: Partial<RoleData>): void {
    const r = readRole(roleId);
    if (!r || !nodesApi) return;
    nodesApi.setData(roleId, { ...rawOf(roleId), ...r, ...patch });
}
/** 사용자·역할 문서(page-doc 값) — 노드 data.body(노션처럼 레코드마다 문서). */
export function accountBodyOf(id: string): unknown { return rawOf(id).body; }
export function setAccountBody(id: string, body: unknown): void { nodesApi?.setData(id, { ...rawOf(id), body }); }
/** 목록 탭의 폴더(사용자·역할·권한) — 탭 머리 아이콘·이름이 고친다. 없으면 null(만들지 않는다). */
export function accountFolderId(kind: 'users' | 'roles' | 'perms'): string | null {
    const r = accountRootId();
    if (!r) return null;
    return childOfType(r, kind === 'users' ? USERS_FOLDER_TYPE : kind === 'roles' ? ROLES_FOLDER_TYPE : PERMS_FOLDER_TYPE);
}
export function folderIconOf(id: string): string | undefined { const i = rawOf(id).icon; return typeof i === 'string' && i ? i : undefined; }
export function setFolderIcon(id: string, icon: string | undefined): void {
    const cur = rawOf(id);
    if (icon) cur.icon = icon; else delete cur.icon;
    nodesApi?.setData(id, cur);
}
export function renameNode(id: string, name: string): void { nodesApi?.rename(id, name); }
export function nodeNameOf(id: string): string { return nodesApi?.get(id)?.name ?? ''; }
export function setUserRoles(userId: string, roleIds: string[]): void { patchUser(userId, { roleIds: [...roleIds] }); }
export function setUserDirect(userId: string, permissions: string[]): void { patchUser(userId, { directPermissions: [...permissions] }); }
export function setRolePermissions(roleId: string, permissions: string[]): void { patchRole(roleId, { permissions: [...permissions] }); }
export function setRoleLevel(roleId: string, level: number): void { patchRole(roleId, { level }); }

/** 사용자 이름 바꾸기 — 노드 이름(탐색기 표시)과 data.displayName(신분 표시)을 같이 맞춘다. */
export function setUserName(userId: string, name: string): void {
    const t = name.trim();
    if (!t || !nodesApi) return;
    nodesApi.rename(userId, t);
    patchUser(userId, { displayName: t });
}
/** 역할 이름 바꾸기 — 노드 이름과 data.name 을 같이 맞춘다. */
export function setRoleName(roleId: string, name: string): void {
    const t = name.trim();
    if (!t || !nodesApi) return;
    nodesApi.rename(roleId, t);
    patchRole(roleId, { name: t });
}

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
    else {
        // 정책은 계정 루트 밑에 산다(자동 슬롯이 보통 미리 세우지만, 없으면 루트를 세우며 만든다).
        const parent = ensureStructure() ?? nodesApi.roots.main;
        nodesApi.create(parent, { type: POLICY_TYPE, name: '정책', data: next });
    }
}

// ── 화면이 읽는 조회(설정 패널용) ──
export function getPolicy(): PolicyData { return policyData(); }
export function listUsers(): { id: string; data: UserData }[] {
    return (nodesApi?.byType(USER_TYPE) ?? []).map((n) => ({ id: n.id, data: n.data as UserData }));
}
export function listRoles(): { id: string; data: RoleData }[] {
    return (nodesApi?.byType(ROLE_TYPE) ?? []).map((n) => ({ id: n.id, data: n.data as RoleData }));
}
/** 편집 탭이 읽는 사용자 하나(없으면 null). */
export function getUser(userId: string): UserData | null { return readUser(userId); }
/** 편집 탭이 읽는 역할 하나(없으면 null). */
export function getRole(roleId: string): RoleData | null { return readRole(roleId); }
/** 그 노드가 사용자/역할/정책 중 무엇인가(편집 탭이 어느 편집기를 그릴지 고른다). 그 외/없음은 null. */
export function nodeKindOf(id: string): 'user' | 'role' | 'policy' | 'users' | 'roles' | null {
    const n = nodesApi?.get(id);
    if (!n) return null;
    return n.type === USER_TYPE ? 'user' : n.type === ROLE_TYPE ? 'role' : n.type === POLICY_TYPE ? 'policy'
        : n.type === USERS_FOLDER_TYPE ? 'users' : n.type === ROLES_FOLDER_TYPE ? 'roles' : null;
}

/**
 * 「계정 열기」 — 계정 루트를 탐색기에서 드러낸다(상태바 메뉴가 부른다). 루트가 있으면 탐색기를 열고 루트를 고른다.
 *   돌려주는 값: 루트가 있었나(false 면 화면이 「마스터가 새로 만들기」를 안내한다).
 */
export function openAccount(host: PluginHost): boolean {
    const rootId = accountRootId();
    host.workspace.open('explorer.tree', { where: 'left', reuse: true });
    if (!rootId) return false;
    nodesApi?.select(rootId);
    return true;
}
