/**
 * 인쇄용 시간표 한 장 만들기(순수 셈) — 편성안 하나에서 반별·교사별·교실별 표를 뽑는다. 1.2v 편성기 분해 F11.
 *   🔴 이름은 label(정본에서 읽은 것)로만 — 여기엔 저장하지 않는다.
 */
import type { LabelOf, Placement, Plan, PlanDay } from './types';

export type PrintKind = 'class' | 'teacher' | 'room';
export const PRINT_KINDS: { kind: PrintKind; label: string }[] = [
    { kind: 'class', label: '반별' },
    { kind: 'teacher', label: '교사별' },
    { kind: 'room', label: '교실별' },
];
const DAY_NAME: Record<PlanDay, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

export interface PrintSheet {
    id: string;
    title: string;
    days: { day: PlanDay; name: string }[];
    periods: number[];
    /** periods 와 같은 순서 — 그 교시의 시각 「09:00–09:40」. 일과표를 모르면 필드째 없다(「N교시」만). */
    times?: (string | null)[];
    /** cells[교시 줄][요일 칸] — 빈 칸은 ''. 한 칸에 둘 이상 겹치면 줄바꿈으로 잇는다. */
    cells: string[][];
}

/** 시각을 알려 주는 쪽(일과표 약속 clock)에서 받는 두 함수 — 순수 셈이라 약속 값을 직접 안 본다. */
export interface PrintTimes {
    gradeOf(classId: string): number | undefined;
    timeOf(grade: number, period: number): { start: string; end: string } | null;
}

const rangeText = (t: { start: string; end: string }): string => (t.end ? `${t.start}–${t.end}` : t.start);

function ownerOf(p: Placement, kind: PrintKind): string | undefined {
    return kind === 'class' ? p.classId : kind === 'teacher' ? p.teacherId : p.roomId;
}

function textOf(p: Placement, kind: PrintKind, label: LabelOf): string {
    const room = p.roomId ? ` · ${label('room', p.roomId)}` : '';
    if (kind === 'class') return `${label('subject', p.subjectId)} ${label('teacher', p.teacherId)}${room}`;
    if (kind === 'teacher') return `${label('class', p.classId)} ${label('subject', p.subjectId)}${room}`;
    return `${label('class', p.classId)} ${label('subject', p.subjectId)} ${label('teacher', p.teacherId)}`;
}

/** 대상(반·교사·방) 한 곳의 표. 행·열 틀은 안 전체가 쓴 교시·요일로 맞춰 모든 장이 같은 틀이다. */
export function printSheets(plan: Plan, kind: PrintKind, label: LabelOf, times?: PrintTimes): PrintSheet[] {
    const periods = [...new Set(plan.placements.map((p) => p.period))].sort((a, b) => a - b);
    const days = [...new Set(plan.placements.map((p) => p.day))].sort((a, b) => a - b) as PlanDay[];
    const useDays: PlanDay[] = days.length > 0 ? days : [1, 2, 3, 4, 5];
    const usePeriods = periods.length > 0 ? periods : [1];
    const owners = [...new Set(plan.placements.map((p) => ownerOf(p, kind)).filter((x): x is string => !!x))];
    return owners.map((id) => {
        const cells = usePeriods.map(() => useDays.map(() => [] as string[]));
        for (const p of plan.placements) {
            if (ownerOf(p, kind) !== id) continue;
            cells[usePeriods.indexOf(p.period)][useDays.indexOf(p.day)].push(textOf(p, kind, label));
        }
        // 시각 — 그 장에 나온 반들의 학년 시각이 모두 같을 때만 적는다(학년마다 점심이 달라 다르면 교시만).
        let periodTimes: (string | null)[] | undefined;
        if (times) {
            const grades = new Set<number>();
            for (const p of plan.placements) {
                if (ownerOf(p, kind) !== id) continue;
                const g = times.gradeOf(p.classId);
                if (g !== undefined) grades.add(g);
            }
            periodTimes = usePeriods.map((n) => {
                const texts = new Set([...grades].map((g) => { const t = times.timeOf(g, n); return t ? rangeText(t) : ''; }));
                return grades.size > 0 && texts.size === 1 && !texts.has('') ? [...texts][0] : null;
            });
            if (periodTimes.every((t) => t === null)) periodTimes = undefined;
        }
        return {
            ...(periodTimes ? { times: periodTimes } : {}),
            id, title: label(kind, id), days: useDays.map((d) => ({ day: d, name: DAY_NAME[d] })), periods: usePeriods,
            cells: cells.map((row) => row.map((c) => c.join('\n'))),
        };
    });
}
