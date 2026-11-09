/**
 * 사용자·역할 레코드 페이지 — 컬렉션 공통 RecordPage 한 벌(Q5 R5)에 칸·자격증명 슬롯·받은 권한 설명만 얹는다. 줄 미리보기와 편집 탭이 같이 쓴다.
 *   🙋 7 A(쥔님 2026-11-09): 레코드는 이 페이지에서만 고친다 — 오른쪽 속성 패널엔 칸을 안 낸다.
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 각 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi } from '../../collection/contracts/collection';
import { getRecord, nodeKindOf, setRecordValue, renameRecord, setAccountBody } from '../core';
import { useAccountVersion, allPermissions } from './useAccount';
import { accountFields, canEdit } from './fields';
import { CredentialSlots } from './CredentialSlots';

export function RecordPage({ id, host }: { id: string; host?: PluginHost }) {
    useAccountVersion();
    const rec = getRecord(id);
    const rv = host?.modules.use<RecordViewApi>('collection');
    if (!rec) return <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
    if (!host || !rv) return <p className="text-small text-muted">컬렉션 꾸러미가 꺼져 있어 칸을 그릴 수 없습니다.</p>;
    const kind = nodeKindOf(id) === 'user' ? 'users' : 'roles';
    const edit = canEdit(kind);
    // 받은 권한 설명(쥔님 2026-11-09 「권한 자세한 설명이 없다」) — 고르기 칸은 이름만 보여 주니 설명은 아래에 읽기 전용으로
    const held = rec.values[kind === 'users' ? 'direct' : 'perms'];
    const perms = allPermissions().filter((p) => p.desc && Array.isArray(held) && held.includes(p.id));
    return (
        <rv.RecordPage
            host={host}
            id={id}
            fields={accountFields(kind)}
            values={{ ...rec.values, name: rec.name }}
            onChange={edit ? (key, v) => setRecordValue(id, key, v) : undefined}
            onRename={(n) => renameRecord(id, n)}
            onBody={(v) => setAccountBody(id, v)}
            after={(
                <>
                    {kind === 'users' && <CredentialSlots userId={id} />}
                    {perms.length > 0 && (
                        <dl className="flex flex-col gap-1 px-2">
                            {perms.map((p) => (
                                <div key={p.id}>
                                    <dt className="text-small text-text">{p.title}</dt>
                                    <dd className="text-note text-muted leading-relaxed">{p.desc}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </>
            )}
        />
    );
}
