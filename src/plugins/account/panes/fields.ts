/**
 * 사용자·역할 칸 정의 한 벌 — 표(AccountList)와 레코드 페이지(RecordPage)가 같이 읽는다(P4c · 명단·방의 baseFields 와 같은 결).
 *   기본 칸(locked · 첫 칸이 제목 = 노드 이름) + 다른 플러그인이 꽂은 칸(보기만) + 사람이 폴더에 더한 칸.
 *   고르기 후보는 그때그때 센다 — 역할은 지금 있는 역할, 권한은 켜진 플러그인이 선언한 낱말(값은 id 라 이름을 바꿔도 안 끊긴다).
 */
import type { RecordField, RecordCellValue } from '../../collection/contracts/collection';
import {
    can, listRoles, folderFieldsOf, credStateOf, credentialMethods,
    LOGIN_ID_KEY, CRED_METHOD_KEY, ACTIVE_KEY, CRED_STATE_KEY,
} from '../core';
import { allPermissions, allUserFields, allRoleFields } from './useAccount';

export type AccountKind = 'users' | 'roles';

const permOptions = () => allPermissions().map((p) => ({ value: p.id, label: p.title }));
const roleOptions = () => listRoles().map((r) => ({ value: r.id, label: r.name }));
const plugged = (fs: { id: string; title: string }[]): RecordField[] =>
    fs.map((f) => ({ key: f.id, label: f.title, type: 'text', readOnly: true, locked: true }));

/** 고치기 권한이 없으면 전부 보기만. 사람이 더한 칸만 locked 가 없다(표의 칸 고치기가 그것만 돌려받아 저장한다). */
export function accountFields(kind: AccountKind): RecordField[] {
    const base: RecordField[] = kind === 'users' ? [
        { key: 'name', label: '이름', type: 'text', locked: true },
        // 🔴 W11 — 로그인 칸. 아이디는 유일(W10) · 자격증명 상태는 계산 칸(값은 안 보인다 — 🔴 비밀번호 칸은 없다)
        { key: LOGIN_ID_KEY, label: '아이디', type: 'text', locked: true, unique: true },
        { key: CRED_METHOD_KEY, label: '자격증명 종류', type: 'select', locked: true, options: credentialMethods().map((m) => ({ value: m.id, label: m.title })) },
        { key: ACTIVE_KEY, label: '활성', type: 'check', locked: true },
        { key: CRED_STATE_KEY, label: '자격증명', type: 'text', locked: true, readOnly: true },
        { key: 'roles', label: '역할', type: 'multi', locked: true, options: roleOptions() },
        { key: 'direct', label: '직접 권한', type: 'multi', locked: true, options: permOptions() },
    ] : [
        { key: 'name', label: '이름', type: 'text', locked: true },
        { key: 'level', label: '수준', type: 'number', locked: true },
        { key: 'perms', label: '권한', type: 'multi', locked: true, options: permOptions() },
    ];
    const all = [...base, ...plugged(kind === 'users' ? allUserFields() : allRoleFields()), ...folderFieldsOf(kind)];
    return canEdit(kind) ? all : all.map((f) => ({ ...f, readOnly: true }));
}

export const canEdit = (kind: AccountKind): boolean => can(`account.${kind}.edit`);

/** 사용자 한 줄의 보이는 값 — 활성은 칸이 없으면 켜짐(W12 `!== false`) · 자격증명 상태는 그때 센다(W13). */
export function userValues(id: string, values: Record<string, RecordCellValue>): Record<string, RecordCellValue> {
    return { ...values, [ACTIVE_KEY]: values[ACTIVE_KEY] !== false, [CRED_STATE_KEY]: credStateOf(id) };
}
