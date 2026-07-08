/**
 * 로직 레이어 — 저장 모델(schema)에서 화면·검증에 필요한 것을 '계산'해낸다.
 * (derived.ts가 모양이라면, 여기는 그 모양을 실제로 만들어내는 계산.)
 */
import type {
    Agent, Activity, Resource, Track, Assignment, Blackout,
    ConflictRule, Conflict, ScheduleView, TimetableSpec, Timetable,
} from '../types/schema';
import { templateById } from '../rules/templates';

export interface Doc {
    agents: Agent[];
    activities: Activity[];
    resources: Resource[];
    specs: TimetableSpec[];
    tracks: Track[];
    timetables: Timetable[];
    assignments: Assignment[];
    blackouts: Blackout[];
    rules: ConflictRule[];
}

/** 배열을 id→객체 맵으로 */
export const indexBy = <T extends { id: string }>(xs: readonly T[]): Map<string, T> =>
    new Map(xs.map((x) => [x.id, x]));

/** 한 칸(학반·요일·교시)을 가리키는 열쇠 */
export const cellKey = (trackId: string, dayIndex: number, slotIndex: number) =>
    `${trackId}:${dayIndex}:${slotIndex}`;

/** 학반이 쓰는 규격을 찾는다 (데모: track.attr.specId 연결) */
export function specOfTrack(doc: Doc, track: Track): TimetableSpec | undefined {
    return doc.specs.find((s) => s.id === track.attr?.specId);
}

/** (학반 → 요일:교시 → 그 칸의 배치) 빠른 조회표 */
export function assignmentsByCell(doc: Doc): Map<string, Assignment> {
    const map = new Map<string, Assignment>();
    for (const a of doc.assignments) map.set(cellKey(a.trackId, a.dayIndex, a.slotIndex), a);
    return map;
}

/** 규칙들을 돌려 충돌 목록을 계산한다 (켜진 규칙만). 저장하지 않고 그때그때 만든다. */
export function runValidation(doc: Doc): Conflict[] {
    const view: ScheduleView = {
        // 규칙은 전 학반을 아울러 검사하므로(시설·교사 중복은 반을 넘나든다) 전체 배치를 넘긴다.
        timetable: doc.timetables[0],
        spec: doc.specs[0],
        assignments: doc.assignments,
        tracks: doc.tracks,
        agents: doc.agents,
        resources: doc.resources,
        activities: doc.activities,
        blackouts: doc.blackouts,
    };

    const conflicts: Conflict[] = [];
    for (const rule of doc.rules) {
        if (!rule.enabled) continue;
        const template = templateById(rule.templateId);
        if (!template) continue;
        for (const group of template.detect(rule.params, view)) {
            conflicts.push({
                ruleId: rule.id,
                message: rule.message || template.defaultMessage,
                assignmentIds: group,
                severity: template.defaultSeverity,
            });
        }
    }
    return conflicts;
}

/** 색은 표시용이라 attr.color에서 꺼낸다 (없으면 회색) */
export const colorOf = (e?: { attr?: Record<string, unknown> }): string =>
    (e?.attr?.color as string) ?? '#94A3B8';
