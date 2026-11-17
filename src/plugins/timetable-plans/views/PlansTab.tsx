/**
 * 편성안 화면 — 담아 둔 안 목록 · 두 벌 나란히 비교 · 「이 안 고르기」 · 격자로 보내기.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 · 이름은 정본에서 읽는다(labels.ts) — 여기엔 저장하지 않는다.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button, EmptyState } from '../../../pane-ui-system';
import type { V1File } from '../../v1-file/contracts/v1-file';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { comparePlans } from '../model';
import { canonOf, labelFrom } from '../labels';
import { HandMove } from './HandMove';
import { PrintTab } from './PrintTab';
import { PlanCheckProps } from './PlanCheckProps';
import { usePlanEvaluation, violationCount } from './usePlanEvaluation';
import type { Plan } from '../contracts/plans';
import { subscribePlans, getPlanNodes, planOf, choosePlan, sendToGrid, PLAN_TYPE } from '../nodes';

/** 「위반 N건 · 점수」 — 펼친 목록(PlanCheckProps)과 같은 지금 점검(usePlanEvaluation)을 센다. 엔진이 없으면 담아 둔 summary. */
function CheckToggle({ host, plan, open, onToggle }: { host: PluginHost; plan: Plan; open: boolean; onToggle: () => void }) {
    const live = usePlanEvaluation(host, plan.placements);
    const count = live ? violationCount(live.ev) : plan.summary.hardViolations + plan.summary.softViolations;
    const score = live ? live.ev.score : plan.summary.score;
    return (
        <>
            <Button variant="plain" aria-expanded={open} onClick={onToggle}>위반 {count}건</Button>
            <span className="text-muted">{score !== null ? ` · 점수 ${score}` : ''}</span>
        </>
    );
}

export function PlansTab({ host }: { host: PluginHost }) {
    const nodes = useSyncExternalStore(subscribePlans, getPlanNodes, getPlanNodes);
    const [a, setA] = useState<string | null>(null);
    const [b, setB] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);
    const [moving, setMoving] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);
    const [checking, setChecking] = useState<string | null>(null);   // 「위반 N건」을 눌러 목록을 펼친 안

    const diff = useMemo(() => {
        const pa = a ? planOf(a) : null;
        const pb = b ? planOf(b) : null;
        return pa && pb ? comparePlans(pa, pb) : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [a, b, nodes]);

    const v1 = host.modules.use<V1File>('v1-file');
    const exportV1 = v1 ? <div><Button onClick={() => host.commands.run(v1.cmd.open)}>v1 파일로 내보내기</Button></div> : null;

    if (nodes.length === 0) {
        return (
            <div className="h-full overflow-auto p-3 flex flex-col gap-3">
                <EmptyState icon="layers" title="담아 둔 편성안이 없습니다" description="시간표를 짜면 결과가 안 한 벌로 여기에 담깁니다." />
                {exportV1}
            </div>
        );
    }

    if (printing) return <PrintTab host={host} planId={a ?? undefined} onClose={() => setPrinting(false)} />;

    if (moving) return <HandMove host={host} planId={moving} onClose={() => setMoving(null)} />;

    const pick = (id: string) => {
        choosePlan(id);
        const made = sendToGrid(id, labelFrom(canonOf(host)));
        setSent(`반별 시간표 ${made.length}장을 시간표 화면에 만들었습니다.`);
    };

    return (
        <div className="h-full overflow-auto p-3 flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
                {nodes.map((n) => {
                    const p = planOf(n.id);
                    if (!p) return null;
                    return (
                        <li key={n.id} className="flex flex-col gap-1 border-b border-line py-1">
                            <div className="flex items-center gap-2">
                                <span className="flex-1">
                                    {p.chosen ? '✔ ' : ''}{n.name}
                                    <span className="text-muted"> · {new Date(p.madeAt).toLocaleString('ko-KR')} · </span>
                                    <CheckToggle host={host} plan={p} open={checking === n.id} onToggle={() => setChecking(checking === n.id ? null : n.id)} />
                                </span>
                                <Button variant={a === n.id ? 'accent' : 'plain'} onClick={() => setA(n.id)}>왼쪽에 놓기</Button>
                                <Button variant={b === n.id ? 'accent' : 'plain'} onClick={() => setB(n.id)}>오른쪽에 놓기</Button>
                                <Button onClick={() => setMoving(n.id)}>손으로 옮기기</Button>
                                <Button onClick={() => pick(n.id)}>이 안 고르기</Button>
                            </div>
                            {checking === n.id && <section aria-label="위반 목록" className="pl-3"><PlanCheckProps host={host} target={{ type: PLAN_TYPE, id: n.id }} /></section>}
                        </li>
                    );
                })}
            </ul>
            <div><Button onClick={() => setPrinting(true)}>인쇄</Button></div>
            {exportV1}
            {diff && (
                <section aria-label="두 안 비교" className="border border-line rounded p-2">
                    <p>다른 칸 {diff.diffCells}칸 (왼쪽에만 {diff.onlyA} · 오른쪽에만 {diff.onlyB} · 내용이 다름 {diff.changed})</p>
                    <p>위반 — 왼쪽 {diff.violationsA}건 · 오른쪽 {diff.violationsB}건</p>
                </section>
            )}
            {sent && <p role="status">{sent}</p>}
        </div>
    );
}
