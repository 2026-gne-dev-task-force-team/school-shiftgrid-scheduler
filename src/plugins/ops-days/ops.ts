/**
 * 학사 칸 조작 + 권한(1.2v 설계 ① 3·12절). 교사는 `changes` 에 add·del 만(del 은 자기 것만),
 * `calendar` 는 근태담당·교무·교감·관리자. 재생은 `replay` 한 곳.
 */
import { replay, type Op, type ReplayResult } from '../../server-link/replay';
import type { CalendarEvent, DaysRole, DaysPart, DaysViewer, TimetableChange } from './types';

export const keyOf = (_list: string, item: unknown): string => (item as { id: string }).id;
const toLists = (p: DaysPart): Record<string, unknown[]> => ({ calendar: p.calendar, changes: p.changes });

export const addEvent = (e: CalendarEvent): Op => ({ op: 'add', list: 'calendar', key: e.id, item: e });
export const editEvent = (before: CalendarEvent, after: CalendarEvent): Op => ({ op: 'set', list: 'calendar', key: before.id, item: after, base: before });
export const delEvent = (id: string): Op => ({ op: 'del', list: 'calendar', key: id });
export const addChange = (c: TimetableChange): Op => ({ op: 'add', list: 'changes', key: c.id, item: c });
export const editChange = (before: TimetableChange, after: TimetableChange): Op => ({ op: 'set', list: 'changes', key: before.id, item: after, base: before });
export const delChange = (id: string): Op => ({ op: 'del', list: 'changes', key: id });

const MANAGERS: DaysRole[] = ['관리자', '교감', '교무', '근태담당'];

/** 조작 하나를 이 사람이 해도 되나 — 안 되면 이유, 되면 null. `owners` = 지금까지 알려진 changes 항목 id → 만든 사람. */
export function whyDenied(v: DaysViewer, op: Op, owners: Map<string, string>): string | null {
    if (MANAGERS.includes(v.role)) return null;
    if (op.list !== 'changes') return '학사 일정은 교사가 고칠 수 없습니다.';
    if (op.op === 'set') return '교사는 시간표 변경을 고칠 수 없습니다(지우고 다시 넣기).';
    if (op.op === 'add') return (op.item as TimetableChange).createdBy === v.userId ? null : '남의 이름으로 넣을 수 없습니다.';
    return owners.get(op.key) === v.userId ? null : '남이 넣은 변경은 지울 수 없습니다.';
}

/** 큐 전체의 권한 검사 — 같은 큐에서 먼저 add 한 것도 주인으로 센다. */
export function checkPermission(v: DaysViewer, server: DaysPart, ops: Op[]): string[] {
    const owners = new Map(server.changes.map((c) => [c.id, c.createdBy] as const));
    const bad: string[] = [];
    for (const op of ops) {
        const why = whyDenied(v, op, owners);
        if (why) bad.push(why);
        else if (op.list === 'changes' && op.op === 'add') owners.set(op.key, (op.item as TimetableChange).createdBy);
    }
    return bad;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 칸 규칙 — 날짜 꼴 · 끝 날짜 ≥ 시작 · 제목·과목 비지 않음 · 교시 1~10. */
export function checkDays(p: DaysPart): string[] {
    const bad: string[] = [];
    for (const e of p.calendar) {
        if (!DATE.test(e.date) || !DATE.test(e.endDate)) bad.push('학사 일정 날짜 꼴이 맞지 않습니다.');
        else if (e.endDate < e.date) bad.push('학사 일정 끝 날짜가 시작보다 이릅니다.');
        if (!e.title.trim()) bad.push('학사 일정 제목이 비었습니다.');
    }
    for (const c of p.changes) {
        if (!DATE.test(c.date)) bad.push('시간표 변경 날짜 꼴이 맞지 않습니다.');
        if (!Number.isInteger(c.period) || c.period < 1 || c.period > 10) bad.push('시간표 변경 교시는 1~10 이어야 합니다.');
        if (!c.classKey.trim() || !c.subject.trim()) bad.push('시간표 변경에 반·과목이 비었습니다.');
    }
    return bad;
}

export interface ApplyOutcome { next: DaysPart; replayed: ReplayResult; errors: string[] }

/** 서버 판에 조작을 입힌다. 권한·충돌·칸 규칙 중 하나라도 걸리면 `errors` 가 비지 않는다(그땐 PUT 하지 않는다). */
export function applyDaysOps(viewer: DaysViewer, server: DaysPart, ops: Op[]): ApplyOutcome {
    const replayed = replay(toLists(server), ops, keyOf);
    const next: DaysPart = { calendar: replayed.result.calendar as CalendarEvent[], changes: replayed.result.changes as TimetableChange[] };
    const denied = checkPermission(viewer, server, ops);
    const errors = denied.length > 0 ? denied : replayed.conflicts.length > 0 ? ['서버 값이 달라져 충돌한 조작이 있습니다.'] : checkDays(next);
    return { next, replayed, errors };
}
