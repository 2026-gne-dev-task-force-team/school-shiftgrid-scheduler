/**
 * 편성안 순수 셈 — 만들기 · 두 벌 비교 · 격자 글자 칸으로 풀기. 저장·화면을 모른다.
 */
import type { SheetTextData } from '../timetable-grid/contracts/sheet-text';
import type { LabelOf, Placement, Plan, PlanDay, PlanSummary } from './types';

const slot = (p: Placement): string => `${p.classId}|${p.day}|${p.period}`;
const body = (p: Placement): string => `${p.subjectId}|${p.teacherId}|${p.roomId ?? ''}`;

export const EMPTY_SUMMARY: PlanSummary = { score: null, hardViolations: 0, softViolations: 0 };

/** 새 편성안 — 같은 칸(반·요일·시간)에 두 번 들어온 배치는 뒤엣것만 남긴다. */
export function makePlan(name: string, placements: readonly Placement[], summary: PlanSummary = EMPTY_SUMMARY, now: Date = new Date()): Plan {
    const bySlot = new Map<string, Placement>();
    for (const p of placements) bySlot.set(slot(p), { ...p });
    return { name, madeAt: now.toISOString(), placements: [...bySlot.values()], summary: { ...summary } };
}

export interface PlanDiff {
    /** 다른 칸 수 = 한쪽에만 있거나 내용이 다른 칸. */
    diffCells: number;
    onlyA: number;
    onlyB: number;
    changed: number;
    /** 다른 칸의 열쇠(반|요일|시간) — 화면이 표시한다. */
    keys: string[];
    violationsA: number;
    violationsB: number;
}

const violations = (s: PlanSummary): number => s.hardViolations + s.softViolations;

/** 두 벌 나란히 비교 — 다른 칸 수와 위반 수. */
export function comparePlans(a: Plan, b: Plan): PlanDiff {
    const ma = new Map(a.placements.map((p) => [slot(p), body(p)]));
    const mb = new Map(b.placements.map((p) => [slot(p), body(p)]));
    let onlyA = 0, onlyB = 0, changed = 0;
    const keys: string[] = [];
    for (const [k, v] of ma) {
        const w = mb.get(k);
        if (w === undefined) { onlyA++; keys.push(k); } else if (w !== v) { changed++; keys.push(k); }
    }
    for (const k of mb.keys()) if (!ma.has(k)) { onlyB++; keys.push(k); }
    return { diffCells: onlyA + onlyB + changed, onlyA, onlyB, changed, keys, violationsA: violations(a.summary), violationsB: violations(b.summary) };
}

/** 배치에 나오는 반 id(처음 나온 차례). */
export function classesOf(plan: Plan): string[] {
    return [...new Set(plan.placements.map((p) => p.classId))];
}

/** 칸 열쇠 — 격자 cellKey(col,row) 와 같은 약속(시험이 맞춰 본다). */
const gridKey = (col: number, row: number): string => `c${col}r${row}`;

/** 칸 글자 — 「과목 교사 · 방」. 이름은 정본에서 읽은 것(저장하지 않는다). */
export function cellText(p: Placement, label: LabelOf): string {
    const main = `${label('subject', p.subjectId)} ${label('teacher', p.teacherId)}`;
    return p.roomId ? `${main} · ${label('room', p.roomId)}` : main;
}

/**
 * 고른 안의 한 반을 격자 시간표 자료(글자 칸)로 푼다. 행·열은 안 전체의 쓰인 시간·요일로 정해
 *   반마다 같은 틀이 된다. 시각은 50분 수업+10분 쉼으로 9시부터 깔아 둔 기본값(고치면 격자 속성에서).
 */
export function planToGridData(plan: Plan, classId: string, label: LabelOf): SheetTextData {
    const periods = [...new Set(plan.placements.map((p) => p.period))].sort((x, y) => x - y);
    const days = [...new Set(plan.placements.map((p) => p.day))].sort((x, y) => x - y) as PlanDay[];
    const useDays: PlanDay[] = days.length > 0 ? days : [1, 2, 3, 4, 5];
    const rows = (periods.length > 0 ? periods : [1]).map((n) => ({
        id: `p${n}`, name: `${n}교시`, range: { start: 540 + (n - 1) * 60, end: 540 + (n - 1) * 60 + 50 },
    }));
    const cells: SheetTextData['cells'] = {};
    for (const p of plan.placements) {
        if (p.classId !== classId) continue;
        const col = useDays.indexOf(p.day);
        const row = rows.findIndex((r) => r.id === `p${p.period}`);
        if (col < 0 || row < 0) continue;
        cells[gridKey(col, row)] = { text: cellText(p, label) };
    }
    return { range: { kind: 'period', start: '', end: '' }, columns: { kind: 'weekday', days: useDays }, rows, cells };
}
