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
    type RecordData, type PolicyData, type SecretData,
} from './nodes';
import type { RecordCellValue, RecordField } from '../collection/contracts/collection';
// 🔴 증명 부품은 꾸러미 안 내부 모듈 — 아이디 로그인(W14)은 평문을 그 안에서만 비교·해시한다(verifySecret·setSecret).
import { hasSecret as hasUserSecret, verifySecret, setSecret, methods as credMethods } from './credential/core';

/** 사용자 칸 key — 아이디(유일)·자격증명 종류·활성(Q11 W10~W13). 값은 data.values 에 산다(컬렉션 레코드와 같은 꼴). */
export const LOGIN_ID_KEY = 'loginId';
export const CRED_METHOD_KEY = 'credMethod';
export const ACTIVE_KEY = 'active';
/** 계산 칸(저장 안 함) — 자격증명 상태 「설정됨 / 설정 대기」. */
export const CRED_STATE_KEY = 'credState';

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
const KEEP_KEY = 'keepMinutes';  // host.storage(기기별) — 로그인 유지 기한(분). 0 = 새로고침하면 풀림
export const KEEP_DEFAULT = 480; // 8시간 — 하루 근무
/** 기기에 저장한 세션 꼴 — 🔴 비밀번호·해시는 안 싣는다. seal = 프로젝트 암호 솔트(암호를 바꾸거나 풀면 마스터 유지가 깨진다). */
interface SavedSession { kind?: string; id?: string; verified?: boolean; until?: number; seal?: string }

// ── 세션 꼴 ──
function master(): CurrentUser { return { kind: 'master', displayName: '마스터', verified: true, roles: [] }; }
function guest(): CurrentUser { return { kind: 'guest', displayName: '손님', verified: false, roles: [] }; }
function userSession(id: string, verified: boolean): CurrentUser {
    // 표시 이름 = 노드 이름(제목 칸) · fields = 다른 플러그인이 꽂은 칸('<pluginId>.<name>' — 점이 든 key)만
    const v = valuesOf(id, USER_TYPE) ?? {};
    const fields = Object.fromEntries(Object.entries(v).filter(([k]) => k.includes('.')));
    return { kind: 'user', id, displayName: nodesApi?.get(id)?.name ?? '', verified, roles: listOf(v.roles), fields };
}

// ── 노드 읽기 ──
/**
 * 🔴 W9(Q11) — 탐색기 byType 은 휴지통 노드도 돌려준다. 계정은 휴지통 아래(조상 어디든)를 뺀 「산」 노드만 읽는다.
 *   (지운 사용자가 목록에 남고 · 지운 암호가 「걸려 있음」으로 남고 · 지운 계정 루트를 계속 찾던 버그)
 */
function inTrash(id: string): boolean {
    if (!nodesApi) return false;
    const trash = nodesApi.roots.trash;
    for (let p = nodesApi.parent(id), guard = 0; p && guard < 1000; p = nodesApi.parent(p), guard++) if (p === trash) return true;
    return false;
}
function liveByType(type: string): PublicNode[] { return (nodesApi?.byType(type) ?? []).filter((n) => !inTrash(n.id)); }
function secretNode(): PublicNode | undefined { return liveByType(SECRET_TYPE)[0]; }
function hasSecret(): boolean { return !!secretNode(); }
/** 사용자·역할 레코드의 칸 값(그 타입이 아니면 null) — 컬렉션 레코드와 같은 data.values. */
function valuesOf(id: string, type: string): Record<string, RecordCellValue> | null {
    const n = nodesApi?.get(id);
    return n && n.type === type && !inTrash(id) ? { ...((n.data as RecordData | undefined)?.values ?? {}) } : null;
}
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
function policyData(): PolicyData {
    const n = liveByType(POLICY_TYPE)[0];
    const d = (n?.data ?? {}) as Partial<PolicyData>;
    return {
        paths: { direct: !!d.paths?.direct, level: !!d.paths?.level, role: !!d.paths?.role },
        thresholds: d.thresholds ?? {},
        verifyRoles: d.verifyRoles ?? [],
    };
}

