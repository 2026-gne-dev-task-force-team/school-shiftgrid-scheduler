/**
 * 사용자·역할 목록 — 탐색기의 「사용자」·「역할」 폴더를 누르면 편집 탭에 뜬다(쥔님 2026-11-09 *"하위노드로 띄우지 말고 레코드 뷰로"*).
 *   사용자·역할 노드는 탐색기 나무에 안 보이고(record) 여기 한 줄씩 산다. 줄을 열면 같은 탭이 그 편집기로 바뀐다.
 *   🔴 레코드 뷰가 켜져 있으면 그 목록 화면을 빌리고(supports), 없으면 간이 목록으로 떨어진다.
 *   만들기·고치기·지우기는 각 권한(can)으로 가린다 — 저장은 core 의 기존 함수 그대로.
 */
import { useEffect } from 'react';
import { Button, Icon, type PeekHandle } from '../../../pane-ui-system';
// 🔴 import type 만 — page-doc 약속(값은 host.modules.use).
import type { PageDocApi } from '../../page/contracts/page-doc';
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 레코드 뷰 약속 타입은 레코드 뷰 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi, RecordField, RecordCellValue } from '../../collection/contracts/collection';
import {
    can, listUsers, listRoles, createUser, createRole, deleteUser, deleteRole,
    setUserName, setRoleName, setRoleLevel, reorderAccount, setUserRoles, setUserDirect, setRolePermissions,
    accountBodyOf, setAccountBody, accountFolderId, getNodesApi, getUser, getRole,
} from '../core';
import { setActiveAccountNode } from '../nodes';
import { useAccountVersion, allPermissions } from './useAccount';
import { UserEditor } from './UserEditor';
import { RoleEditor } from './RoleEditor';

type Row = { id: string } & Record<string, RecordCellValue>;

/** 고르기 후보 — 권한은 켜진 플러그인이 선언한 낱말(이름 옆에 id), 역할은 지금 있는 역할. 값은 id 라 이름을 바꿔도 안 끊긴다. */
const permOptions = () => allPermissions().map((p) => ({ value: p.id, label: p.title }));
const roleOptions = () => listRoles().map((r) => ({ value: r.id, label: r.data.name }));
const asList = (v: RecordCellValue): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

function usersModel() {
    const rows: Row[] = listUsers().map((u) => ({
        id: u.id,
        name: u.data.displayName,
        roles: [...u.data.roleIds],
        direct: [...u.data.directPermissions],
    }));
    const edit = can('account.users.edit');
    const fields: RecordField[] = [
        { key: 'name', label: '이름', type: 'text', readOnly: !edit },
        { key: 'roles', label: '역할', type: 'multi', readOnly: !edit, options: roleOptions() },
        { key: 'direct', label: '직접 권한', type: 'multi', readOnly: !edit, options: permOptions() },
    ];
    return {
        rows, fields, noun: '사용자',
        canAdd: can('account.users.create'), canDelete: can('account.users.delete'), canEdit: edit,
        add: () => createUser('새 사용자'), remove: deleteUser,
        set: (id: string, key: string, v: RecordCellValue) => {
            if (key === 'name' && typeof v === 'string' && v.trim()) setUserName(id, v.trim());
            else if (key === 'roles') setUserRoles(id, asList(v));
            else if (key === 'direct') setUserDirect(id, asList(v));
        },
    };
}

function rolesModel() {
    const rows: Row[] = listRoles().map((r) => ({ id: r.id, name: r.data.name, level: r.data.level, perms: [...r.data.permissions] }));
    const edit = can('account.roles.edit');
    const fields: RecordField[] = [
        { key: 'name', label: '이름', type: 'text', readOnly: !edit },
        { key: 'level', label: '수준', type: 'number', readOnly: !edit },
        { key: 'perms', label: '권한', type: 'multi', readOnly: !edit, options: permOptions() },
    ];
    return {
        rows, fields, noun: '역할',
        canAdd: can('account.roles.create'), canDelete: can('account.roles.delete'), canEdit: edit,
        add: () => createRole('새 역할'), remove: deleteRole,
        set: (id: string, key: string, v: RecordCellValue) => {
            if (key === 'name' && typeof v === 'string' && v.trim()) setRoleName(id, v.trim());
            else if (key === 'level' && typeof v === 'number' && Number.isFinite(v)) setRoleLevel(id, v);
            else if (key === 'perms') setRolePermissions(id, asList(v));
        },
    };
}

/**
 * 권한 목록(쥔님 2026-11-09 「권한 없어 · 여러 스타일로 보게」) — 켜진 플러그인이 낸 권한 낱말 전부.
 *   한 줄 = 권한 하나: 이름·설명·그 권한을 담은 역할·직접 받은 사용자. 읽기 전용(주고 빼기는 역할·사용자 쪽에서) — 보기 스타일은 레코드 뷰가 쥔다.
 */
