/**
 * 손으로 옮기기 — 편성안 하나를 열어 칸을 골라 옮기거나 서로 바꾼다.
 *   ① 칸을 고르면 갈 수 있는 칸이 색으로 보인다 ② 가려는 칸을 고르면 생기는 충돌을 말로 미리 보여 준다
 *   ③ 칸 고정·잠금·임시 잠금 ④ 되돌리기 한 단계. 판정은 자동 편성 엔진(약속 solver)이 하고, 바뀌는 건 이 편성안의 배치뿐이다.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button, EmptyState } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Solver } from '../../timetable-solver/contracts/solver';
import { canonOf, labelFrom } from '../labels';
import { cellText, classesOf } from '../model';
import { subscribePlans, getPlanNodes, planOf, replacePlan } from '../nodes';
import {
    buildHandDoc, candidates, preview, moveInPlan, toggleLock, placementKey, VERDICT_TEXT,
    type LockKind, type Verdict,
} from '../hand-move';
import type { Plan, PlanDay } from '../types';

const DAY_NAME: Record<number, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };
const VERDICT_CLASS: Record<Verdict, string> = {
    ok: 'border-ok', soft: 'border-warn', hard: 'border-bad', occupied: 'border-bad', blocked: 'border-muted', self: 'border-accent',
};
const LOCKS: { kind: LockKind; label: string }[] = [
    { kind: 'fixed', label: '고정 수업으로 두기' },
    { kind: 'pinned', label: '잠그기' },
    { kind: 'temp', label: '임시 잠금' },
];

export function HandMove({ host, planId, onClose }: { host: PluginHost; planId: string; onClose: () => void }) {
    useSyncExternalStore(subscribePlans, getPlanNodes, getPlanNodes);
    const plan = planOf(planId);
    const solver = host.modules.use<Solver>('solver');
    const input = useMemo(() => solver?.readInput(host) ?? null, [solver, host]);
    const [classId, setClassId] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [target, setTarget] = useState<{ day: PlanDay; period: number } | null>(null);
    const [undo, setUndo] = useState<Plan | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    if (!plan) return <EmptyState icon="layers" title="편성안을 찾을 수 없습니다" description="지워졌거나 휴지통에 있습니다." />;
    if (!solver || !input) {
        return (
            <div className="p-3 flex flex-col gap-2">
                <p role="status">자동 편성 엔진이나 정본(교직원·학교·과목·시수표·일과표)을 읽지 못해 손으로 옮길 수 없습니다. 플러그인이 켜져 있는지 확인해 주세요.</p>
                <Button onClick={onClose}>돌아가기</Button>
            </div>
        );
    }

    const label = labelFrom(canonOf(host));
    const classes = classesOf(plan);
    const cls = classId && classes.includes(classId) ? classId : classes[0];
    const hand = buildHandDoc(solver, input, plan);
    const cand = picked ? candidates(hand, picked) : null;
    const pv = picked && target ? preview(hand, picked, target) : null;
    const days = [...new Set([1, 2, 3, 4, 5, ...plan.placements.map((p) => p.day)])].sort() as PlanDay[];
    const periods = Math.max(1, ...plan.placements.map((p) => p.period));
    const at = (day: PlanDay, period: number) => plan.placements.find((p) => p.classId === cls && p.day === day && p.period === period);
    const pickedPl = picked ? plan.placements.find((p) => placementKey(p) === picked) : undefined;

    const save = (next: Plan, done: string) => {
        if (!replacePlan(planId, next)) { setMsg('저장하지 못했습니다.'); return; }
        setUndo(plan); setPicked(null); setTarget(null); setMsg(done);
    };
    const click = (day: PlanDay, period: number) => {
        const key = `${cls}|${day}|${period}`;
        if (picked && picked !== key && cand?.has(key)) { setTarget({ day, period }); return; }
        setTarget(null);
        setPicked(at(day, period) ? key : null);
        setMsg(null);
    };
    const doMove = () => {
        if (!picked || !target) return;
        const next = moveInPlan(hand, picked, target);
        if (next) save(next, pv?.swapWith ? '두 칸을 서로 바꿨습니다.' : '칸을 옮겼습니다.');
    };

    return (
        <div className="h-full overflow-auto p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <strong className="flex-1">{plan.name} — 손으로 옮기기</strong>
                <Button onClick={() => undo && save(undo, '한 단계 되돌렸습니다.')} disabled={!undo}>되돌리기</Button>
                <Button onClick={onClose}>돌아가기</Button>
            </div>
            <div className="flex gap-1 flex-wrap" role="group" aria-label="반 고르기">
                {classes.map((c) => (
                    <Button key={c} variant={c === cls ? 'accent' : 'plain'} onClick={() => { setClassId(c); setPicked(null); setTarget(null); }}>{label('class', c)}</Button>
                ))}
            </div>
            <p className="text-muted">옮길 수업 칸을 누르면 갈 수 있는 칸이 색으로 보입니다. 초록 테두리는 옮길 수 있는 칸, 노랑은 아쉬운 점이 있는 칸, 빨강은 규칙을 어기는 칸입니다.</p>
            <table className="border-collapse" aria-label="시간표">
                <thead><tr><th />{days.map((d) => <th key={d} className="p-1">{DAY_NAME[d]}</th>)}</tr></thead>
                <tbody>
                    {Array.from({ length: periods }, (_, i) => i + 1).map((period) => (
                        <tr key={period}>
                            <th className="p-1">{period}교시</th>
                            {days.map((day) => {
                                const p = at(day, period);
                                const key = `${cls}|${day}|${period}`;
                                const info = cand?.get(key);
                                const marks = p ? `${p.fixed ? ' [고정]' : ''}${p.pinned ? ' [잠금]' : ''}${p.temp ? ' [임시]' : ''}` : '';
                                return (
                                    <td key={day} className="p-0.5">
                                        <Button
                                            variant="ghost"
                                            className={`w-full min-w-24 min-h-10 border-2 rounded p-1 text-left ${info ? VERDICT_CLASS[info.verdict] : 'border-line'} ${picked === key ? 'bg-accent' : ''}`}
                                            title={info ? `${VERDICT_TEXT[info.verdict]}${info.reasons.length ? ` — ${info.reasons.join(' · ')}` : ''}` : undefined}
                                            aria-label={`${DAY_NAME[day]}요일 ${period}교시 ${p ? cellText(p, label) : '빈 칸'}${marks}${info ? ` · ${VERDICT_TEXT[info.verdict]}` : ''}`}
                                            onClick={() => click(day, period)}
                                        >
                                            {p ? `${cellText(p, label)}${marks}` : ''}
                                        </Button>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {pickedPl && (
                <section aria-label="고른 칸" className="border border-line rounded p-2 flex flex-col gap-2">
                    <p>고른 칸: {DAY_NAME[pickedPl.day]}요일 {pickedPl.period}교시 · {cellText(pickedPl, label)}</p>
                    <div className="flex gap-1 flex-wrap">
                        {LOCKS.map((l) => (
                            <Button key={l.kind} variant={pickedPl[l.kind] ? 'accent' : 'plain'}
                                onClick={() => save(toggleLock(plan, picked!, l.kind), pickedPl[l.kind] ? '잠금을 풀었습니다.' : '잠갔습니다.')}>
                                {pickedPl[l.kind] ? `${l.label} 풀기` : l.label}
                            </Button>
                        ))}
                    </div>
                </section>
            )}
            {pv && target && (
                <section aria-label="옮기기 미리보기" className="border border-line rounded p-2 flex flex-col gap-1">
                    <p>{DAY_NAME[target.day]}요일 {target.period}교시로 {pv.swapWith ? `옮기면 그 자리의 ${cellText(pv.swapWith, label)} 수업과 서로 바뀝니다.` : '옮깁니다.'}</p>
                    {pv.reasons.length > 0 && <p className="text-bad">안 되는 까닭: {pv.reasons.join(' / ')}</p>}
                    {pv.worse.length > 0 && <p className="text-warn">아쉬워지는 점: {pv.worse.join(' · ')}</p>}
                    {pv.better.length > 0 && <p className="text-ok">나아지는 점: {pv.better.join(' · ')}</p>}
                    {pv.canMove && pv.reasons.length === 0 && pv.worse.length === 0 && <p className="text-ok">겹치는 곳이 없습니다.</p>}
                    <div><Button onClick={doMove} disabled={!pv.canMove}>{pv.swapWith ? '서로 바꾸기' : '옮기기'}</Button></div>
                </section>
            )}
            {msg && <p role="status">{msg}</p>}
        </div>
    );
}
