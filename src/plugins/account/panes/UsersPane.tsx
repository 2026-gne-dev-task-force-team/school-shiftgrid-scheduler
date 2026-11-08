/**
 * 설정 「계정 ▸ 사용자」 — 사용자 목록·추가·역할 붙이기·직접 권한·꽂힌 칸 표시. 🔴 색은 토큰 클래스로만(구조 검사 ①).
 *   꽂힌 사용자 칸은 「표시만」 한다 — 값은 꽂은 플러그인만 고친다(editor pane 끼우기는 나중 · 지금은 값 표시).
 */
import { useState } from 'react';
import { Button, Icon } from '../../../pane-ui-system';
import {
    listUsers, listRoles, createUser, deleteUser, setUserRoles, setUserDirect,
} from '../core';
import { useAccountVersion, allPermissions, allUserFields } from './useAccount';

export function UsersPane() {
    useAccountVersion();
    const [name, setName] = useState('');
    const users = listUsers();
    const roles = listRoles();
    const perms = allPermissions();
    const fields = allUserFields();

    const add = () => { if (name.trim()) { createUser(name.trim()); setName(''); } };
    const toggleRole = (uid: string, rid: string, has: boolean, roleIds: string[]) =>
        setUserRoles(uid, has ? roleIds.filter((r) => r !== rid) : [...roleIds, rid]);
    const togglePerm = (uid: string, pid: string, has: boolean, direct: string[]) =>
        setUserDirect(uid, has ? direct.filter((p) => p !== pid) : [...direct, pid]);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12px] text-muted leading-relaxed">사용자를 더하고 역할·권한을 붙입니다. 바닥은 정책 0 — 켜진 길대로만 가려집니다.</p>
            <div className="flex items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                    placeholder="새 사용자 이름"
                    className="flex-1 rounded border border-line bg-side text-text px-2 py-1 text-[13px]"
                />
                <Button variant="accent" size="md" onClick={add}>추가</Button>
            </div>

            {users.length === 0
                ? <p className="text-[12px] text-muted">아직 사용자가 없습니다.</p>
                : (
                    <div className="flex flex-col gap-2">
                        {users.map((u) => (
                            <div key={u.id} className="rounded border border-line p-2.5 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[13px] text-text font-medium">{u.data.displayName}</span>
                                    <Button variant="ghost" size="sm" onClick={() => deleteUser(u.id)}><Icon name="trash" size={13} /></Button>
                                </div>
                                {roles.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {roles.map((r) => {
                                            const has = u.data.roleIds.includes(r.id);
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => toggleRole(u.id, r.id, has, u.data.roleIds)}
                                                    className={`text-[11px] px-1.5 py-0.5 rounded border ${has ? 'border-accent text-accent' : 'border-line text-muted'}`}
                                                >
                                                    {r.data.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {perms.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {perms.map((p) => {
                                            const has = u.data.directPermissions.includes(p.id);
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => togglePerm(u.id, p.id, has, u.data.directPermissions)}
                                                    title={p.id}
                                                    className={`text-[11px] px-1.5 py-0.5 rounded border ${has ? 'border-accent text-accent' : 'border-line text-muted'}`}
                                                >
                                                    {p.title}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {fields.length > 0 && (
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[11px]">
                                        {fields.map((f) => (
                                            <div key={f.id} className="contents">
                                                <dt className="text-muted">{f.title}</dt>
                                                <dd className="text-text">{String(u.data.fields[f.id] ?? '—')}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}
