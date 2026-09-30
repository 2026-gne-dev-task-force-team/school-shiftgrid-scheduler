/** 자동 배정 — 사전 점검 → [자동 배정 시작] → 진행 표시 → 후보 카드 K장 → [이 후보로 진행] */
import { useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { solve, checkCapacity, type SolveResult, type SolveProgress, type SolveCandidate, type CapacityIssue } from '../../engine/api';
import type { Assignment, TimetableSpec } from '../../types/schema';
import { activeDays, assignableSlots } from '../lib';
import { Button, Card, Field, TextInput, Pill, Info, Mark, EmptyGuide } from '../parts/ui';
import { L } from '../help/terms';
import { RICH } from '../help/richContent';
import { Term } from '../help/Term';

export default function GenerateScreen() {
    const st = useStore();
    const [candidates, setCandidates] = useState(4);
    const [budgetSec, setBudgetSec] = useState(2);
    const [keepPinned, setKeepPinned] = useState(true);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<SolveProgress | null>(null);
    const [result, setResult] = useState<SolveResult | null>(null);

    const refSpec = st.doc.specs.slice().sort((a, b) => b.slots.length - a.slots.length)[0];

    const issues = useMemo<CapacityIssue[]>(() => {
        try { return checkCapacity(st.doc); } catch { return []; }
    }, [st.doc]);

    const run = async () => {
        setRunning(true); setResult(null); setProgress(null);
        const r = await st.runEngineAsync(L.run, () =>
            solve(st.doc, { candidates, budgetMs: budgetSec * 1000, keepPinned }, (p) => setProgress(p)));
        setRunning(false);
        if (r) setResult(r);
    };

    const apply = (c: SolveCandidate) => {
        st.act.applyAssignments(c.assignments, `${L.screen.generate} (${c.label})`, { hard: c.hard, soft: c.soft });
        st.setScreen('diagnose');
    };

    // 전제가 빠졌으면 빈 화면 안내
    if (st.doc.specs.length === 0) {
        return <EmptyGuide icon="table" lines={['시간 틀이 없어 자동 배정을 할 수 없습니다.', '먼저 기초자료에서 시간 틀을 만드세요.']}
            actionLabel="기초자료로 가기" actionIcon="table" onAction={() => st.setScreen('basic')} />;
    }
    if (st.doc.demands.length === 0) {
        return <EmptyGuide icon="table" lines={['시수표가 비어 있어 배정할 수업이 없습니다.', '기초자료의 시수표를 먼저 채우세요.']}
            actionLabel="시수표 채우기" actionIcon="table" onAction={() => st.setScreen('basic')} />;
    }

    return (
        <div className="p-4 space-y-4 max-w-4xl">
            {/* 사전 점검 — 못 푸는 시수표를 미리 알린다 (실행은 막지 않는다) */}
            {issues.length > 0 && (
                <Card className="p-3 border-warn/50 bg-warn/10">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2">
                        <Mark kind="warn" /> 이 시수표는 그대로는 풀리지 않을 수 있습니다
                    </div>
                    <ul className="space-y-1 text-[12.5px] text-muted">
                        {issues.map((it, i) => <li key={i}>· {it.message}</li>)}
                    </ul>
                    <div className="mt-2">
                        <Button variant="ghost" icon="table" onClick={() => st.setScreen('basic')}>기초자료로 가기</Button>
                    </div>
                </Card>
            )}

            <Card className="p-3">
                <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2">
                    {L.screen.generate}
                    <Info help={RICH.generate} />
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                    <Field label={L.candidateCount}><TextInput type="number" value={candidates} onChange={(e) => setCandidates(+e.target.value)} className="w-16" /></Field>
                    <Field label={L.budgetSec}><TextInput type="number" value={budgetSec} onChange={(e) => setBudgetSec(+e.target.value)} className="w-16" /></Field>
                    <label className="text-[12px] text-muted flex items-center gap-1 pb-1.5">
                        <input type="checkbox" checked={keepPinned} onChange={(e) => setKeepPinned(e.target.checked)} /> {L.keepPinned}
                    </label>
                    <Button data-tour="generate-run" variant="primary" icon="sparkles" onClick={run} disabled={running}>{running ? L.running : L.run}</Button>
                </div>
                {running && progress && (
                    <div className="mt-3 text-[12px] text-muted flex items-center gap-4">
                        <span>{L.candidates} {progress.candidate}/{progress.of}</span>
                        <span>{L.hardShort} {progress.hard}</span>
                        <span>{L.softShort} {progress.soft}</span>
                        <span>{(progress.elapsedMs / 1000).toFixed(1)}초</span>
                    </div>
                )}
                {running && !progress && <div className="mt-3 text-[12px] text-muted">배정을 준비하는 중…</div>}
            </Card>

            {result && (
                <div>
                    <div className="text-[13px] text-muted mb-2">
                        후보 {result.candidates.length}장을 {(result.elapsedMs / 1000).toFixed(1)}초에 만들었습니다. 하나를 고르면 <Term id="board">자동 보관 시안</Term>을 남기고 적용합니다.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {result.candidates.map((c, i) => (
                            <Card key={i} className={`p-3 ${c === result.best ? 'border-accent/60' : ''}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-medium text-[13px]">{c.label}</span>
                                    {c === result.best && <Pill tone="accent">{L.recommended}</Pill>}
                                    <div className="ml-auto flex items-center gap-1.5 text-[12px]">
                                        <Pill tone={c.hard > 0 ? 'bad' : 'ok'}>{L.hardShort} {c.hard}</Pill>
                                        <Pill tone="warn">{L.softShort} {c.soft}</Pill>
                                    </div>
                                </div>
                                <MiniGrid assignments={c.assignments} spec={refSpec} />
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[12px] text-muted">
                                        {L.unplaced} {c.unplaced.reduce((s, u) => s + u.missing, 0)}시간
                                    </span>
                                    <Button variant="primary" icon="check" onClick={() => apply(c)}>{L.useThis}</Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {!result && !running && (
                <p className="text-[13px] text-muted flex items-center gap-1"><Mark kind="unknown" /> 아직 배정하지 않았습니다. 위 「{L.run}」을 누르면 후보가 만들어집니다.</p>
            )}
        </div>
    );
}

/** 후보의 미니 격자 — 요일×교시 칸에 배정이 있으면 칠한다 (인라인 SVG · 색은 테마 변수) */
function MiniGrid({ assignments, spec }: { assignments: Assignment[]; spec: TimetableSpec | undefined }) {
    if (!spec) return <div className="text-[11px] text-muted">시간 틀이 없어 미리보기를 못 그립니다.</div>;
    const days = activeDays(spec);
    const slots = assignableSlots(spec);
    const cw = 14, ch = 10, gap = 2;
    const filled = new Set<string>();
    for (const a of assignments) filled.add(`${a.dayIndex}:${a.slotIndex}`);
    const w = days.length * (cw + gap), h = slots.length * (ch + gap);
    return (
        <svg width={w} height={h} className="block">
            {days.map((d, di) => slots.map((sl, si) => {
                const on = filled.has(`${d}:${sl.index}`);
                return <rect key={`${d}-${sl.index}`} x={di * (cw + gap)} y={si * (ch + gap)} width={cw} height={ch} rx={1.5}
                    fill={on ? 'rgb(var(--c-accent))' : 'rgb(var(--c-line))'} />;
            }))}
        </svg>
    );
}
