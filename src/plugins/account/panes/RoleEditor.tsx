/**
 * 역할 편집 탭 — 이름·담은 권한·수준·꽂힌 칸. 🔴 색은 토큰 클래스로만(구조 검사 ①).
 *   역할은 이용자가 만들고 지우는 바구니(쥔님 2026-11-08) — 코드에 역할 이름을 박지 않는다.
 *   ⛔ 「역할 편집 = 사실상 전권」은 그대로 둔다(막는 장치 없음 · 쥔님 판정).
 */
import { useEffect, useState } from 'react';
import { Button } from '../../../pane-ui-system';
import {
    getRole, setRoleName, setRolePermissions, setRoleLevel,
} from '../core';
import { useAccountVersion, allPermissions, allRoleFields } from './useAccount';

export function RoleEditor({ roleId }: { roleId: string }) {
    useAccountVersion();
    const role = getRole(roleId);
    const [name, setName] = useState(role?.name ?? '');
    useEffect(() => { setName(role?.name ?? ''); }, [roleId, role?.name]);

    if (!role) return <p className="text-[12px] text-muted p-4">역할을 찾을 수 없습니다.</p>;

    const perms = allPermissions();
    const fields = allRoleFields();

    const commitName = () => { if (name.trim() && name.trim() !== role.name) setRoleName(roleId, name.trim()); };
    const togglePerm = (pid: string, has: boolean) =>
        setRolePermissions(roleId, has ? role.permissions.filter((p) => p !== pid) : [...role.permissions, pid]);

    return (
        <div className="flex flex-col gap-4 p-4 max-w-[560px]">
            <div className="flex items-end gap-3">
                <label className="flex flex-col gap-1 text-[12px] text-muted flex-1">
                    이름
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitName(); }}
                        className="rounded border border-line bg-side text-text px-2 py-1 text-[14px]"
                    />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                    수준
                    <input
                        type="number"
                        value={role.level}
                        onChange={(e) => setRoleLevel(roleId, Number(e.target.value) || 0)}
                        className="w-20 rounded border border-line bg-side text-text px-2 py-1 text-[14px]"
                    />
                </label>
            </div>

            <section className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">담은 권한</h4>
                {perms.length === 0
                    ? <p className="text-[12px] text-muted">아직 권한을 선언한 기능이 없습니다.</p>
                    : (
                        <div className="flex flex-wrap gap-1.5">
                            {perms.map((p) => {
                                const has = role.permissions.includes(p.id);
                                return (
                                    <button key={p.id} type="button" title={p.id} onClick={() => togglePerm(p.id, has)}
                                        className={`text-[12px] px-2 py-0.5 rounded border ${has ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                                        {p.title}
                                    </button>
                                );
                            })}
                        </div>
                    )}
            </section>

            {fields.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">끼운 정보</h4>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                        {fields.map((f) => (
                            <div key={f.id} className="contents">
                                <dt className="text-muted">{f.title}</dt>
                                <dd className="text-text">{String(role.fields[f.id] ?? '—')}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            <p className="text-[11px] text-muted leading-relaxed">수준(숫자)은 「정책 ▸ 길② 문턱」 판정에 쓰입니다.</p>
            <div><Button variant="ghost" size="sm" onClick={commitName}>저장</Button></div>
        </div>
    );
}