// ── 시작 상태(열 때) — 암호 없으면 마스터, 있으면 손님(기기 저장의 세션을 되살릴 수 있으면 그 사람) ──
function initialState(): CurrentUser { return hasSecret() ? guest() : master(); }
/** 활성인가 — 칸이 없으면 활성(옛 사용자 유지) · false 일 때만 꺼짐(W12). 레코드가 없으면(지움·휴지통) 거짓. */
function isActiveValues(v: Record<string, RecordCellValue> | null): boolean { return !!v && v[ACTIVE_KEY] !== false; }
function secretSeal(): string | undefined { return (secretNode()?.data as SecretData | undefined)?.salt; }
/**
 * 열 때의 초기 세션을 센다 — 암호 유무가 정한다. 암호가 있으면 기기 저장의 세션을 되살린다(P4d A2):
 *   · 마스터 — 유지 기한 안 + 봉인(암호 솔트)이 같을 때만 · 사용자 — 늘 되살리되 「증명됨」은 기한 안일 때만.
 *   shortcut: 기한은 열 때만 본다(열어 둔 채 기한이 지나도 안 풀린다) — 자동 잠금이 필요해지면 타이머를 단다.
 */
function deriveInitial(): CurrentUser {
    if (!hasSecret()) return master();
    const saved = hostRef?.storage.get<SavedSession | null>(SESSION_KEY, null) ?? null;
    const live = typeof saved?.until === 'number' && saved.until > Date.now();
    if (saved?.kind === 'master' && live && saved.seal === secretSeal()) return master();
    return saved?.kind === 'user' && saved.id && isActiveValues(valuesOf(saved.id, USER_TYPE)) ? userSession(saved.id, live && !!saved.verified) : guest();
}

/** 로그인 유지 기한(분) — 기기별. 0 = 새로고침하면 풀림. */
export function getKeepMinutes(): number {
    const v = hostRef?.storage.get<number>(KEEP_KEY, KEEP_DEFAULT);
    return typeof v === 'number' && v >= 0 ? v : KEEP_DEFAULT;
}
/** 기한을 바꾸면 지금 세션도 그 기한으로 다시 적는다. */
export function setKeepMinutes(min: number): void {
    hostRef?.storage.set(KEEP_KEY, Math.max(0, Math.floor(min)));
    refreshSaved();
}
/** 이미 저장된 세션이 있을 때만 다시 적는다 — 🔴 마스터 유지는 암호로 「들어온」 세션만(암호를 처음 건 마스터는 다음에 손님으로 연다). */
function refreshSaved(): void {
    if (hostRef?.storage.get<SavedSession | null>(SESSION_KEY, null)) persistSession();
}

// ── 알림 ──
function fireIdentity(): void { for (const f of [...identityListeners]) f(); }
function firePermit(): void { for (const f of [...permitListeners]) f(); }
export function onIdentityChange(fn: () => void): Disposable { identityListeners.add(fn); return { dispose() { identityListeners.delete(fn); } }; }
export function onPermitChange(fn: () => void): Disposable { permitListeners.add(fn); return { dispose() { permitListeners.delete(fn); } }; }

