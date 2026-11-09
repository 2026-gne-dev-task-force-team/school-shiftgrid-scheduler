/**
 * 정책 편집 탭 — 붙이는 길 셋 켬/끔 + 길② 문턱 + 증명 요구 역할. 🔴 처음 상태는 전부 꺼짐(바닥 정책 0).
 *   권한 표는 켜진 기능들의 선언을 모은 것(고정 목록 없음). 색은 토큰 클래스로만(구조 검사 ①).
 *   정책은 싱글턴이라 노드 id 가 필요 없다 — core 의 전역 정책을 읽고 쓴다(탐색기에서 「정책」을 누르면 열린다).
 */
import { Toggle } from '../../../pane-ui-system';
import { getPolicy, setPolicy, listRoles } from '../core';
import { useAccountVersion, allPermissions } from './useAccount';

export function PolicyEditor() {
    useAccountVersion();
    const pol = getPolicy();
    const perms = allPermissions();
    const roles = listRoles();

    return (
        <div className="flex flex-col gap-4 p-4 max-w-[560px]">
            <section className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">붙이는 길</h4>
                <Row label="① 사용자에 권한 직접" on={pol.paths.direct} onToggle={(v) => setPolicy({ paths: { ...pol.paths, direct: v } })} />
                <Row label="③ 역할이 담은 권한" on={pol.paths.role} onToggle={(v) => setPolicy({ paths: { ...pol.paths, role: v } })} />
                <Row label="② 역할 수준 문턱" on={pol.paths.level} onToggle={(v) => setPolicy({ paths: { ...pol.paths, level: v } })} />
            </section>

            {pol.paths.level && perms.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">길② 권한별 요구 수준</h4>
                    {perms.map((p) => (
                        <label key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="min-w-0 flex flex-col" title={p.id}>
                                <span className="text-text truncate">{p.title}</span>
                                {p.desc && <span className="text-[11px] text-muted leading-snug">{p.desc}</span>}
                            </span>
                            <input
                                type="number"
                                value={pol.thresholds[p.id] ?? 0}
                                onChange={(e) => setPolicy({ thresholds: { [p.id]: Number(e.target.value) || 0 } })}
                                className="w-16 rounded border border-line bg-side text-text px-1 py-0.5 text-[12px]"
                            />
                        </label>
                    ))}
                </section>
            )}

            {roles.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">증명 요구 역할</h4>
                    <p className="text-[11px] text-muted">이 역할로 로그인하면 증명을 거칩니다(증명 수단이 없으면 「증명 안 됨」으로 남습니다).</p>
                    <div className="flex flex-wrap gap-1.5">
                        {roles.map((r) => {
                            const on = pol.verifyRoles.includes(r.id);
                            return (
                                <button key={r.id} type="button"
                                    onClick={() => setPolicy({ verifyRoles: on ? pol.verifyRoles.filter((x) => x !== r.id) : [...pol.verifyRoles, r.id] })}
                                    className={`text-[12px] px-2 py-0.5 rounded border ${on ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                                    {r.data.name}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {perms.length === 0 && (
                <p className="text-[12px] text-muted">아직 권한 낱말을 선언한 기능이 없습니다.</p>
            )}
        </div>
    );
}

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-text">{label}</span>
            <Toggle on={on} label={label} onToggle={onToggle} />
        </div>
    );
}
