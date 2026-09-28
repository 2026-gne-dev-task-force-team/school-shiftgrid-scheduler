/** 점검 — 규칙별 문제 수·대상 수·조정할 수 있는 것·권장 점수. 자동 개선 + 「더 개선 없음」 신호 */
import { useState } from 'react';
import { useStore, type EditFocus } from '../../store/store';
import { autoAdjust, RULES, type SolveProgress, type RuleDiagnosis } from '../../engine/api';
import type { Violation } from '../../types/schema';
import type { ConflictRule, ParamValue } from '../../types/schema';
import { Button, Card, Pill, Mark, Info, Modal, Select, TextInput, EmptyGuide } from '../parts/ui';
import { Icon } from '../parts/Icon';
import { L } from '../help/terms';
import { Term } from '../help/Term';

const ruleName = (rule: ConflictRule) => RULES.find((t) => t.id === rule.templateId)?.label ?? rule.name;
/** 권장 규칙의 무게 묶음 — 화면엔 학교 말로 */
const BUCKET_LABEL: Record<string, string> = { essential: '매우 중요', important: '중요', preferred: '선호' };

export default function DiagnoseScreen() {
    const st = useStore();
    const diag = st.diag;
    const [fixableOnly, setFixableOnly] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<SolveProgress | null>(null);
    const [steady, setSteady] = useState(false);
    const [ruleEdit, setRuleEdit] = useState<ConflictRule | null>(null);

    const hasAssign = st.doc.assignments.some((a) => !a.fixed);
    const rows = diag.rules.filter((r) => !fixableOnly || r.fixableCount > 0);

    const adjust = async () => {
        setRunning(true); setSteady(false); setProgress(null);
        const before = { hard: diag.hardCount, soft: diag.softWeight };
        const r = await st.runEngineAsync(L.autoImprove, () => autoAdjust(st.doc, {}, (p) => setProgress(p)));
        setRunning(false);
        if (!r) return;
        if (r.best.hard === before.hard && r.best.soft === before.soft) setSteady(true);
        else st.act.applyAssignments(r.best.assignments, L.autoImprove, { hard: r.best.hard, soft: r.best.soft });
    };

    if (!hasAssign) {
        return <EmptyGuide icon="sparkles" lines={['아직 배정된 시간표가 없어 점검할 것이 없습니다.', '먼저 자동 배정으로 시간표를 만드세요.']}
            actionLabel="자동 배정으로 가기" actionIcon="sparkles" onAction={() => st.setScreen('generate')} />;
    }

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[14px]">
                    <Mark kind={diag.hardCount > 0 ? 'bad' : 'ok'} />
                    <span className="font-semibold"><Term id="hard">{L.hardViolations}</Term> {diag.hardCount}</span>
                    <span className="text-muted">·</span>
                    <span><Term id="soft">{L.softScore}</Term> {diag.softWeight.toLocaleString()}</span>
                    <Info lines={[
                        '규칙마다 지금 시간표가 어긴 문제 수를 셉니다.',
                        '필수 위반은 성립을 막으니 0이어야 하고, 권장 점수는 낮을수록 좋습니다. 어쩔 수 없는 것은 숨길 수 있습니다.',
                        '행을 누르면 위반 목록이 열리고, 직접 조정 화면으로 건너가 해당 칸이 강조됩니다.',
                    ]} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-[12px] text-muted flex items-center gap-1">
                        <input type="checkbox" checked={fixableOnly} onChange={(e) => setFixableOnly(e.target.checked)} /> {L.fixableOnly}
                    </label>
                    <Button variant="primary" icon="sparkles" onClick={adjust} disabled={running}>{running ? '개선 중…' : L.autoImprove}</Button>
                </div>
            </div>

            {running && progress && (
                <div className="text-[12px] text-muted">개선 중 · {L.hardShort} {progress.hard} · {L.softShort} {progress.soft} · {(progress.elapsedMs / 1000).toFixed(1)}초</div>
            )}
            {steady && (
                <Card className="p-3 border-ok/40 bg-ok/10 text-[13px] flex items-center gap-2">
                    <Mark kind="ok" /> {L.noMoreImprove} 남은 항목은 직접 조정하거나 이대로 확정본으로 지정할 수 있습니다.
                </Card>
            )}

            {rows.length === 0 && (
                <p className="text-[13px] text-muted flex items-center gap-1"><Mark kind="ok" /> 위반이 없습니다.</p>
            )}

            {rows.length > 0 && (
                <div data-tour="diagnose-table" className="overflow-auto">
                    <table className="text-[12px] border-collapse w-full md:min-w-[720px]">
                        <thead>
                            <tr className="text-muted text-left">
                                <th className="border-b border-line px-2 py-1.5 font-medium">규칙</th>
                                <th className="hidden md:table-cell border-b border-line px-2 py-1.5 font-medium">종류</th>
                                <th className="border-b border-line px-2 py-1.5 font-medium">문제</th>
                                <th className="hidden md:table-cell border-b border-line px-2 py-1.5 font-medium">대상</th>
                                <th className="hidden md:table-cell border-b border-line px-2 py-1.5 font-medium">조정할 수 있는 것</th>
                                <th className="border-b border-line px-2 py-1.5 font-medium">점수</th>
                                <th className="hidden md:table-cell border-b border-line px-2 py-1.5 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <RuleRow key={r.ruleId} r={r} open={open === r.ruleId} onToggle={() => setOpen(open === r.ruleId ? null : r.ruleId)} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="pt-2">
                <div className="text-[13px] font-medium mb-1.5">규칙 켜기 / 끄기</div>
                <div className="space-y-1">
                    {st.doc.rules.length === 0 && <p className="text-[12px] text-muted">기본 규칙이 없습니다.</p>}
                    {st.doc.rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 text-[12px] bg-panel border border-line rounded-md px-2 py-1.5">
                            <label className="flex items-center gap-1.5 flex-1">
                                <input type="checkbox" checked={rule.enabled} onChange={() => st.act.toggleRule(rule.id)} />
                                <span className={rule.enabled ? '' : 'text-muted line-through'}>{ruleName(rule)}</span>
                            </label>
                            <button className="text-muted hover:text-text p-1" title="설정" onClick={() => setRuleEdit(rule)}><Icon name="gear" size={14} /></button>
                        </div>
                    ))}
                </div>
            </div>

            {ruleEdit && <RuleParamModal rule={ruleEdit} onClose={() => setRuleEdit(null)} />}
        </div>
    );
}

