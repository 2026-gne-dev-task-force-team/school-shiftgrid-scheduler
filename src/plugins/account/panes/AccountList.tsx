/**
 * 사용자·역할·권한 목록 — 탐색기의 「사용자」·「역할」·「권한」 폴더를 누르면 편집 탭에 뜬다(쥔님 2026-11-09 *"하위노드로 띄우지 말고 레코드 뷰로"*).
 *   사용자·역할 노드는 탐색기 나무에 안 보이고(record) 여기 한 줄씩 산다. 표는 컬렉션 꾸러미의 RecordView 가 그린다.
 *   🔴 P4c: 사용자·역할은 컬렉션 레코드와 같은 모양(제목 = 노드 이름 · 칸 = data.values) — 그래서 명단처럼 칸을 더할 수 있다(폴더 data.fields).
 *   만들기·고치기·지우기는 각 권한(can)으로 가린다.
 */
import { useEffect, useState } from 'react';
import { ConfirmDialog, EmptyState, Icon, useFrameToolbar, type PeekHandle } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 컬렉션 약속 타입은 컬렉션 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi, RecordField, RecordCellValue } from '../../collection/contracts/collection';
import {
    can, listUsers, listRoles, createUser, createRole,
    reorderAccount, setRecordValue, setFolderFields, accountFolderId, getNodesApi, removeAccountRecords, removeAndNotify,
} from '../core';
import { NewUserDialog } from './NewUserDialog';
import { setActiveAccountNode } from '../nodes';
import { useAccountVersion, allPermissions } from './useAccount';
import { accountFields, canEdit, userValues, type AccountKind } from './fields';
import { RecordPage } from './RecordPage';

type Row = { id: string } & Record<string, RecordCellValue>;

function recordsModel(kind: AccountKind) {
    const rows: Row[] = (kind === 'users' ? listUsers() : listRoles())
        .map((r) => ({ ...(kind === 'users' ? userValues(r.id, r.values) : r.values), name: r.name, id: r.id }));
    return {
        rows, fields: accountFields(kind),
        canAdd: can(`account.${kind}.create`), canDelete: can(`account.${kind}.delete`), canEdit: canEdit(kind),
        add: () => (kind === 'users' ? createUser('새 사용자') : createRole('새 역할')),
    };
}

/**
 * 권한 목록(쥔님 2026-11-09 「권한 없어 · 여러 스타일로 보게」) — 켜진 플러그인이 낸 권한 낱말 전부.
 *   한 줄 = 권한 하나: 이름·설명·그 권한을 담은 역할·직접 받은 사용자. 읽기 전용(주고 빼기는 역할·사용자 쪽에서).
 */
