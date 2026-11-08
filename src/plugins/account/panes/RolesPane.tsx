/**
 * 설정 「계정 ▸ 역할」 — 역할은 이용자가 만들고 지우는 바구니(이름·담은 권한·수준·꽂힌 칸). 🔴 색은 토큰 클래스로만(구조 검사 ①).
 */
import { useState } from 'react';
import { Button, Icon } from '../../../pane-ui-system';
import { listRoles, createRole, deleteRole, setRolePermissions, setRoleLevel } from '../core';
import { useAccountVersion, allPermissions, allRoleFields } from './useAccount';

export function RolesPane() {
    useAccountVersion();
    const [name, setName] = useState('');
    const roles = listRoles();
    const perms = allPermissions();
    const fields = allRoleFields();

    const add = () => { if (name.trim()) { createRole(name.trim()); setName(''); } };
    const togglePerm = (rid: string, pid: string, has: boolean, cur: string[]) =>
        setRolePermissions(rid, has ? cur.filter((p) => p !== pid) : [...cur, pid]);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12px] text-muted leading-relaxed">역할은 권한을 담는 바구니입니다. 수준(숫자)은 「길② 문턱」 판정에 쓰입니다.</p>
            <div className="flex items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                    placeholder="새 역할 이름"
                    className="flex-1 rounded border border-line bg-side text-text px-2 py-1 text-[13px]"
                />
                <Button variant="accent" size="md" onClick={add}>추가</Button>
            </div>

            {roles.length === 0
                ? <p className="text-[12px] text-muted">아직 역할이 없습니다.</p>
                : (
                    <div className="flex flex-col gap-2">
                        {roles.map((r) => (
                            <div key={r.id} className="rounded border border-line p-2.5 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[13px] text-text font-medium">{r.data.name}</span>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[11px] text-muted flex items-center gap-1">
                                            수준
                                            <input
                                                type="number"
                                                value={r.data.level}
                                                onChange={(e) => setRoleLevel(r.id, Number(e.target.value) || 0)}
                                                className="w-14 rounded border border-line bg-side text-text px-1 py-0.5 text-[12px]"
                                            />
                                        </label>
                                        <Button variant="ghost" size="sm" onClick={() => deleteRole(r.id)}><Icon name="trash" size={13} /></Button>
                                    </div>
                                </div>
                                {perms.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {perms.map((p) => {
                                            const has = r.data.permissions.includes(p.id);
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => togglePerm(r.id, p.id, has, r.data.permissions)}
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
                                                <dd className="text-text">{String(r.data.fields[f.id] ?? '—')}</dd>
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