function setSession(next: CurrentUser, byPassword = false): void {
    awaitingFirstLoad = false;   // 🔴 사용자가 명시적으로 바꿨으면 늦은 재초기화를 끈다(로드 알림이 와도 덮지 않는다)
    session = next;
    persistSession(byPassword);
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

/**
 * 세션을 기기별 저장에 비춘다 — 사용자는 늘(증명됨은 기한과 함께) · 마스터는 암호로 들어왔고 기한이 0이 아닐 때만(봉인 = 암호 솔트).
 *   손님·암호 없는 마스터는 지운다(열 때 암호 유무로 다시 정해진다). 기한은 「지금부터」 다시 센다.
 */
function persistSession(masterLogin = false): void {
    if (!hostRef) return;
    // 마스터는 암호로 들어왔을 때(masterLogin) 또는 이미 그렇게 저장돼 있을 때만 싣는다
    const savedMaster = hostRef.storage.get<SavedSession | null>(SESSION_KEY, null)?.kind === 'master';
    const keep = getKeepMinutes();
    const until = Date.now() + keep * 60_000;
    if (session.kind === 'user' && session.id) {
        hostRef.storage.set(SESSION_KEY, { kind: 'user', id: session.id, verified: keep > 0 && session.verified, until } satisfies SavedSession);
    } else if (session.kind === 'master' && keep > 0 && hasSecret() && (masterLogin || savedMaster)) {
        hostRef.storage.set(SESSION_KEY, { kind: 'master', until, seal: secretSeal() } satisfies SavedSession);
    } else hostRef.storage.remove(SESSION_KEY);
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

    // 시작 상태 — 암호 유무 + 기기 저장 세션(기한·봉인)이 정한다. 🔴 비동기 저장소면 지금은 노드가 비어 있을 수 있다.
    session = deriveInitial();
    awaitingFirstLoad = true;
    nodesUnsub = nodes ? nodes.subscribe(() => {
        // 🔴 로드가 끝나 처음 알림이 오면 초기 상태를 한 번 다시 센다(비어 보여 마스터로 굳은 걸 바로잡는다).
        //    그 뒤로는(사용자 조작·데이터 변경) 다시 세지 않는다 — 마스터가 암호를 걸어도 강등되지 않는다.
        if (awaitingFirstLoad) {
            awaitingFirstLoad = false;
            const next = deriveInitial();
            if (next.kind !== session.kind || next.id !== session.id || next.verified !== session.verified) {
                session = next;   // 🔴 기기 저장은 안 고친다 — 되살린 세션의 기한을 열 때마다 늘리면 안 된다(P4d A2)
                fireIdentity();
            }
            tryMigrate();   // 🔴 비동기 로드 완료 뒤에도 한 번 이사 확인(노드가 그제야 보인다)
        }
        firePermit();   // 역할·정책·사용자가 바뀌면 판정이 바뀐다
        // 🔴 W8/W12 — 로그인한 사용자가 지워졌거나(휴지통 포함) 비활성이 되면 로그아웃한다.
        //    알림 처리기 안에서 세션을 바꾸면 다른 구독자 차례와 엉키니 마이크로태스크로 미룬다.
        if (session.kind === 'user') queueMicrotask(kickIfGone);
    }) : null;
    tryMigrate();   // 동기 저장소(암호 없음 → 마스터)면 지금 바로 이사한다
}

/** 지금 사용자가 사라졌거나 비활성이면 로그아웃(+알림). 로드 전(노드가 아직 안 보임)엔 손대지 않는다. */
function kickIfGone(): void {
    if (session.kind !== 'user' || !session.id || !nodesApi || awaitingFirstLoad) return;
    const v = valuesOf(session.id, USER_TYPE);
    if (isActiveValues(v)) return;
    const why = v ? '비활성으로 바뀌어' : '지워져';
    setSession(initialState());
    hostRef?.notify({ level: 'warn', title: `로그인한 사용자가 ${why} 로그아웃했습니다.`, key: 'account.kicked' });
}

// ── 약속으로 받는 읽기 창구(index.ts 의 per-caller 모듈이 부른다) ──
export function getCurrent(): CurrentUser { return session; }

/** 지금 마스터인가 — 노드 조작 판정(root 만들기·지우기·이사)이 쓴다. 권한 체계 밖(쥔님 2026-11-08). */
export function isMaster(): boolean { return session.kind === 'master'; }

// ── 계정 노드 구조(루트 → 사용자/역할 폴더 + 정책) ──
/** 계정 루트 노드 id(없으면 null). */
export function accountRootId(): string | null { return liveByType(ROOT_TYPE)[0]?.id ?? null; }

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
    if (liveByType(POLICY_TYPE).length === 0) nodesApi.create(rootId, { type: POLICY_TYPE, name: '정책', data: emptyPolicy() });
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
    // 🔴 휴지통에 있는 옛 노드는 이사하지 않는다(휴지통에서 끌어내면 지운 게 되살아난다)
    const users = liveByType(USER_TYPE);
    const roles = liveByType(ROLE_TYPE);
    const policies = liveByType(POLICY_TYPE);
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
        if (listOf(valuesOf(session.id, USER_TYPE)?.direct).includes(permission)) return true;
    }
    // 길③ 역할이 담은 권한
    if (pol.paths.role) {
        for (const rid of session.roles) {
            if (listOf(valuesOf(rid, ROLE_TYPE)?.perms).includes(permission)) return true;
        }
    }
    // 길② 역할 수준이 권한 문턱 이상
    if (pol.paths.level) {
        const need = pol.thresholds[permission];
        if (need != null) {
            for (const rid of session.roles) {
                const level = valuesOf(rid, ROLE_TYPE)?.level;
                if (typeof level === 'number' && level >= need) return true;
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
    const u = valuesOf(userId, USER_TYPE);
    if (!u || !nodesApi || !isActiveValues(u)) return false;   // 🔴 W12 — 비활성 사용자는 어느 길로도 못 들어온다

    if (session.kind === 'master') {
        const cred = credentialProvider();
        if (!cred) return false;                 // 증명할 길이 없으면 전환 불가(위조 방지)
        const m = cred.methods()[0];
        if (!m) return false;
        const ok = await cred.challenge(m.id, userId);
        if (!ok) return false;                   // 실패 → 마스터 그대로
        setSession(userSession(userId, true));
        return true;
    }

    let verified = false;
    if (hasUserSecret(userId)) {
        // 🔴 W14 — 자격증명이 걸린 사람은 이름만으로 못 들어온다(늘 비밀번호를 묻는다). 틀림·취소면 그대로.
        const cred = credentialProvider();
        const m = cred?.methods()[0];
        if (!cred || !m || !(await cred.challenge(m.id, userId))) return false;
        verified = true;
    } else if (policyRequiresVerify(listOf(u.roles))) {
        const cred = credentialProvider();
        if (cred) {
            const m = cred.methods()[0];
            if (m) verified = await cred.challenge(m.id, userId);
        }
    }
    setSession(userSession(userId, verified));
    return true;
}

/** 프로젝트 암호로 마스터 로그인 — 손님/사용자가 마스터로. 맞으면 true + onChange, 아니면 그대로. */
export async function loginMaster(password: string): Promise<boolean> {
    const sn = secretNode();
    if (!sn) return false;
    if (await verifyHash(password, sn.data as SecretData)) {
        setSession(master(), true);
        return true;
    }
    return false;
}

/** 로그아웃 — 그 프로젝트의 시작 상태로(암호 없으면 마스터, 있으면 손님). */
export function logout(): void { setSession(initialState()); }
/**
 * 로그아웃해도 뜻이 있나(W8) — 마스터인데 프로젝트 암호가 없으면 로그아웃해도 다시 마스터로 열린다(아무 일 없음).
 *   손님은 나갈 데가 없다. 그 밖(사용자 · 암호 걸린 마스터)은 true.
 */
export function canLogout(): boolean {
    if (session.kind === 'guest') return false;
    return !(session.kind === 'master' && !hasSecret());
}

// ── 아이디로 들어가기(W14) — 아이디 입력 → (자격증명 미설정이면 설정) → 로그인 ──
const normId = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
/** 아이디로 산 사용자 찾기(앞뒤 공백·대소문자 무시) — 없으면 null. */
function userByLoginId(loginId: string): PublicNode | null {
    const k = normId(loginId);
    if (!k) return null;
    return liveByType(USER_TYPE).find((n) => normId((n.data as RecordData | undefined)?.values?.[LOGIN_ID_KEY]) === k) ?? null;
}
/** 아이디 확인 결과 — 없음 · 비활성 · 자격증명 설정 필요 · 비밀번호 필요. 🔴 비밀번호는 여기 안 실린다. */
export type LoginCheck =
    | { kind: 'empty' }
    | { kind: 'unknown' }
    | { kind: 'inactive'; name: string }
    | { kind: 'setup'; userId: string; name: string }
    | { kind: 'password'; userId: string; name: string };
export function checkLoginId(loginId: string): LoginCheck {
    if (!loginId.trim()) return { kind: 'empty' };
    const n = userByLoginId(loginId);
    if (!n) return { kind: 'unknown' };
    if (!isActiveValues(valuesOf(n.id, USER_TYPE))) return { kind: 'inactive', name: n.name };
    return hasUserSecret(n.id) ? { kind: 'password', userId: n.id, name: n.name } : { kind: 'setup', userId: n.id, name: n.name };
}
/** 비밀번호로 들어가기 — 맞으면 그 사용자(증명됨). 🔴 평문은 증명 부품 안에서만 비교된다. */
export async function loginWithPassword(userId: string, password: string): Promise<'ok' | 'wrong' | 'inactive' | 'unknown' | 'setup'> {
    const v = valuesOf(userId, USER_TYPE);
    if (!v) return 'unknown';
    if (!isActiveValues(v)) return 'inactive';
    if (!hasUserSecret(userId)) return 'setup';
    if (!(await verifySecret(userId, password))) return 'wrong';
    setSession(userSession(userId, true));
    return 'ok';
}
/**
 * 첫 로그인 — 자격증명 종류를 고르고 비밀번호를 두 번 넣어 설정한 뒤 바로 들어간다(증명됨).
 *   🔴 이미 설정된 사람은 이 길로 못 바꾼다('already' — 남의 아이디로 비번을 새로 걸어 가로채기 방지).
 */
export async function setupAndLogin(userId: string, methodId: string, password: string, confirm: string):
    Promise<'ok' | 'empty' | 'mismatch' | 'method' | 'already' | 'inactive' | 'unknown'> {
    const v = valuesOf(userId, USER_TYPE);
    if (!v || !nodesApi) return 'unknown';
    if (!isActiveValues(v)) return 'inactive';
    if (hasUserSecret(userId)) return 'already';
    if (!credMethods().some((m) => m.id === methodId)) return 'method';
    if (password === '') return 'empty';
    if (password !== confirm) return 'mismatch';
    await setSecret(userId, password);
    setRecordValue(userId, CRED_METHOD_KEY, methodId);
    setSession(userSession(userId, true));
    return 'ok';
}
/** 자격증명 상태 글(계산 칸 · W13) — 값은 안 보인다. */
export function credStateOf(userId: string): '설정됨' | '설정 대기' { return hasUserSecret(userId) ? '설정됨' : '설정 대기'; }

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
    refreshSaved();   // 봉인(솔트)이 바뀌었으니 암호로 들어온 마스터 세션을 새 봉인으로 다시 적는다
    return true;
}
export function hasProjectPassword(): boolean { return hasSecret(); }

/**
 * 그 사용자의 자격증명(비밀번호 등)을 걸고 빼도 되나 — 🔴 마스터, 또는 **증명된** 본인만(P4d A3).
 *   이름만 댄 본인(verified: false)은 안 된다 — 남의 이름을 대고 비밀번호를 바꿔 가로채는 길을 막는다.
 */
export function canManageCredential(userId: string): boolean {
    return session.kind === 'master' || (session.kind === 'user' && session.id === userId && session.verified);
}

// ── 관리 조작(역할·사용자·정책) — 정책 편집 화면이 부른다. can()·마스터 게이트는 화면이 건다 ──
/** 빈 값(빈 글·빈 목록·null)은 칸에서 뺀다 — 컬렉션 setValue 와 같은 규칙. */
const isEmpty = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const cleanValues = (values: Record<string, RecordCellValue>): Record<string, RecordCellValue> =>
    Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmpty(v)));

