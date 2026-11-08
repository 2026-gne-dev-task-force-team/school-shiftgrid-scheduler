/**
 * 계정 ↔ 노드 시스템 다리 — 🔴 계정은 **보이는 노드**다(쥔님 2026-11-08 21:40 「정책까지 노드로」).
 *   계정 루트(싱글턴) 아래 「사용자」·「역할」 폴더 + 「정책」 하나가 자동 슬롯으로 선다. 사용자·역할·정책 노드는
 *   탐색기에 보이고 누르면 탭으로 열려 편집된다. 🔴 프로젝트 암호 해시·증명 비밀만 계속 숨김(record).
 *
 *   ⭐ 권한의 첫 본보기 — 노드 조작·숨김을 permit.can(화면 가리기)으로 가린다(1단계 can 함수·canCreate·confirmDelete·hidden 사용):
 *     · 보기 권한 없으면 hidden → 탐색기에 안 보이고 안 열린다 · 고치기/지우기 권한 없으면 can 으로 막힌다.
 *     · 계정 루트 만들기·지우기는 **마스터만**(권한 체계 밖) · 지울 땐 경고(confirmDelete).
 *   🔴 탐색기는 판정의 속을 모른다 — can/hidden 함수는 전부 이 꾸러미(core)가 준다(계정·권한 낱말 0은 탐색기 쪽).
 *
 *   ⛔ host.store·persist 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *   ⚠️ 이 파일은 비-뷰라 소문자 record 리터럴을 둬도 된다(구조 검사 ⑯: 뷰에만 금지).
 */
