/**
 * 오른쪽 = 검증(보조 도구층).
 *  - 위: 미리 만든 규칙 틀(RuleTemplate)을 '＋'로 끌어와 규칙(ConflictRule)으로 추가
 *  - 가운데: 켠 규칙들 — 설정값 수정 · 켜고 끄기 · 삭제
 *  - 아래: 실시간으로 계산된 충돌 목록
 * '실시간 검증' 스위치로 전체를 끄고 켤 수 있다.
 */
import { useStore } from '../../store/store';
import { RULE_TEMPLATES, templateById } from '../../rules/templates';
import type { ConflictRule, ParamValue } from '../../types/schema';

let ruleSeq = 0;

export default function RightPanel() {
    const { doc, dispatch, ui, setUI, conflicts } = useStore();

    const addRule = (templateId: string) => {
        const t = templateById(templateId);
        if (!t) return;
        const params = Object.fromEntries(t.params.map((p) => [p.key, p.default]));
        const rule: ConflictRule = {
            id: `rule-${ruleSeq++}`, templateId, name: t.label, enabled: true, params,
        };
        dispatch({ type: 'ADD_RULE', rule });
    };

    return (
        <aside className="w-72 flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">검증</p>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={ui.liveValidation} onChange={(e) => setUI({ liveValidation: e.target.checked })} />
                    실시간 검증
                </label>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* 규칙 틀 팔레트 */}
                <div className="px-3 py-2 border-b border-slate-200">
                    <p className="text-[11px] text-slate-400 mb-1.5">규칙 틀 (＋로 추가)</p>
                    {RULE_TEMPLATES.map((t) => (
                        <div key={t.id} className="flex items-start gap-2 py-1">
                            <button
                                onClick={() => addRule(t.id)}
                                className="mt-0.5 w-5 h-5 flex-shrink-0 grid place-items-center rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                                title="이 규칙 추가"
                            >＋</button>
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700">{t.label}</p>
                                <p className="text-[10px] text-slate-400 leading-tight">{t.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 켠 규칙들 */}
                <div className="px-3 py-2 border-b border-slate-200">
                    <p className="text-[11px] text-slate-400 mb-1.5">적용 중인 규칙</p>
                    {doc.rules.length === 0 && <p className="text-[11px] text-slate-300 py-1">아직 없음 — 위에서 추가하세요</p>}
                    {doc.rules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}
                </div>

                {/* 충돌 목록 */}
                <div className="px-3 py-2">
                    <p className="text-[11px] text-slate-400 mb-1.5">
                        발견된 충돌 {ui.liveValidation ? `(${conflicts.length})` : '— 꺼짐'}
                    </p>
                    {ui.liveValidation && conflicts.length === 0 && (
                        <p className="text-[11px] text-emerald-600 py-1">충돌 없음 ✓</p>
                    )}
                    {ui.liveValidation && conflicts.map((cf, i) => (
                        <div key={i} className="flex items-start gap-2 py-1 text-[11px]">
                            <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cf.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                            <span className="text-slate-600">{cf.message} <span className="text-slate-400">· {cf.assignmentIds.length}건</span></span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}

// ── 규칙 하나 — 설정값 수정 · 토글 · 삭제 ─────────────────────
function RuleCard({ rule }: { rule: ConflictRule }) {
    const { dispatch } = useStore();
    const t = templateById(rule.templateId);
    if (!t) return null;

    const setParam = (key: string, value: ParamValue) =>
        dispatch({ type: 'UPDATE_RULE', id: rule.id, patch: { params: { ...rule.params, [key]: value } } });

    return (
        <div className={`mb-1.5 rounded border p-2 ${rule.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'}`}>
            <div className="flex items-center gap-1.5">
                <input
                    type="checkbox" checked={rule.enabled}
                    onChange={(e) => dispatch({ type: 'UPDATE_RULE', id: rule.id, patch: { enabled: e.target.checked } })}
                />
                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{rule.name}</span>
                <button onClick={() => dispatch({ type: 'REMOVE_RULE', id: rule.id })} className="text-slate-400 hover:text-red-500 text-xs">×</button>
            </div>
            {t.params.length > 0 && (
                <div className="mt-1.5 space-y-1 pl-5">
                    {t.params.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="w-16">{p.label}</span>
                            {p.type === 'select' ? (
                                <select
                                    value={String(rule.params[p.key])}
                                    onChange={(e) => setParam(p.key, e.target.value)}
                                    className="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[11px]"
                                >
                                    {p.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : p.type === 'number' ? (
                                <input
                                    type="number" value={Number(rule.params[p.key])}
                                    onChange={(e) => setParam(p.key, Number(e.target.value))}
                                    className="w-16 border border-slate-200 rounded px-1 py-0.5 text-[11px]"
                                />
                            ) : (
                                <input
                                    type="text" value={String(rule.params[p.key])}
                                    onChange={(e) => setParam(p.key, e.target.value)}
                                    className="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[11px]"
                                />
                            )}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