function RuleRow({ r, open, onToggle }: { r: RuleDiagnosis; open: boolean; onToggle: () => void }) {
    const st = useStore();
    const jump = (v: Violation) => {
        const c = v.cells?.[0];
        const f: EditFocus = { ruleId: r.ruleId };
        if (v.assignmentIds.length > 0) f.assignmentIds = v.assignmentIds;
        if (c?.trackId) { f.view = 'track'; f.trackId = c.trackId; f.dayIndex = c.dayIndex; f.slotIndex = c.slotIndex; }
        else if (v.subject) {
            if (v.subject.kind === 'agent') { f.view = 'agent'; f.agentId = v.subject.id; }
            else if (v.subject.kind === 'resource') { f.view = 'resource'; f.resourceId = v.subject.id; }
            else { f.view = 'track'; f.trackId = v.subject.id; }
        }
        st.jumpToEdit(f);
    };
    return (
        <>
            <tr className="hover:bg-panel2/50 cursor-pointer" onClick={onToggle}>
                <td className="border-b border-line/60 px-2 py-1.5"><span className="inline-flex items-center gap-1"><Icon name={open ? 'dot' : 'left'} size={12} className={open ? '' : 'rotate-180'} />{r.label}</span></td>
                <td className="border-b border-line/60 px-2 py-1.5">
                    {r.kind === 'hard' ? <Pill tone="bad">{L.hardShort}</Pill> : <Pill tone="warn">{L.softShort} · {BUCKET_LABEL[r.bucket ?? ''] ?? '보통'}</Pill>}
                </td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.count}건</td>
                <td className="hidden md:table-cell border-b border-line/60 px-2 py-1.5">{r.subjectCount}</td>
                <td className="hidden md:table-cell border-b border-line/60 px-2 py-1.5">{r.fixableCount}</td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.weight.toLocaleString()}</td>
                <td className="hidden md:table-cell border-b border-line/60 px-2 py-1.5 text-muted">{r.count > 0 && '보기'}</td>
            </tr>
            {open && r.violations.map((v, i) => (
                <tr key={i} className="bg-panel2/30">
                    <td colSpan={3} className="md:hidden border-b border-line/40 px-4 py-1.5">
                        <button className="text-left text-[12px] hover:text-accenth flex items-center gap-1.5" onClick={() => jump(v)}>
                            {v.fixable ? <Mark kind="warn" /> : <Mark kind="unknown" />}
                            <span>{v.message}</span>
                            <span className="text-muted">→ 직접 조정</span>
                        </button>
                    </td>
                    <td colSpan={7} className="hidden md:table-cell border-b border-line/40 px-6 py-1.5">
                        <button className="text-left text-[12px] hover:text-accenth flex items-center gap-1.5" onClick={() => jump(v)}>
                            {v.fixable ? <Mark kind="warn" /> : <Mark kind="unknown" />}
                            <span>{v.message}</span>
                            <span className="text-muted">→ 직접 조정에서 보기</span>
                        </button>
                    </td>
                </tr>
            ))}
        </>
    );
}

function RuleParamModal({ rule, onClose }: { rule: ConflictRule; onClose: () => void }) {
    const st = useStore();
    const tpl = RULES.find((t) => t.id === rule.templateId);
    return (
        <Modal title={`규칙 설정 — ${ruleName(rule)}`} onClose={onClose}>
            {tpl?.description && <p className="text-[12px] text-muted mb-3">{tpl.description}</p>}
            {(!tpl || tpl.params.length === 0) && <p className="text-[13px] text-muted">이 규칙에는 바꿀 설정이 없습니다.</p>}
            <div className="space-y-2">
                {tpl?.params.map((p) => {
                    const val = rule.params[p.key] ?? p.default;
                    const set = (v: ParamValue) => st.act.updateRuleParams(rule.id, { [p.key]: v });
                    return (
                        <label key={p.key} className="block text-[12px]">
                            <span className="text-muted">{p.label}{p.help && <span className="text-muted/60"> — {p.help}</span>}</span>
                            <div className="mt-1">
                                {p.type === 'boolean' ? <input type="checkbox" checked={!!val} onChange={(e) => set(e.target.checked)} />
                                    : p.type === 'select' ? <Select value={String(val)} onChange={set}>{(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                                        : p.type === 'number' ? <TextInput type="number" value={Number(val)} onChange={(e) => set(+e.target.value)} className="w-24" />
                                            : <TextInput value={String(val)} onChange={(e) => set(e.target.value)} />}
                            </div>
                        </label>
                    );
                })}
            </div>
        </Modal>
    );
}
