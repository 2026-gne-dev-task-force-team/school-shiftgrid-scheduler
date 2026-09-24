/** 진단(배정검색) — 규칙별 문제 수·교사 수·고칠 수 있는 것·벌점. 자동 조정 + 「이만하면 됐다」 정지 신호 */
import { useState } from 'react';
import { useStore, type EditFocus } from '../../store/store';
import { autoAdjust, RULES, type SolveProgress, type RuleDiagnosis } from '../../engine/api';
import type { Violation } from '../../types/schema';
import type { ConflictRule, ParamValue } from '../../types/schema';
import { Button, Card, Pill, Mark, Info, Modal, Select, TextInput } from '../parts/ui';
import { Icon } from '../parts/Icon';

export default function DiagnoseScreen() {
    const st = useStore();
    const diag = st.diag;
    const [fixableOnly, setFixableOnly] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<SolveProgress | null>(null);
    const [steady, setSteady] = useState(false);
    const [ruleEdit, setRuleEdit] = useState<ConflictRule | null>(null);

    const rows = diag.rules.filter((r) => !fixableOnly || r.fixableCount > 0);

    const adjust = async () => {
        setRunning(true); setSteady(false); setProgress(null);
        const before = { hard: diag.hardCount, soft: diag.softWeight };
        const r = await st.runEngineAsync('자동 조정', () => autoAdjust(st.doc, {}, (p) => setProgress(p)));
        setRunning(false);
        if (!r) return;
        if (r.best.hard === before.hard && r.best.soft === before.soft) setSteady(true);
        else st.act.applyAssignments(r.best.assignments, '자동 조정', { hard: r.best.hard, soft: r.best.soft });
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[14px]">
                    <Mark kind={diag.hardCount > 0 ? 'bad' : 'ok'} />
                    <span className="font-semibold">하드 {diag.hardCount}</span>
                    <span className="text-muted">·</span>
                    <span>소프트 벌점 {diag.softWeight.toLocaleString()}</span>
                    <Info lines={[
                        '규칙마다 지금 시간표가 어긴 문제 수를 셉니다.',
                        '하드는 성립을 막으니 0이어야 하고, 소프트는 낮을수록 좋습니다. 어쩔 수 없는 것은 숨길 수 있습니다.',
                        '행을 누르면 위반 목록이 열리고, 편집 화면으로 건너가 해당 칸이 강조됩니다.',
                    ]} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-[12px] text-muted flex items-center gap-1">
                        <input type="checkbox" checked={fixableOnly} onChange={(e) => setFixableOnly(e.target.checked)} /> 고칠 수 있는 것만
                    </label>
                    <Button variant="primary" icon="sparkles" onClick={adjust} disabled={running}>{running ? '조정 중…' : '자동 조정'}</Button>
                </div>
            </div>

            {running && progress && (
                <div className="text-[12px] text-muted">조정 중 · 하드 {progress.hard} · 소프트 {progress.soft} · {(progress.elapsedMs / 1000).toFixed(1)}초</div>
            )}
            {steady && (
                <Card className="p-3 border-ok/40 bg-ok/10 text-[13px] flex items-center gap-2">
                    <Mark kind="ok" /> 이만하면 됐습니다 — 남은 건 손으로 고치거나 이대로 공개해도 됩니다.
                </Card>
            )}

            {rows.length === 0 && (
                <p className="text-[13px] text-muted flex items-center gap-1"><Mark kind="unknown" /> 위반이 없거나, 엔진이 아직 진단을 못 냅니다.</p>
            )}

            {rows.length > 0 && (
                <div className="overflow-auto">
                    <table className="text-[12px] border-collapse w-full min-w-[720px]">
                        <thead>
                            <tr className="text-muted text-left">
                                {['규칙', '종류', '문제', '대상', '고칠 수 있는 것', '벌점', ''].map((h) => (
                                    <th key={h} className="border-b border-line px-2 py-1.5 font-medium">{h}</th>
                                ))}
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
                    {st.doc.rules.length === 0 && <p className="text-[12px] text-muted">기본 규칙이 없습니다. (엔진의 defaultRules 가 연결되면 채워집니다)</p>}
                    {st.doc.rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 text-[12px] bg-panel border border-line rounded-md px-2 py-1.5">
                            <label className="flex items-center gap-1.5 flex-1">
                                <input type="checkbox" checked={rule.enabled} onChange={() => st.act.toggleRule(rule.id)} />
                                <span className={rule.enabled ? '' : 'text-muted line-through'}>{rule.name}</span>
                            </label>
                            <button className="text-muted hover:text-text p-1" title="파라미터" onClick={() => setRuleEdit(rule)}><Icon name="gear" size={14} /></button>
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
                    {r.kind === 'hard' ? <Pill tone="bad">하드</Pill> : <Pill tone="warn">소프트 · {r.bucket ?? '-'}</Pill>}
                </td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.count}건</td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.subjectCount}명</td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.fixableCount}</td>
                <td className="border-b border-line/60 px-2 py-1.5">{r.weight.toLocaleString()}</td>
                <td className="border-b border-line/60 px-2 py-1.5 text-muted">{r.count > 0 && '보기'}</td>
            </tr>
            {open && r.violations.map((v, i) => (
                <tr key={i} className="bg-panel2/30">
                    <td colSpan={7} className="border-b border-line/40 px-6 py-1.5">
                        <button className="text-left text-[12px] hover:text-accenth flex items-center gap-1.5" onClick={() => jump(v)}>
                            {v.fixable ? <Mark kind="warn" /> : <Mark kind="unknown" />}
                            <span>{v.message}</span>
                            <span className="text-muted">→ 편집에서 보기</span>
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
        <Modal title={`규칙 설정 — ${rule.name}`} onClose={onClose}>
            {tpl?.description && <p className="text-[12px] text-muted mb-3">{tpl.description}</p>}
            {(!tpl || tpl.params.length === 0) && <p className="text-[13px] text-muted">이 규칙엔 바꿀 파라미터가 없습니다.</p>}
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