function permsModel() {
    const roles = listRoles(), users = listUsers();
    const has = (v: RecordCellValue | undefined, id: string) => Array.isArray(v) && v.includes(id);
    const rows: Row[] = allPermissions().map((p) => ({
        id: p.id, name: p.title, desc: p.desc ?? '', word: p.id,
        roles: roles.filter((r) => has(r.values.perms, p.id)).map((r) => r.id),
        users: users.filter((u) => has(u.values.direct, p.id)).map((u) => u.id),
    }));
    const fields: RecordField[] = [
        { key: 'name', label: '권한', type: 'text', readOnly: true },
        { key: 'desc', label: '설명', type: 'text', readOnly: true },
        { key: 'roles', label: '담은 역할', type: 'multi', readOnly: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
        { key: 'users', label: '직접 받은 사용자', type: 'multi', readOnly: true, options: users.map((u) => ({ value: u.id, label: u.name })) },
        { key: 'word', label: '낱말', type: 'text', readOnly: true },
    ];
    return { rows, fields, canAdd: false, canDelete: false, canEdit: false, add: () => '' };
}

export function AccountList({ kind, host, peek, leafId }: { kind: AccountKind | 'perms'; host?: PluginHost; peek?: PeekHandle; leafId?: string }) {
    useAccountVersion();   // 사용자·역할이 바뀌면 다시 그린다
    const bar = useFrameToolbar();   // Frame 툴바 자리(Q12)
    const [adding, setAdding] = useState(false);   // 「새 사용자」 폼(사용자 목록만)
    // 목록이 사라지면(탭 닫기·다른 노드로 바뀜) 열린 미리보기도 닫는다(유령 방지)
    const hidePeek = peek?.hide;   // peek 객체는 그릴 때마다 새로 오니 손잡이(hide)에만 건다
    useEffect(() => () => hidePeek?.(), [hidePeek, kind]);
    const rv = host?.modules.use<RecordViewApi>('collection') ?? null;
    if (!rv) return <EmptyState icon="warn" title="목록을 그릴 수 없습니다" description="컬렉션 꾸러미가 꺼져 있습니다." />;
    const m = kind === 'perms' ? permsModel() : recordsModel(kind);
    // 🔴 줄 열기는 미리보기(peek)로 — 목록은 그대로 두고 옆/아래에 레코드 페이지를 띄운다(쥔님 2026-11-09). peek 이 없으면 같은 탭에서.
    const open = (id: string) => {
        if (!peek) { setActiveAccountNode(id); return; }
        peek.show(<RecordPage id={id} host={host} />, { wideMin: 480 });
    };
    // 🔴 W9 — 여러 줄도 한 묶음으로 휴지통에 · 알림의 「되돌리기」는 노드 시스템 정식 되돌리기(nodes.cmd.undo)
    const remove = (ids: string[]) => { if (host) removeAndNotify(host, kind, ids); else removeAccountRecords(ids); };
    // 🔴 역할 삭제는 확인창부터 — 그 역할을 가진 사용자는 권한을 잃는다(#28)
    const [pendingRoles, setPendingRoles] = useState<string[] | null>(null);
    const rolesAffected = pendingRoles ? listUsers().filter((u) => { const r = u.values.roles; return Array.isArray(r) && pendingRoles.some((id) => r.map(String).includes(id)); }).length : 0;
    const askRemove = (ids: string[]) => { if (kind === 'roles') setPendingRoles(ids); else remove(ids); };
    const { RecordView } = rv;
    const fid = accountFolderId(kind);
    const Frame = getNodesApi()?.Frame;
    const fallback = <Icon name={kind === 'users' ? 'users' : kind === 'roles' ? 'shield' : 'shieldCheck'} size={22} className="text-muted" />;
    const table = (
        <div className="h-full flex flex-col">
            <RecordView<Row>
                fields={m.fields}
                records={m.rows}
                toolbarHost={fid && Frame ? bar.host : undefined}
                getId={(r) => r.id}
                viewKey={`account.${kind}`}
                titleKey="name"
                onCellChange={kind === 'perms' ? undefined : setRecordValue}
                // 사람이 더한 칸만 폴더에 싣는다 — 기본 칸·꽂힌 칸은 locked 라 걸러진다
                onFieldsChange={kind !== 'perms' && m.canEdit ? (next) => setFolderFields(kind, next.filter((f) => !f.locked)) : undefined}
                // 사용자는 폼(이름·아이디·종류·초기 비번·활성)으로 · 역할은 바로 한 줄
                onAddRecord={m.canAdd ? () => { if (kind === 'users') setAdding(true); else m.add(); } : undefined}
                onDeleteRecords={m.canDelete ? askRemove : undefined}
                onOpenRecord={kind === 'perms' ? undefined : open}
                onReorder={m.canEdit ? reorderAccount : undefined}
                className="flex-1 min-h-0"
            />
            {pendingRoles && (
                <ConfirmDialog title="역할을 삭제할까요?" danger confirmLabel="삭제"
                    onConfirm={() => { remove(pendingRoles); setPendingRoles(null); }} onCancel={() => setPendingRoles(null)}>
                    <p className="text-small text-text">역할 {pendingRoles.length}개를 휴지통으로 옮깁니다. 이 역할을 가진 사용자 {rolesAffected}명이 권한을 잃습니다.</p>
                </ConfirmDialog>
            )}
            {adding && <NewUserDialog onClose={() => setAdding(false)} onCreated={(_id, name) => {
                setAdding(false);
                host?.notify({ title: `「${name}」 사용자를 만들었습니다`, key: 'account.created' });
            }} />}
        </div>
    );
    return fid && Frame ? <Frame nodeId={fid} leafId={leafId} toolbar={bar.slot} fallback={fallback}>{table}</Frame> : table;
}
