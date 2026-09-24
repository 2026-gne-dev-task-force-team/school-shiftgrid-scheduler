/** 생성 — [자동 배정] → 진행 표시 → 후보 카드 K장 → [이 후보로] 적용(자동 스냅샷) */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { solve, type SolveResult, type SolveProgress, type SolveCandidate } from '../../engine/api';
import type { Assignment, TimetableSpec } from '../../types/schema';
import { activeDays, assignableSlots } from '../lib';
import { Button, Card, Field, TextInput, Pill, Info, Mark } from '../parts/ui';

export default function GenerateScreen() {
    const st = useStore();
    const [candidates, setCandidates] = useState(4);
    const [budgetSec, setBudgetSec] = useState(2);
    const [keepPinned, setKeepPinned] = useState(true);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<SolveProgress | null>(null);
    const [result, setResult] = useState<SolveResult | null>(null);

    const refSpec = st.doc.specs.slice().sort((a, b) => b.slots.length - a.slots.length)[0];

    const run = async () => {
        setRunning(true); setResult(null); setProgress(null);
        const r = await st.runEngineAsync('자동 배정', () =>
            solve(st.doc, { candidates, budgetMs: budgetSec * 1000, keepPinned }, (p) => setProgress(p)));
        setRunning(false);
        if (r) setResult(r);
    };

    const apply = (c: SolveCandidate) => {
        st.act.applyAssignments(c.assignments, `자동 배정 (${c.label})`, { hard: c.hard, soft: c.soft });
        st.setScreen('diagnose');
    };

    return (
        <div className="p-4 space-y-4 max-w-4xl">
            <Card className="p-3">
                <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2">
                    자동 배정
                    <Info lines={[
                        '후보 여러 개를 만들어 그중 하나를 사람이 고릅니다 (기계가 정하지 않습니다).',
                        '하드가 0인 후보가 성립하는 시간표입니다. 소프트는 낮을수록 좋습니다.',
                        '자동 조정(지금 배치를 유지하며 위반만 줄이기)은 「진단」 화면에 있습니다.',
                    ]} />
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                    <Field label="후보 수"><TextInput type="number" value={candidates} onChange={(e) => setCandidates(+e.target.value)} className="w-16" /></Field>
                    <Field label="후보당 예산(초)"><TextInput type="number" value={budgetSec} onChange={(e) => setBudgetSec(+e.target.value)} className="w-16" /></Field>
                    <label className="text-[12px] text-muted flex items-center gap-1 pb-1.5">
                        <input type="checkbox" checked={keepPinned} onChange={(e) => setKeepPinned(e.target.checked)} /> 이동금지 유지
                    </label>
                    <Button variant="primary" icon="sparkles" onClick={run} disabled={running}>{running ? '배정 중…' : '자동 배정'}</Button>
                </div>
                {running && progress && (
                    <div className="mt-3 text-[12px] text-muted flex items-center gap-4">
                        <span>후보 {progress.candidate}/{progress.of}</span>
                        <span>하드 {progress.hard}</span>
                        <span>소프트 {progress.soft}</span>
                        <span>{(progress.elapsedMs / 1000).toFixed(1)}초</span>
                    </div>
                )}
                {running && !progress && <div className="mt-3 text-[12px] text-muted">엔진을 부르는 중…</div>}
            </Card>

            {result && (
                <div>
                    <div className="text-[13px] text-muted mb-2">후보 {result.candidates.length}장 · {(result.elapsedMs / 1000).toFixed(1)}초. 하나를 고르면 자동 스냅샷을 남기고 적용합니다.</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {result.candidates.map((c, i) => (
                            <Card key={i} className={`p-3 ${c === result.best ? 'border-accent/60' : ''}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-medium text-[13px]">{c.label}</span>
                                    {c === result.best && <Pill tone="accent">종합 1위</Pill>}
                                    <div className="ml-auto flex items-center gap-1.5 text-[12px]">
                                        <Pill tone={c.hard > 0 ? 'bad' : 'ok'}>하드 {c.hard}</Pill>
                                        <Pill tone="warn">소프트 {c.soft}</Pill>
                                    </div>
                                </div>
                                <MiniGrid assignments={c.assignments} spec={refSpec} />
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[12px] text-muted">
                                        미배정 {c.unplaced.reduce((s, u) => s + u.missing, 0)}시간
                                    </span>
                                    <Button variant="primary" icon="check" onClick={() => apply(c)}>이 후보로</Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {!result && !running && (
                <p className="text-[13px] text-muted flex items-center gap-1"><Mark kind="unknown" /> 아직 배정하지 않았습니다. 위 「자동 배정」을 누르면 후보가 만들어집니다.</p>
            )}
        </div>
    );
}

/** 후보의 미니 격자 — 요일×교시 칸에 배정이 있으면 칠한다 (인라인 SVG) */
function MiniGrid({ assignments, spec }: { assignments: Assignment[]; spec: TimetableSpec | undefined }) {
    if (!spec) return <div className="text-[11px] text-muted">규격이 없어 미리보기를 못 그립니다.</div>;
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
                    fill={on ? '#2b6cb0' : '#243041'} />;
            }))}
        </svg>
    );
}
