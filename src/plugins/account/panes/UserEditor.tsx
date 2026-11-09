/**
 * 사용자 편집 탭 — 이름·역할·직접 권한·꽂힌 칸. 🔴 색은 토큰 클래스로만(구조 검사 ①).
 *   노드 하나(userId)를 그린다 — 탐색기에서 사용자를 누르면 열린다(설정 안이 아니라 탭).
 *   꽂힌 칸은 「표시만」 — 값은 꽂은 플러그인만 고친다(노드 data 와 같은 결).
 */
import { useEffect, useState } from 'react';
import { Button } from '../../../pane-ui-system';
import {
    getUser, listRoles, setUserName, setUserRoles, setUserDirect,
} from '../core';
import { PermRow } from './PermRow';
import { useAccountVersion, allPermissions, allUserFields } from './useAccount';

export function UserEditor({ userId }: { userId: string }) {
    useAccountVersion();
    const user = getUser(userId);
    const [name, setName] = useState(user?.displayName ?? '');
    // 다른 사용자로 탭이 바뀌면 입력칸을 그 사람 이름으로 맞춘다.
    useEffect(() => { setName(user?.displayName ?? ''); }, [userId, user?.displayName]);

    if (!user) return <p className="text-[12px] text-muted p-4">사용자를 찾을 수 없습니다.</p>;

    const roles = listRoles();
    const perms = allPermissions();
    const fields = allUserFields();

    const commitName = () => { if (name.trim() && name.trim() !== user.displayName) setUserName(userId, name.trim()); };
    const toggleRole = (rid: string, has: boolean) =>
        setUserRoles(userId, has ? user.roleIds.filter((r) => r !== rid) : [...user.roleIds, rid]);
    const togglePerm = (pid: string, has: boolean) =>
        setUserDirect(userId, has ? user.directPermissions.filter((p) => p !== pid) : [...user.directPermissions, pid]);

    return (
        <div className="flex flex-col gap-4 p-4 max-w-[560px]">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
                이름
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitName(); }}
                    className="rounded border border-line bg-side text-text px-2 py-1 text-[14px]"
                />
            </label>

            <section className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">역할</h4>
                {roles.length === 0
                    ? <p className="text-[12px] text-muted">아직 역할이 없습니다.</p>
                    : (
                        <div className="flex flex-wrap gap-1.5">
                            {roles.map((r) => {
                                const has = user.roleIds.includes(r.id);
                                return (
                                    <button key={r.id} type="button" onClick={() => toggleRole(r.id, has)}
                                        className={`text-[12px] px-2 py-0.5 rounded border ${has ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                                        {r.data.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
            </section>

            {perms.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">직접 준 권한</h4>
                    <div className="flex flex-col gap-1">
                        {perms.map((p) => <PermRow key={p.id} p={p} has={user.directPermissions.includes(p.id)} onToggle={togglePerm} />)}
                    </div>
                </section>
            )}

            {fields.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">끼운 정보</h4>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                        {fields.map((f) => (
                            <div key={f.id} className="contents">
                                <dt className="text-muted">{f.title}</dt>
                                <dd className="text-text">{String(user.fields[f.id] ?? '—')}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            <p className="text-[11px] text-muted leading-relaxed">
                이름과 권한은 바로 저장됩니다. 권한이 실제로 가려지려면 「정책」에서 해당 길을 켜야 합니다.
            </p>
            <div><Button variant="ghost" size="sm" onClick={commitName}>저장</Button></div>
        </div>
    );
}