export function createUser(name: string, opts?: { roleIds?: string[]; directPermissions?: string[]; loginId?: string; active?: boolean; credMethod?: string }): string {
    const folder = usersFolderId();
    if (!nodesApi || !folder) return '';
    const loginId = opts?.loginId?.trim() ?? '';
    if (loginId && userByLoginId(loginId)) return '';   // 🔴 아이디는 유일(W10)
    const data: RecordData = { values: cleanValues({
        [LOGIN_ID_KEY]: loginId, [CRED_METHOD_KEY]: opts?.credMethod ?? '',
        [ACTIVE_KEY]: opts?.active ?? true,   // 🔴 W12 — 새 사용자는 활성으로 저장(옛 사용자는 칸이 없어도 활성)
        roles: opts?.roleIds ?? [], direct: opts?.directPermissions ?? [],
    }) };
    return nodesApi.create(folder, { type: USER_TYPE, name, data });
}
/** 「사용자 추가」 폼(W14) — 이름·아이디·자격증명 종류·초기 비밀번호(선택)·활성. 초기 비번이 있으면 설정됨, 비면 설정 대기. */
export async function createUserWithLogin(input: { name: string; loginId: string; credMethod: string; password?: string; active: boolean }):
    Promise<{ ok: true; id: string } | { ok: false; reason: 'name' | 'loginId' | 'taken' | 'denied' }> {
    const name = input.name.trim();
    if (!name) return { ok: false, reason: 'name' };
    if (!input.loginId.trim()) return { ok: false, reason: 'loginId' };
    if (userByLoginId(input.loginId)) return { ok: false, reason: 'taken' };
    const id = createUser(name, { loginId: input.loginId, active: input.active, credMethod: input.credMethod });
    if (!id) return { ok: false, reason: 'denied' };
    if (input.password) await setSecret(id, input.password);
    return { ok: true, id };
}
export function createRole(name: string, opts?: { permissions?: string[]; level?: number }): string {
    const folder = rolesFolderId();
    if (!nodesApi || !folder) return '';
    const data: RecordData = { values: cleanValues({ level: opts?.level ?? 0, perms: opts?.permissions ?? [] }) };
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

/** 사용자·역할 문서(page-doc 값) — 노드 공통 body 칸(노션처럼 레코드마다 문서). */
export function accountBodyOf(id: string): unknown { return nodesApi?.get(id)?.body; }
export function setAccountBody(id: string, body: unknown): void { nodesApi?.setBody(id, body); }
export function getNodesApi(): NodesApi | null { return nodesApi; }
/** 목록 탭의 폴더(사용자·역할·권한) — 탭 머리 아이콘·이름이 고친다. 없으면 null(만들지 않는다). */
export function accountFolderId(kind: 'users' | 'roles' | 'perms'): string | null {
    const r = accountRootId();
    if (!r) return null;
    return childOfType(r, kind === 'users' ? USERS_FOLDER_TYPE : kind === 'roles' ? ROLES_FOLDER_TYPE : PERMS_FOLDER_TYPE);
}
export function nodeNameOf(id: string): string { return nodesApi?.get(id)?.name ?? ''; }

/** 사용자·역할 이름 = 노드 이름(제목 칸). 빈 이름은 무시. */
export function renameRecord(id: string, name: string): void {
    const t = name.trim();
    if (t && nodesApi) nodesApi.rename(id, t);
}
/**
 * 사용자·역할 칸 하나 쓰기 — 컬렉션 setValue 와 같은 규칙(제목 칸 'name' 은 이름 바꾸기 · 빈 값은 지움 · 글은 trim).
 *   🔴 data 의 다른 짐(values 밖)은 그대로 싣는다.
 */
export function setRecordValue(id: string, key: string, value: RecordCellValue): boolean {
    const n = nodesApi?.get(id);
    if (!nodesApi || !n || (n.type !== USER_TYPE && n.type !== ROLE_TYPE)) return false;
    if (key === 'name') { renameRecord(id, String(value ?? '')); return true; }
    if (key === CRED_STATE_KEY) return false;   // 계산 칸 — 저장하지 않는다
    if (n.type === USER_TYPE && key === LOGIN_ID_KEY) {
        // 🔴 아이디는 유일(W10) — 표·페이지 검사를 건너뛴 길(붙여넣기·다른 플러그인)도 여기서 막는다
        const other = typeof value === 'string' ? userByLoginId(value) : null;
        if (other && other.id !== id) return false;
    }
    const cur = { ...((n.data ?? {}) as Record<string, unknown>) };
    const values = { ...((cur.values ?? {}) as Record<string, RecordCellValue>) };
    const v = typeof value === 'string' ? value.trim() : value;
    if (isEmpty(v)) delete values[key]; else values[key] = v;
    nodesApi.setData(id, { ...cur, values });
    return true;
}
export const setUserRoles = (userId: string, roleIds: string[]): void => { setRecordValue(userId, 'roles', [...roleIds]); };

/** 폴더(사용자·역할)에 사람이 더한 칸 정의 — 컬렉션 목록 노드와 같은 data.fields. */
export function folderFieldsOf(kind: 'users' | 'roles'): RecordField[] {
    const fid = accountFolderId(kind);
    const d = (fid ? nodesApi?.get(fid)?.data : null) as { fields?: unknown } | null | undefined;
    return Array.isArray(d?.fields) ? (d.fields as RecordField[]) : [];
}
export function setFolderFields(kind: 'users' | 'roles', fields: RecordField[]): void {
    const fid = accountFolderId(kind);
    if (!nodesApi || !fid) return;
    nodesApi.setData(fid, { ...((nodesApi.get(fid)?.data ?? {}) as Record<string, unknown>), fields });
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
    const existing = liveByType(POLICY_TYPE)[0];
    if (existing) nodesApi.setData(existing.id, next);
    else {
        // 정책은 계정 루트 밑에 산다(자동 슬롯이 보통 미리 세우지만, 없으면 루트를 세우며 만든다).
        const parent = ensureStructure() ?? nodesApi.roots.main;
        nodesApi.create(parent, { type: POLICY_TYPE, name: '정책', data: next });
    }
}

// ── 화면이 읽는 조회(설정 패널용) ──
export function getPolicy(): PolicyData { return policyData(); }
/** 사용자·역할 레코드 한 줄 — 제목(노드 이름) + 칸 값. */
export interface AccountRecord { id: string; name: string; values: Record<string, RecordCellValue> }
const toRecord = (n: PublicNode): AccountRecord => ({ id: n.id, name: n.name, values: { ...((n.data as RecordData | undefined)?.values ?? {}) } });
export function listUsers(): AccountRecord[] { return liveByType(USER_TYPE).map(toRecord); }
export function listRoles(): AccountRecord[] { return liveByType(ROLE_TYPE).map(toRecord); }
/** 사용자·역할 하나(없거나 다른 타입이면 null). */
export function getRecord(id: string): AccountRecord | null {
    const n = nodesApi?.get(id);
    return n && (n.type === USER_TYPE || n.type === ROLE_TYPE) && !inTrash(id) ? toRecord(n) : null;
}
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
