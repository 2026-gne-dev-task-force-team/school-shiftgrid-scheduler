/**
 * 자동 편성 화면 — 정본에서 입력을 만들고, 막힘이 있으면 편성을 못 누르게 하고, 편성은 worker 로 돌려 편성안으로 담는다.
 *   🔴 편성안 저장은 약속 plans(host.modules.use('plans').savePlan)로만 — 편성안 조각 내부를 모른다.
 *   🔴 정본은 읽기만 한다(다시 저장 ⛔). 누를 때 한 번 더 읽어 그 시점 정본으로 짠다.
 *   createWorker 는 시험이 가짜 worker 를 꽂는 자리(실제 화면은 비워 둔다).
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { SolveProgress } from '../engine/api';
import type { PlanBlocker } from '../contracts/solver';
import type { Plans } from '../../timetable-plans/contracts/plans';
import { buildOfHost, blockersOfHost, stopsOf } from '../BlockersBadge';
import { fixCmdOf, FIX_LABEL } from '../fix-cmd';
import { candidateToPlan } from '../plan-from-solve';
import { startSolve, SolveStopped, type SolveJob, type WorkerFactory } from '../solve-runner';

const PLANS_OFF: PlanBlocker = { code: 'plans-off', level: 'stop', message: '편성안 플러그인이 꺼져 있어 짠 결과를 담을 수 없습니다' };

type Phase =
    | { k: 'idle' }
    | { k: 'running'; progress: SolveProgress | null }
    | { k: 'saved'; name: string; unplaced: number; skipped: number }
    | { k: 'stopped' }
    | { k: 'error'; message: string };

const pad = (n: number) => String(n).padStart(2, '0');
const planName = (d: Date) => `자동 편성 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 막힘 옆 「열기」 — 고칠 화면이 있고 그 꾸러미가 켜져 있을 때만. */
function FixButton({ host, blocker }: { host: PluginHost; blocker: PlanBlocker }) {
    const cmd = blocker.fix ? fixCmdOf(host, blocker.fix) : undefined;
    if (!blocker.fix || !cmd) return null;
    return <Button size="sm" data-testid={`solver-fix-${blocker.code}`} onClick={() => host.commands.run(cmd)}>{FIX_LABEL[blocker.fix]}</Button>;
}

export function SolverTab({ host, createWorker }: { host: PluginHost; createWorker?: WorkerFactory }) {
    const [blockers, setBlockers] = useState<PlanBlocker[]>([]);
    const [phase, setPhase] = useState<Phase>({ k: 'idle' });
    const job = useRef<SolveJob | null>(null);

    useEffect(() => {
        const recount = () => setBlockers([...blockersOfHost(host), ...(host.modules.use<Plans>('plans') ? [] : [PLANS_OFF])]);
        recount();
        const offs = [
            host.modules.use<NodesApi>('nodes')?.subscribe(recount),
            ...(['staff', 'school', 'subjects', 'rooms'] as const).map((n) =>
                host.modules.use<{ onChange(fn: () => void): { dispose(): void } }>(n)?.onChange(recount)),
        ];
        return () => { for (const o of offs) o?.dispose(); job.current?.stop(); };
    }, [host]);

    const stops = stopsOf(blockers);
    const running = phase.k === 'running';

    const start = async () => {
        const plans = host.modules.use<Plans>('plans');
        const built = buildOfHost(host);
        if (!plans || !built || stopsOf(built.blockers).length > 0) return;   // 단추가 막혀 있어 여기 오지 않는다 — 누르는 사이 정본이 바뀐 경우만
        const j = startSolve(built.input, {}, (progress) => setPhase({ k: 'running', progress }), createWorker);
        job.current = j;
        setPhase({ k: 'running', progress: null });
        try {
            const result = await j.done;
            const homeroom = (classId: string) => built.canon.staff.find((s) => s.homeroomClassIds?.includes(classId))?.id;
            const { plan, skipped } = candidateToPlan(built.input, result.best, planName(new Date()), homeroom);
            const id = plans.savePlan(plan);
            if (!id) { setPhase({ k: 'error', message: '편성은 끝났지만 편성안으로 담지 못했습니다' }); return; }
            setPhase({ k: 'saved', name: plan.name, unplaced: result.best.unplaced.reduce((n, u) => n + u.missing, 0), skipped });
        } catch (e) {
            setPhase(e instanceof SolveStopped ? { k: 'stopped' } : { k: 'error', message: e instanceof Error ? e.message : '편성 중 문제가 생겼습니다' });
        } finally { job.current = null; }
    };

    return (
        <div className="h-full overflow-auto p-3 flex flex-col gap-3" data-testid="solver-tab">
            <p>정본(교직원·학교·과목·방·일과표·복무·시수표)을 읽어 시간표를 자동으로 짭니다. 짠 결과는 편성안으로 담깁니다.</p>

            {blockers.length > 0 && (
                <section aria-label="편성 막힘" className="border border-line rounded p-2">
                    <ul className="flex flex-col gap-1">
                        {blockers.map((b) => (
                            <li key={b.code} className={`flex items-center gap-2 ${b.level === 'stop' ? 'text-bad' : 'text-muted'}`}>
                                <span>{b.level === 'stop' ? '막힘 · ' : '참고 · '}{b.message}</span>
                                <FixButton host={host} blocker={b} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button tone="accent" variant="solid" data-testid="solver-start" disabled={stops.length > 0 || running} onClick={() => { void start(); }}>편성 시작</Button>
                {running && <Button data-testid="solver-stop" onClick={() => job.current?.stop()}>멈춤</Button>}
                {stops.length > 0 && <span className="text-muted">막힌 곳을 먼저 풀어 주세요</span>}
            </div>

            {phase.k === 'running' && (
                <div role="status" data-testid="solver-progress" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
                    {phase.progress ? (
                        <>
                            <span className="whitespace-nowrap">{`짜는 중 — 후보 ${phase.progress.candidate}/${phase.progress.of}번째`}</span>
                            <span className="whitespace-nowrap text-muted">{`필수 위반 ${phase.progress.hard}`}</span>
                            <span className="whitespace-nowrap text-muted">{`권장 위반 ${phase.progress.soft}`}</span>
                            <span className="whitespace-nowrap text-muted" data-testid="solver-elapsed">{`경과 ${(phase.progress.elapsedMs / 1000).toFixed(1)}초`}</span>
                        </>
                    ) : <span>짜는 중입니다</span>}
                </div>
            )}
            {phase.k === 'stopped' && <p role="status">편성을 멈췄습니다. 담긴 것은 없습니다.</p>}
            {phase.k === 'error' && <p role="alert" className="text-bad">{phase.message}</p>}
            {phase.k === 'saved' && (
                <section role="status" data-testid="solver-saved" className="flex flex-col gap-1">
                    <p>「{phase.name}」으로 담았습니다.{phase.unplaced > 0 ? ` 못 채운 시수가 ${phase.unplaced}시간 있습니다.` : ''}{phase.skipped > 0 ? ` 선생님을 몰라 빠진 칸이 ${phase.skipped}칸 있습니다.` : ''}</p>
                    <div><Button data-testid="solver-open-plans" onClick={() => { const p = host.modules.use<Plans>('plans'); if (p) host.commands.run(p.cmd.open); }}>편성안에서 보기</Button></div>
                </section>
            )}
        </div>
    );
}
