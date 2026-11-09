/**
 * 사용자·역할 칸 정의 한 벌 — 표(AccountList)와 레코드 페이지(RecordPage)가 같이 읽는다(P4c · 명단·방의 baseFields 와 같은 결).
 *   기본 칸(locked · 첫 칸이 제목 = 노드 이름) + 다른 플러그인이 꽂은 칸(보기만) + 사람이 폴더에 더한 칸.
 *   고르기 후보는 그때그때 센다 — 역할은 지금 있는 역할, 권한은 켜진 플러그인이 선언한 낱말(값은 id 라 이름을 바꿔도 안 끊긴다).
 */
import type { RecordField } from '../../collection/contracts/collection';
import { can, listRoles, folderFieldsOf } from '../core';
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