function permsModel() {
    const roles = listRoles(), users = listUsers();
    const rows: Row[] = allPermissions().map((p) => ({
        id: p.id, name: p.title, desc: p.desc ?? '', word: p.id,
        roles: roles.filter((r) => r.data.permissions.includes(p.id)).map((r) => r.id),
        users: users.filter((u) => u.data.directPermissions.includes(p.id)).map((u) => u.id),
    }));
    const fields: RecordField[] = [
        { key: 'name', label: '권한', type: 'text', readOnly: true },
        { key: 'desc', label: '설명', type: 'text', readOnly: true },
        { key: 'roles', label: '담은 역할', type: 'multi', readOnly: true, options: roleOptions() },
        { key: 'users', label: '직접 받은 사용자', type: 'multi', readOnly: true, options: users.map((u) => ({ value: u.id, label: u.data.displayName })) },
        { key: 'word', label: '낱말', type: 'text', readOnly: true },
    ];
    return {
        rows, fields, noun: '권한',
        canAdd: false, canDelete: false, canEdit: false,
        add: () => '', remove: (_id: string) => {},
        set: (_id: string, _key: string, _v: RecordCellValue) => {},
    };
}

/** 줄 미리보기 — 편집기 + 그 사용자·역할의 문서(page-doc 이 있으면 · 노션처럼). */
function RecordPeek({ kind, id, host }: { kind: 'users' | 'roles'; id: string; host?: PluginHost }) {
    useAccountVersion();
    const pd = host?.modules.use<PageDocApi>('page-doc');
    const name = kind === 'users' ? getUser(id)?.displayName : getRole(id)?.name;
    return (
        <div className="h-full overflow-auto">
            {kind === 'users' ? <UserEditor userId={id} /> : <RoleEditor roleId={id} />}
            {host && pd && name != null && (
                <div className="border-t border-line">
                    <pd.PageDoc host={host} docKey={id} value={accountBodyOf(id)} onChange={(v) => setAccountBody(id, v)}
                        icon={getNodesApi()?.get(id)?.icon} onSetIcon={(i) => getNodesApi()?.setIcon(id, i)}
                        title={name} onRename={(n) => (kind === 'users' ? setUserName(id, n) : setRoleName(id, n))} />
                </div>
            )}
        </div>
    );
}

/** 탭 머리 — 폴더 노드의 아이콘·이름을 탭 안에서 바로 바꾼다(페이지 편집기와 같은 결). */
function ListHeader({ kind, leafId }: { kind: 'users' | 'roles' | 'perms'; leafId?: string }) {
    const fid = accountFolderId(kind);
    const Header = getNodesApi()?.Header;
    if (!fid || !Header) return null;
    const fallback = <Icon name={kind === 'users' ? 'users' : kind === 'roles' ? 'shield' : 'shieldCheck'} size={18} className="text-muted" />;
    return (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 shrink-0">
            <Header nodeId={fid} leafId={leafId} fallback={fallback} />
        </div>
    );
}

export function AccountList({ kind, host, peek, leafId }: { kind: 'users' | 'roles' | 'perms'; host?: PluginHost; peek?: PeekHandle; leafId?: string }) {
    useAccountVersion();   // 사용자·역할이 바뀌면 다시 그린다
    const m = kind === 'users' ? usersModel() : kind === 'roles' ? rolesModel() : permsModel();
    // 🔴 줄 열기(→)는 미리보기(peek)로 — 목록은 그대로 두고 옆/아래에 편집기를 띄운다(쥔님 2026-11-09). peek 이 없으면 같은 탭에서.
    const open = (id: string) => {
        if (kind === 'perms') return;
        if (!peek) { setActiveAccountNode(id); return; }
        peek.show(<RecordPeek kind={kind} id={id} host={host} />, { wideMin: 420 });
    };
    // 목록이 사라지면(탭 닫기·다른 노드로 바뀜) 열린 미리보기도 닫는다(유령 방지)
    const hidePeek = peek?.hide;   // peek 객체는 그릴 때마다 새로 오니 손잡이(hide)에만 건다
    useEffect(() => () => hidePeek?.(), [hidePeek, kind]);
    const rv = host?.modules.use<RecordViewApi>('collection') ?? null;
    if (rv) {
        const { RecordView } = rv;
        return (
            <div className="h-full flex flex-col">
                <ListHeader kind={kind} leafId={leafId} />
                <RecordView<Row>
                    fields={m.fields}
                    records={m.rows}
                    getId={(r) => r.id}
                    viewKey={`account.${kind}`}
                    titleKey="name"
                    onCellChange={m.set}
                    onAddRecord={m.canAdd ? () => { m.add(); } : undefined}
                    onDeleteRecords={m.canDelete ? (ids) => ids.forEach(m.remove) : undefined}
                    onOpenRecord={kind === 'perms' ? undefined : open}
                    onReorder={m.canEdit ? reorderAccount : undefined}
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
                    <button key={r.id} type="button" onClick={() => open(r.id)}
                        className="text-left px-3 h-row border-b border-line last:border-b-0 text-[13px] text-text hover:bg-text/[0.04]">
                        {String(r.name)}
                    </button>
                ))}
            </div>
            {m.canAdd && <div><Button variant="ghost" size="sm" onClick={() => { m.add(); }}>새 {m.noun}</Button></div>}
        </div>
    );
}
