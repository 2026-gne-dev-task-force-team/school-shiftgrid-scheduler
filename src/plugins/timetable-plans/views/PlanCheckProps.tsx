/**
 * 편성안 노드의 속성 칸 「규칙 점검」 — 고른 편성안의 필수·권장 위반을 선생님 말로 옆에서 바로 보인다.
 *   🔴 칸은 편성안(주인)이 낸다(contributes.properties · target = PLAN_TYPE).
 *   실시간: plans 약속 subscribe 로 다시 그린다(손으로 옮기기·자동 편성 결과가 노드를 바꾸면 fire) — 새 스토어 ⛔.
 *   셈·글귀는 plan-rows.planRows 하나로(「편성안 점검」 탭과 같은 값) — 베끼지 않는다.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { Badge, EmptyState } from '../../../pane-ui-system';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { Plans, PlanListItem } from '../contracts/plans';
import type { Solver } from '../../timetable-solver/contracts/solver';
import { planRows, type PlanRow } from '../plan-rows';

const MARK = { hard: '❌', soft: '⚠️', demand: '📏' } as const;
const EMPTY: PlanListItem[] = [];
const NO_SUB = () => () => {};

export function PlanCheckProps({ host, target }: PropertiesPaneProps) {
    const plans = host.modules.use<Plans>('plans');
    const solver = host.modules.use<Solver>('solver');
    const snap = () => plans?.listPlans() ?? EMPTY;
    useSyncExternalStore(plans ? plans.subscribe : NO_SUB, snap, snap);   // 안이 바뀌면 다시 셈
    const plan = plans?.getPlan(target.id) ?? null;
    const input = useMemo(() => solver?.readInput() ?? null, [solver]);
    const result = useMemo(() => {
        if (!plan || !input || !solver) return null;
        const ev = solver.evaluate(input, plan.placements);
        return { hard: ev.hard, soft: ev.soft, rows: planRows(input, ev) };
    }, [plan, input, solver]);

    if (!plans || !solver) return <EmptyState compact icon="layers" title="규칙 점검을 쓸 수 없습니다" description="편성안·자동 편성 엔진 플러그인이 켜져 있는지 확인해 주세요." />;
    if (!plan) return null;
    if (!input) return <EmptyState compact icon="ban" title="기초 정보를 읽지 못했습니다" description="교직원·학교·과목·시수표·일과표가 채워져 있는지 확인해 주세요." />;
    const rows = result?.rows ?? [];
    if (rows.length === 0) return <EmptyState compact icon="check" title="위반 없음" description="어긴 규칙도 시수 모자람·넘침도 없습니다." />;
    const problems = rows.filter((r) => r.kind !== 'soft');
    const soft = rows.filter((r) => r.kind === 'soft');
    return (
        <div className="flex flex-col gap-2">
            <p className="text-small text-muted">❌ 필수 {result?.hard ?? 0} · 📏 시수 {problems.length - (result?.hard ?? 0)} · ⚠️ 권장 {result?.soft ?? 0}</p>
            <RowList rows={problems} />
            {soft.length > 0 && <RowList rows={soft} />}
        </div>
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
