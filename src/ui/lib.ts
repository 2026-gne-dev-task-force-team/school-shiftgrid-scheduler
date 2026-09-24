/**
 * 화면 공용 순수 헬퍼 — 엔진을 부르지 않는 조회·표시용 계산만.
 * ⚠️ 겹침·규칙 판정은 엔진(api.ts) 몫이다. 여기는 '그리기'에 필요한 것만.
 */
import type { Doc } from '../types/doc';
import type { Agent, Activity, Resource, Track, Assignment, Slot, TimetableSpec } from '../types/schema';

export const DAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];
export function dayName(spec: TimetableSpec | undefined, d: number): string {
    if (spec && spec.cycleDays !== 7) return `${d + 1}일차`;
    return `${DAY_LABEL[d] ?? d + 1}`;
}

export function indexBy<T extends { id: string }>(list: T[]): Map<string, T> {
    const m = new Map<string, T>();
    for (const x of list) m.set(x.id, x);
    return m;
}

/** 구분용 색 (뜻색 아님). 없으면 중간 회색 */
export function colorOf(e?: { attr?: Record<string, unknown> }): string {
    const c = e?.attr?.color;
    return typeof c === 'string' ? c : '#5b6472';
}

export function specOfTrack(doc: Doc, track: Track | undefined): TimetableSpec | undefined {
    if (!track?.specId) return undefined;
    return doc.specs.find((s) => s.id === track.specId);
}

/** 그 규격의 활동(수업 넣을 수 있는) 슬롯들 */
export function assignableSlots(spec: TimetableSpec): Slot[] {
    return spec.slots.filter((s) => s.assignable);
}

/** 반의 그 요일에 실제 수업하는 칸 수 (lessonsPerDay 반영). 없으면 assignable 전체 */
export function lessonCountForDay(spec: TimetableSpec, dayIndex: number): number {
    const per = spec.lessonsPerDay?.[dayIndex];
    if (typeof per === 'number') return per;
    return assignableSlots(spec).length;
}

export function activeDays(spec: TimetableSpec): number[] {
    return spec.activeDays?.length ? spec.activeDays : [0, 1, 2, 3, 4];
}

export const cellKey = (trackId: string, dayIndex: number, slotIndex: number) => `${trackId}:${dayIndex}:${slotIndex}`;

/** 배치들을 (trackId:day:slot) → 배치로 색인 */
export function indexAssignments(assignments: Assignment[]): Map<string, Assignment> {
    const m = new Map<string, Assignment>();
    for (const a of assignments) m.set(cellKey(a.trackId, a.dayIndex, a.slotIndex), a);
    return m;
}

/** 한 배치가 시작하는 시각 (그 반 규격의 슬롯 start) — 교사별 뷰가 시각으로 정렬할 때 */
export function slotStartOf(doc: Doc, a: Assignment): string | undefined {
    const track = doc.tracks.find((t) => t.id === a.trackId);
    const spec = specOfTrack(doc, track);
    return spec?.slots.find((s) => s.index === a.slotIndex && s.assignable)?.start;
}

/** 모든 규격의 수업 슬롯 시작 시각을 모아 정렬 (교사별·특별실별 뷰의 행) */
export function allLessonStarts(doc: Doc): string[] {
    const set = new Set<string>();
    for (const spec of doc.specs) for (const s of spec.slots) if (s.assignable) set.add(s.start);
    return [...set].sort();
}

/** 한 배치 칸의 두 줄 표시 (과목 / 교사·특별실) */
export interface CellText { top: string; bottom: string; }
export function cellText(a: Assignment, ix: {
    agents: Map<string, Agent>; activities: Map<string, Activity>; resources: Map<string, Resource>; tracks: Map<string, Track>;
}): CellText {
    const act = a.activityId ? ix.activities.get(a.activityId)?.name : undefined;
    const agent = a.agentId ? ix.agents.get(a.agentId)?.name : undefined;
    const res = a.resourceId ? ix.resources.get(a.resourceId)?.name : undefined;
    const top = act ?? a.label ?? '(빈 배치)';
    const bottom = [agent, res].filter(Boolean).join(' · ');
    return { top, bottom };
}
