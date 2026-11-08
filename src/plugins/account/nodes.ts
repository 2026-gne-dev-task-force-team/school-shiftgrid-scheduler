/**
 * 계정 ↔ 노드 시스템 다리 — 🔴 계정 데이터(사용자·역할·정책·프로젝트 암호 해시)는 노드다(달력 일정과 같은 꼴).
 *   record: true 라 탐색기에 「어떤 경우에도」 안 보인다 — 저장·휴지통은 일반 노드와 같다. 프로젝트 파일에 실려 다닌다.
 *   ⛔ host.store·persist 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *
 *   ⚠️ 이 파일은 비-뷰라 소문자 record 리터럴을 둬도 된다(구조 검사 ⑯: 뷰에만 금지).
 */
import type { NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { Hashed } from './hash';

export const USER_TYPE = 'account.user';
export const ROLE_TYPE = 'account.role';
export const POLICY_TYPE = 'account.policy';   // 싱글턴
export const SECRET_TYPE = 'account.secret';   // 싱글턴 — 프로젝트 암호 해시(걸었을 때만 있다)

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

/**
 * 노드 타입 넷 — 전부 record: true(탐색기에 안 보인다). 순수 데이터라 impl(함수 묶음) 없음(달력 일정과 같은 꼴).
 *   🔴 record 리터럴은 여기(비-뷰)에 산다 — 구조 검사 ⑯ 은 뷰에서만 소문자 record 를 막는다.
 */
export const accountNodeTypes: NodeTypeContribution<never>[] = [
    { type: USER_TYPE, label: '사용자', record: true },
    { type: ROLE_TYPE, label: '역할', record: true },
    { type: POLICY_TYPE, label: '정책', record: true },
    { type: SECRET_TYPE, label: '프로젝트 암호', record: true },
];