import type { NodeTypeContribution, PluginHost } from '../../pane-ui-system/plugin';
import type { NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import type { Hashed } from './hash';
import * as core from './core';

export const ROOT_TYPE = 'account.root';            // 싱글턴 — 계정 전체의 뿌리(보이는 노드)
export const USERS_FOLDER_TYPE = 'account.users';   // 자동 슬롯 — 사용자들이 사는 폴더
export const ROLES_FOLDER_TYPE = 'account.roles';   // 자동 슬롯 — 역할들이 사는 폴더
export const USER_TYPE = 'account.user';
export const ROLE_TYPE = 'account.role';
export const POLICY_TYPE = 'account.policy';   // 싱글턴
export const SECRET_TYPE = 'account.secret';   // 싱글턴 — 프로젝트 암호 해시(걸었을 때만 있다 · 계속 숨김)

// 🔴 viewId 접두사 = 플러그인 id(host 가 'account.' 를 붙인다). 노드를 열면 여는 편집 탭.
const EDITOR_ID = 'account.editor';

/** 사용자 노드 data — 🔴 그 타입을 등록한 계정 플러그인만 읽고 쓴다(불투명 칸). */
export interface UserData {
    displayName: string;
    directPermissions: string[];   // 길① 직접 붙인 권한 낱말
    roleIds: string[];             // 길③ 경유할 역할 id
    fields: Record<string, unknown>;   // 다른 플러그인이 꽂은 칸('<pluginId>.<name>')
}

/** 역할 노드 data — 이용자가 만들고 지우는 바구니(이름·담은 권한·수준·부수 옵션). */
export interface RoleData {
    name: string;
    permissions: string[];   // 길③ 이 역할이 담은 권한 낱말
    level: number;           // 길② 수준(문턱 판정용)
    fields: Record<string, unknown>;   // 플러그인이 꽂은 역할 칸
}

/** 붙이는 길 셋의 켬/끔 + 길② 문턱 + 증명 요구 역할. 🔴 처음 상태는 전부 비어 있다(권한 0 · 바닥 정책 0). */
export interface PolicyData {
    paths: { direct: boolean; level: boolean; role: boolean };
    thresholds: Record<string, number>;   // 길② 권한 낱말 → 요구 수준
    verifyRoles: string[];                 // 이 역할(들)로 로그인하면 증명을 요구한다
}

/** 프로젝트 암호 노드 data = 해시 한 벌. */
export type SecretData = Hashed;

// ── 열린 편집 탭이 보는 「지금 그리는 노드」 — 모듈 전역(달력 nodes.ts 와 같은 결) ──
let activeNodeId: string | null = null;
const activeSubs = new Set<() => void>();
export function setActiveAccountNode(id: string): void { activeNodeId = id; for (const s of [...activeSubs]) s(); }
export function getActiveAccountNode(): string | null { return activeNodeId; }
export function subscribeActiveNode(fn: () => void): () => void { activeSubs.add(fn); return () => { activeSubs.delete(fn); }; }

/** 노드를 편집 탭으로 연다 — 「지금 그리는 노드」를 그걸로 두고 편집 화면을 가운데에(page-editor 와 같은 결). */
function openEditor(host: PluginHost, id: string): void {
    setActiveAccountNode(id);
    host.workspace.open(EDITOR_ID, { where: 'center' });
}

/**
 * 🔴 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름이 가리킨다.
 *   can/canCreate/hidden 은 전부 permit.can(화면 가림) 또는 마스터 판정으로 — 판정의 속은 core 가 쥔다(탐색기는 모른다).
 *   confirmDelete 는 지울 때 경고(인라인 확인) — 계정 루트에만(통째로 사라지니까).
 */
export const accountNodeTypeImpl = {
    // 계정 루트 — 만들기·지우기는 마스터만(권한 체계 밖) · 지울 땐 경고 · 이름/옮기기는 막는다(싱글턴 구조물).
    root: {
        canCreate: () => core.isMaster(),
        can: () => ({ rename: false, move: false, delete: core.isMaster() }),
        confirmDelete: () => '계정을 통째로 지웁니다 — 사용자·역할·정책이 모두 사라집니다. (프로젝트 암호는 남습니다)',
    } satisfies NodeTypeImplFns,
    // 사용자·역할 폴더 — 구조물이라 이름/옮기기/지우기 모두 막고, 보기 권한 없으면 숨긴다.
    usersFolder: {
        can: () => ({ rename: false, move: false, delete: false }),
        hidden: () => !core.can('account.users.view'),
    } satisfies NodeTypeImplFns,
    rolesFolder: {
        can: () => ({ rename: false, move: false, delete: false }),
        hidden: () => !core.can('account.roles.view'),
    } satisfies NodeTypeImplFns,
    // 사용자 — 누르면 편집 탭 · 만들기/고치기/지우기 각각 권한으로 가림 · 보기 권한 없으면 숨김. 탐색기로 만들면 빈 UserData 로.
    user: {
        open: openEditor,
        createInit: () => ({ data: { displayName: '사용자', directPermissions: [], roleIds: [], fields: {} } satisfies UserData }),
        canCreate: () => core.can('account.users.create'),
        can: () => ({ rename: core.can('account.users.edit'), move: core.can('account.users.edit'), delete: core.can('account.users.delete') }),
        hidden: () => !core.can('account.users.view'),
    } satisfies NodeTypeImplFns,
    // 역할 — 사용자와 같은 결(만들기/고치기/지우기/보기). 탐색기로 만들면 빈 RoleData 로.
    role: {
        open: openEditor,
        createInit: () => ({ data: { name: '역할', permissions: [], level: 0, fields: {} } satisfies RoleData }),
        canCreate: () => core.can('account.roles.create'),
        can: () => ({ rename: core.can('account.roles.edit'), move: core.can('account.roles.edit'), delete: core.can('account.roles.delete') }),
        hidden: () => !core.can('account.roles.view'),
    } satisfies NodeTypeImplFns,
    // 정책 — 싱글턴 구조물(이름/지우기 막음) · 고치기는 탭 안에서 · 옮기기는 마스터만(이사용) · 보기 권한으로 숨김.
    policy: {
        open: openEditor,
        can: () => ({ rename: false, move: core.isMaster(), delete: false }),
        hidden: () => !core.can('account.policy.view'),
    } satisfies NodeTypeImplFns,
};

/**
 * 보이는 노드 타입 — 루트(싱글턴) → 자동 슬롯(사용자 폴더·역할 폴더·정책). 사용자·역할은 폴더 밑에 「새로 만들기」로.
 *   🔴 record 아님(탐색기에 보인다) · 아래 '숨김' 넷만 record: true(프로젝트 암호·증명 비밀은 어떤 경우에도 안 보인다).
 */
export const accountNodeTypes: NodeTypeContribution<'root' | 'usersFolder' | 'rolesFolder' | 'user' | 'role' | 'policy'>[] = [
    {
        type: ROOT_TYPE, label: '계정', icon: 'gear',
        container: { accepts: [USERS_FOLDER_TYPE, ROLES_FOLDER_TYPE, POLICY_TYPE] },
        create: { label: '계정' }, unique: 'tree',
        slots: [USERS_FOLDER_TYPE, ROLES_FOLDER_TYPE, POLICY_TYPE],
        impl: 'root',
    },
    { type: USERS_FOLDER_TYPE, label: '사용자', icon: 'book', container: { accepts: [USER_TYPE] }, impl: 'usersFolder' },
    { type: ROLES_FOLDER_TYPE, label: '역할', icon: 'layers', container: { accepts: [ROLE_TYPE] }, impl: 'rolesFolder' },
    { type: USER_TYPE, label: '사용자', icon: 'file', openable: true, create: { label: '사용자', under: [USERS_FOLDER_TYPE] }, impl: 'user' },
    { type: ROLE_TYPE, label: '역할', icon: 'file', openable: true, create: { label: '역할', under: [ROLES_FOLDER_TYPE] }, impl: 'role' },
    { type: POLICY_TYPE, label: '정책', icon: 'check', openable: true, unique: 'tree', impl: 'policy' },
];

/**
 * 숨김 노드 타입 — 프로젝트 암호 해시(싱글턴). record: true 라 탐색기에 「어떤 경우에도」 안 보인다.
 *   🔴 평문 0 — 해시만. 증명 비밀은 credential 부품이 따로 등록한다(account.cred-secret).
 */
export const accountSecretNodeTypes: NodeTypeContribution<never>[] = [
    { type: SECRET_TYPE, label: '프로젝트 암호', record: true },
];
