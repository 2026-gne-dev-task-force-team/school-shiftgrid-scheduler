/**
 * 편성안 점검 결과 → 선생님 말 줄 — 순수 셈(화면·저장을 모른다).
 *   위반은 「어느 반 어느 칸 · 무엇이 겹침」, 시수는 「모자람/넘침」. 이름은 편성 입력(정본에서 읽은 값)에서 찾는다.
 */
import type { SolverInput, PlanEvaluation } from '../timetable-solver/contracts/solver';

export interface PlanRow {
    kind: 'hard' | 'soft' | 'demand';
    text: string;
    /** 어느 칸(들) — 「가반 월 1교시」 꼴. 없으면 빈 배열. */
    where: string[];
}

const DAY_KO = ['월', '화', '수', '목', '금'];
const HOMEROOM = '담임';

/** 한 칸을 말로 — 반 이름 · 요일 · 몇째 시간. 반이 없으면(교사 대상) 선생님 이름. */
function cellText(input: SolverInput, c: { trackId?: string; agentId?: string; dayIndex: number; slotIndex: number }): string {
    const track = input.tracks.find((t) => t.id === c.trackId);
    const agent = input.agents.find((a) => a.id === c.agentId);
    const spec = input.specs.find((s) => s.id === track?.specId) ?? input.specs[0];
    const n = (spec?.slots ?? []).filter((s) => s.assignable && s.index <= c.slotIndex).length;
    const who = track?.name ?? (agent ? `${agent.name} 선생님` : '');
    return [who, DAY_KO[c.dayIndex] ?? '', n > 0 ? `${n}교시` : ''].filter(Boolean).join(' ');
}

export function planRows(input: SolverInput, ev: PlanEvaluation): PlanRow[] {
    const rows: PlanRow[] = ev.violations.map((v) => ({
        kind: v.kind,
        text: v.message,
        where: [...new Set((v.cells ?? []).map((c) => cellText(input, c)))].filter(Boolean),
    }));
    for (const d of ev.demands) {
        if (d.remaining === 0) continue;
        const track = input.tracks.find((t) => t.id === d.trackId)?.name ?? d.trackId;
        const subject = input.activities.find((a) => a.id === d.activityId)?.name ?? d.activityId;
        const teacher = input.agents.find((a) => a.id === d.agentId)?.name;
        const who = teacher ? `${teacher} 선생님` : HOMEROOM;
        const gap = d.remaining > 0 ? `${d.remaining}시간 모자람` : `${-d.remaining}시간 넘침`;
        rows.push({ kind: 'demand', text: `${track} ${subject}(${who}) — 주 ${d.need}시간인데 ${d.placed}시간 편성됨, ${gap}`, where: [] });
    }
    return rows;
}
