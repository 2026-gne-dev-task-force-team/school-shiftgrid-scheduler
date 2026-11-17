import { useMemo, useState, useSyncExternalStore } from 'react';
import { Badge, EmptyState, Select } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Plans, PlanListItem } from '../timetable-plans/contracts/plans';
import type { Solver } from '../timetable-solver/contracts/solver';
import type { PlanRow } from '../timetable-plans/contracts/plans';
import type { PlanEvaluation } from '../timetable-solver/contracts/solver';

const MARK = { hard: '❌', soft: '⚠️', demand: '📏' } as const;
const EMPTY: PlanListItem[] = [];
const NO_SUB = () => () => {};

/** 「편성안 점검」 탭 — 편성안을 골라 위반을 선생님 말로. 약속 plans(읽기)·solver(evaluate · readInput)로만 읽는다. */
export function PlanCheck({ host }: { host: PluginHost }) {
    const plans = host.modules.use<Plans>('plans');
    const solver = host.modules.use<Solver>('solver');
    const snap = () => plans?.listPlans() ?? EMPTY;
    const list = useSyncExternalStore(plans ? plans.subscribe : NO_SUB, snap, snap);
    const [picked, setPicked] = useState('');
    const input = useMemo(() => solver?.readInput() ?? null, [solver]);
    const id = list.some((p) => p.id === picked) ? picked : (list.find((p) => p.chosen) ?? list[0])?.id ?? '';
    const plan = id ? plans?.getPlan(id) ?? null : null;
    const result = useMemo(() => {
        if (!plan || !input || !solver) return null;
        const ev = solver.evaluate(input, plan.placements);
        return { ev, rows: plans?.planRows(input, ev) ?? [] };
    }, [plan, input, solver]);

    if (!plans || !solver) return <EmptyState icon="layers" title="편성안 점검을 쓸 수 없습니다" description="편성안·자동 편성 엔진 플러그인이 켜져 있는지 확인해 주세요." />;
    if (list.length === 0) return <EmptyState icon="layers" title="점검할 편성안이 없습니다" description="자동 편성에서 안을 만들면 여기서 점검할 수 있습니다." />;
    if (!input) return <EmptyState icon="ban" title="기초 정보를 읽지 못했습니다" description="교직원·학교·과목·시수표·일과표가 채워져 있는지 확인해 주세요." />;
    return (
        <div className="flex flex-col gap-3">
            <Select
                label="점검할 편성안" value={id} onChange={(e) => setPicked(e.target.value)}
                options={list.map((p) => ({ value: p.id, label: p.chosen ? `${p.name} (고른 안)` : p.name }))}
            />
            {result && <PlanResult ev={result.ev} rows={result.rows} />}
        </div>
    );
}

/** 결과 — 필수 위반·시수 문제가 없으면 「문제 없음」(권장 규칙의 아쉬운 점은 있어도 아래에 따로 보인다). */
function PlanResult({ ev, rows }: { ev: PlanEvaluation; rows: PlanRow[] }) {
    const problems = rows.filter((r) => r.kind !== 'soft');
    const soft = rows.filter((r) => r.kind === 'soft');
    return (
        <>
            {problems.length === 0
                ? <p className="text-small" role="status">✅ 문제 없음 — 어긴 필수 규칙도 시수 모자람·넘침도 없습니다. (점수 {ev.score})</p>
                : <p className="text-small text-muted">❌ 필수 {ev.hard} · 시수 {problems.length - ev.hard} · ⚠️ 권장 {ev.soft} · 점수 {ev.score}</p>}
            <RowList rows={problems} />
            {soft.length > 0 && <><p className="text-small text-muted">되도록 지킬 규칙 {soft.length}건</p><RowList rows={soft} /></>}
        </>
    );
}

function RowList({ rows }: { rows: PlanRow[] }) {
    if (rows.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1">
            {rows.map((r, k) => (
                <li key={k} className="text-small flex items-baseline gap-2">
                    <span>{MARK[r.kind]}</span>
                    <span>{r.text}</span>
                    {r.where.map((w) => <Badge key={w} tone="neutral">{w}</Badge>)}
                </li>
            ))}
        </ul>
    );
}
