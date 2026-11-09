/**
 * 사용자·역할 목록 — 탐색기의 「사용자」·「역할」 폴더를 누르면 편집 탭에 뜬다(쥔님 2026-11-09 *"하위노드로 띄우지 말고 레코드 뷰로"*).
 *   사용자·역할 노드는 탐색기 나무에 안 보이고(record) 여기 한 줄씩 산다. 줄을 열면 같은 탭이 그 편집기로 바뀐다.
 *   🔴 레코드 뷰가 켜져 있으면 그 목록 화면을 빌리고(supports), 없으면 간이 목록으로 떨어진다.
 *   만들기·고치기·지우기는 각 권한(can)으로 가린다 — 저장은 core 의 기존 함수 그대로.
 */
import { Button } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 레코드 뷰 약속 타입은 레코드 뷰 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi, RecordField, RecordCellValue } from '../../record-view/contracts/record-view';
import {
    can, listUsers, listRoles, createUser, createRole, deleteUser, deleteRole,
    setUserName, setRoleName, setRoleLevel,
} from '../core';
import { setActiveAccountNode } from '../nodes';
import { useAccountVersion } from './useAccount';

type Row = { id: string } & Record<string, RecordCellValue | string>;

function usersModel() {
    const roleName = new Map(listRoles().map((r) => [r.id, r.data.name]));
    const rows: Row[] = listUsers().map((u) => ({
        id: u.id,
        name: u.data.displayName,
        roles: u.data.roleIds.map((id) => roleName.get(id) ?? '').filter(Boolean).join(', '),
        direct: u.data.directPermissions.length,
    }));
    const edit = can('account.users.edit');
    const fields: RecordField[] = [
        { key: 'name', label: '이름', type: 'text', readOnly: !edit },
        { key: 'roles', label: '역할', type: 'text', readOnly: true },
        { key: 'direct', label: '직접 권한 수', type: 'number', readOnly: true },
    ];
    return {
        rows, fields, noun: '사용자',
        canAdd: can('account.users.create'), canDelete: can('account.users.delete'),
        add: () => createUser('새 사용자'), remove: deleteUser,
        set: (id: string, key: string, v: RecordCellValue) => { if (key === 'name' && typeof v === 'string' && v.trim()) setUserName(id, v.trim()); },
    };
}

function rolesModel() {
    const rows: Row[] = listRoles().map((r) => ({ id: r.id, name: r.data.name, level: r.data.level, perms: r.data.permissions.length }));
    const edit = can('account.roles.edit');
    const fields: RecordField[] = [
        { key: 'name', label: '이름', type: 'text', readOnly: !edit },
        { key: 'level', label: '수준', type: 'number', readOnly: !edit },
        { key: 'perms', label: '권한 수', type: 'number', readOnly: true },
    ];
    return {
        rows, fields, noun: '역할',
        canAdd: can('account.roles.create'), canDelete: can('account.roles.delete'),
        add: () => createRole('새 역할'), remove: deleteRole,
        set: (id: string, key: string, v: RecordCellValue) => {
            if (key === 'name' && typeof v === 'string' && v.trim()) setRoleName(id, v.trim());
            else if (key === 'level' && typeof v === 'number' && Number.isFinite(v)) setRoleLevel(id, v);
        },
    };
}

export function AccountList({ kind, host }: { kind: 'users' | 'roles'; host?: PluginHost }) {
    useAccountVersion();   // 사용자·역할이 바뀌면 다시 그린다
    const m = kind === 'users' ? usersModel() : rolesModel();
    const rv = host?.modules.use<RecordViewApi>('record-view') ?? null;
    if (rv) {
        const { RecordView } = rv;
        return (
            <div className="h-full flex flex-col">
                <RecordView<Row>
                    fields={m.fields}
                    records={m.rows}
                    getId={(r) => r.id}
                    viewKey={`account.${kind}`}
                    titleKey="name"
                    onCellChange={m.set}
                    onAddRecord={m.canAdd ? () => { m.add(); } : undefined}
                    onDeleteRecords={m.canDelete ? (ids) => ids.forEach(m.remove) : undefined}
                    onOpenRecord={(id) => setActiveAccountNode(id)}
                    className="flex-1 min-h-0"
                />
            </div>
        );
    }
    // 레코드 뷰가 꺼져 있을 때 — 이름 목록만(눌러서 열기 · 새로 만들기)
    return (
        <div className="flex flex-col gap-2 p-4">
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {m.rows.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">아직 {m.noun}이(가) 없습니다.</p>}
                {m.rows.map((r) => (
                    <button key={r.id} type="button" onClick={() => setActiveAccountNode(r.id)}
                        className="text-left px-3 h-row border-b border-line last:border-b-0 text-[13px] text-text hover:bg-text/[0.04]">
                        {String(r.name)}
                    </button>
                ))}
            </div>
            {m.canAdd && <div><Button variant="ghost" size="sm" onClick={() => { m.add(); }}>새 {m.noun}</Button></div>}
        </div>
    );
}
