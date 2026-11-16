/**
 * 근태 칸 조작 + 권한 + 재배정 판정(1.2v 설계 ① 7절). 쓰는 사람은 근태담당 하나(`requireRole('근태담당')`).
 * 날짜별 배정(day)을 넣을 때 엔진 `checkAssignment` 가 걸리면 거부하고, 이미 들어 있는 배정이
 * 나중에 어긋나면(수업·일정이 바뀜) 「재배정 필요」로 센다. 재생은 `replay` 한 곳. 월 마감(exceptions·monthClose)은 month/ — 마감 판정은 `judgeAuxChange`.
 */
import { checkAssignment, type AuxProfile, type DayLesson, type Occupied } from '../../../shared/aux-engine/assign.ts';
import { replay, type Op, type ReplayResult } from '../../server-link/replay';
import { canWrite, rolesOf, viewerCan } from '../../../shared/roles.ts';
import { judgeAuxChange } from './month/judge';
import type { AuxBase, AuxCondition, AuxDay, AuxException, AuxMonthClose, AuxPart, AuxStaff, AuxViewer } from './types';

export const keyOf = (_list: string, item: unknown): string => (item as { id: string }).id;
const toLists = (p: AuxPart): Record<string, unknown[]> => ({ staff: p.staff, conditions: p.conditions, base: p.base, day: p.day, exceptions: p.exceptions, monthClose: p.monthClose });

export const addStaff = (s: AuxStaff): Op => ({ op: 'add', list: 'staff', key: s.id, item: s });
export const editStaff = (before: AuxStaff, after: AuxStaff): Op => ({ op: 'set', list: 'staff', key: before.id, item: after, base: before });
/** 명부에서 지우지 않고 쉬게 한다(기록 보존). */
export const deactivateStaff = (s: AuxStaff): Op => editStaff(s, { ...s, active: false });
/** 쉬게 한 보조를 다시 켠다(「쉬게 하기」 되돌리기). */
export const reactivateStaff = (s: AuxStaff): Op => editStaff(s, { ...s, active: true });
export const addCondition = (c: AuxCondition): Op => ({ op: 'add', list: 'conditions', key: c.id, item: c });
export const editCondition = (before: AuxCondition, after: AuxCondition): Op => ({ op: 'set', list: 'conditions', key: before.id, item: after, base: before });
export const delCondition = (id: string): Op => ({ op: 'del', list: 'conditions', key: id });
export const addBase = (b: AuxBase): Op => ({ op: 'add', list: 'base', key: b.id, item: b });
export const editBase = (before: AuxBase, after: AuxBase): Op => ({ op: 'set', list: 'base', key: before.id, item: after, base: before });
export const delBase = (id: string): Op => ({ op: 'del', list: 'base', key: id });
export const addDay = (d: AuxDay): Op => ({ op: 'add', list: 'day', key: d.id, item: d });
export const editDay = (before: AuxDay, after: AuxDay): Op => ({ op: 'set', list: 'day', key: before.id, item: after, base: before });
export const delDay = (id: string): Op => ({ op: 'del', list: 'day', key: id });

/** 이 사람이 근태 칸(목록 `list`, 생략하면 아무 칸)을 고쳐도 되나 — 권한표 `LIST_WRITE.aux`. 안 되면 이유, 되면 null. */
export function whyDenied(v: AuxViewer, list = 'staff'): string | null {
    return canWrite(rolesOf(v), 'aux', list) ? null : '근태는 근태담당만 고칠 수 있습니다.';
}
/** 마감 조작 — 마감(add)은 근태담당, 해제(monthClose 줄 삭제)는 관리자만 이 문으로 들어온다. */
export const addExc = (e: AuxException): Op => ({ op: 'add', list: 'exceptions', key: e.id, item: e });
export const editExc = (before: AuxException, after: AuxException): Op => ({ op: 'set', list: 'exceptions', key: before.id, item: after, base: before });
export const delExc = (id: string): Op => ({ op: 'del', list: 'exceptions', key: id });
export const closeMonth = (m: AuxMonthClose): Op => ({ op: 'add', list: 'monthClose', key: m.id, item: m });
export const reopenMonth = (id: string): Op => ({ op: 'del', list: 'monthClose', key: id });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dowOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** 칸 규칙 — 이름·종류 · 보조 id 가 명부에 있음 · 요일 0~4 · 시각 시작<끝 · 날짜 꼴. */
export function checkAux(p: AuxPart): string[] {
    const bad: string[] = [];
    const ids = new Set(p.staff.map((s) => s.id));
    for (const s of p.staff) if (!s.name.trim()) bad.push('보조 인력 이름이 비었습니다.');
    for (const c of p.conditions) {
        if (!ids.has(c.staffId)) bad.push('근무 조건의 보조 인력이 명부에 없습니다.');
        if (!Number.isInteger(c.dow) || c.dow < 0 || c.dow > 4) bad.push('근무 조건 요일은 월~금(0~4)이어야 합니다.');
        if (c.workStartMin != null && c.workEndMin != null && c.workEndMin <= c.workStartMin) bad.push('근무 종료가 시작보다 이릅니다.');
    }
    for (const b of p.base) {
        if (!ids.has(b.staffId)) bad.push('기본 배정의 보조 인력이 명부에 없습니다.');
        if (!Number.isInteger(b.dow) || b.dow < 0 || b.dow > 4) bad.push('기본 배정 요일은 월~금(0~4)이어야 합니다.');
        if (b.endMin <= b.startMin) bad.push('기본 배정 종료가 시작보다 이릅니다.');
    }
    for (const d of p.day) {
        if (!ids.has(d.staffId)) bad.push('날짜별 배정의 보조 인력이 명부에 없습니다.');
        if (!DATE.test(d.date)) bad.push('날짜별 배정 날짜 꼴이 맞지 않습니다.');
        if (d.endMin <= d.startMin) bad.push('날짜별 배정 종료가 시작보다 이릅니다.');
    }
    const YM = /^\d{4}-\d{2}$/;
    const KINDS = ['결근', '지각', '조퇴', '추가', '정정'];
    for (const e of p.exceptions) {
        if (!ids.has(e.staffId)) bad.push('예외의 보조 인력이 명부에 없습니다.');
        if (!DATE.test(e.date)) bad.push('예외 날짜 꼴이 맞지 않습니다.');
        if (!KINDS.includes(e.kind)) bad.push('예외 종류가 맞지 않습니다.');
        if (!Number.isFinite(e.amount)) bad.push('예외 양이 숫자가 아닙니다.');
        if (e.kind === '정정' && (e.amount === 0 || !e.note.trim())) bad.push('정정은 0 이 아닌 양과 사유가 필요합니다.');
    }
    for (const m of p.monthClose) {
        if (!ids.has(m.staffId)) bad.push('마감의 보조 인력이 명부에 없습니다.');
        if (!YM.test(m.ym)) bad.push('마감 년월 꼴이 맞지 않습니다.');
    }
    return bad;
}

/** 그날의 실제 배정 — 기본 배정(그 요일, 날짜별이 같은 보조·시작을 덮으면 빠짐) + 날짜별. 반 빈 칸(지원 불가)은 뺀다. 쉬는 보조는 뺀다. */
export interface Effective { staffId: string; startMin: number; endMin: number; classKey: string; from: 'base' | 'day' }
export function effectiveOn(p: AuxPart, date: string): Effective[] {
    const active = new Set(p.staff.filter((s) => s.active).map((s) => s.id));
    const days = p.day.filter((d) => d.date === date);
    const covered = new Set(days.map((d) => `${d.staffId}:${d.startMin}`));
    const out: Effective[] = [];
    for (const b of p.base) if (b.dow === dowOf(date) && !covered.has(`${b.staffId}:${b.startMin}`)) out.push({ ...b, from: 'base' });
    for (const d of days) out.push({ ...d, from: 'day' });
    return out.filter((e) => e.classKey !== '' && active.has(e.staffId));
}

function profileOf(p: AuxPart, staffId: string, date: string): AuxProfile | null {
    const s = p.staff.find((x) => x.id === staffId);
    if (!s) return null;
    const c = p.conditions.find((x) => x.staffId === staffId && x.dow === dowOf(date));
    return { id: s.id, name: s.name, unit: s.unit, workStartMin: c?.workStartMin ?? null, workEndMin: c?.workEndMin ?? null, allowedActivities: s.allowedActivities, targetTracks: s.targetTracks };
}

export interface Judged extends Effective { ok: boolean; reason?: string }
/** 그날 배정 전부를 엔진으로 잰다 — `ok:false` 가 「재배정 필요」. */
export function judgeDay(p: AuxPart, date: string, lessons: DayLesson[]): Judged[] {
    const eff = effectiveOn(p, date);
    const name = (id: string) => p.staff.find((s) => s.id === id)?.name ?? id;
    const occ: Occupied[] = eff.map((e) => ({ auxId: e.staffId, auxName: name(e.staffId), trackName: e.classKey, startMin: e.startMin, endMin: e.endMin }));
    return eff.map((e) => {
        const prof = profileOf(p, e.staffId, date);
        if (!prof) return { ...e, ok: false, reason: '명부에 없음' };
        const r = checkAssignment({ lessons, aux: prof, trackName: e.classKey, startMin: e.startMin, endMin: e.endMin, occupied: occ });
        return { ...e, ok: r.ok, reason: r.reason };
    });
}

const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** 상태바 배지 값 — `from` 날부터 14일(포함) 안 「재배정 필요」 건수. 휴일 등 수업 없는 날은 lessonsOn 이 [] 를 주면 배정이 전부 걸린다. */
export function reassignNeededCount(p: AuxPart, from: string, lessonsOn: (date: string) => DayLesson[], days = 14): number {
    let n = 0;
    for (let i = 0; i < days; i++) {
        const d = addDays(from, i);
        n += judgeDay(p, d, lessonsOn(d)).filter((j) => !j.ok).length;
    }
    return n;
}

/** `status` — 서버가 줄 코드(403 권한 · 409 마감). 그 밖의 거부는 없음. */
export interface ApplyOutcome { next: AuxPart; replayed: ReplayResult; errors: string[]; status?: 403 | 409 }

/** 서버 판에 조작을 입힌다. 권한·충돌·칸 규칙·날짜별 배정 판정 중 하나라도 걸리면 `errors` 가 비지 않는다(그땐 PUT 하지 않는다). */
export function applyAuxOps(viewer: AuxViewer, server: AuxPart, ops: Op[], lessonsOn: (date: string) => DayLesson[]): ApplyOutcome {
    const replayed = replay(toLists(server), ops, keyOf);
    const r = replayed.result;
    const next: AuxPart = { staff: r.staff as AuxStaff[], conditions: r.conditions as AuxCondition[], base: r.base as AuxBase[], day: r.day as AuxDay[], exceptions: r.exceptions as AuxException[], monthClose: r.monthClose as AuxMonthClose[] };
    // 마감 해제 권한(`aux.reopenMonth`, 관리자)은 해제(monthClose 줄 삭제)만 이 문으로 들어온다.
    const releaseOnly = ops.length > 0 && ops.every((o) => o.list === 'monthClose' && o.op === 'del');
    const denied = viewerCan(viewer, 'aux.reopenMonth') && releaseOnly ? null : ops.map((o) => whyDenied(viewer, o.list)).find((x) => x !== null) ?? whyDenied(viewer);
    if (denied) return { next, replayed, errors: [denied], status: 403 };
    if (replayed.conflicts.length > 0) return { next, replayed, errors: ['서버 값이 달라져 충돌한 조작이 있습니다.'] };
    const rules = checkAux(next);
    if (rules.length > 0) return { next, replayed, errors: rules };
    // 이번에 넣거나 고친 날짜별 배정만 엔진으로 잰다(옛 배정이 어긋난 것까지 막지는 않는다 — 그건 「재배정 필요」 표시 몫).
    const touched = new Set(ops.filter((o) => o.list === 'day' && o.op !== 'del').map((o) => o.key));
    const closed = judgeAuxChange(server, next, rolesOf(viewer));
    if (!closed.ok) return { next, replayed, errors: [closed.reason], status: closed.status };
    const errors: string[] = [];
    for (const d of next.day) {
        if (!touched.has(d.id) || d.classKey === '') continue;
        const j = judgeDay(next, d.date, lessonsOn(d.date)).find((x) => x.from === 'day' && x.staffId === d.staffId && x.startMin === d.startMin);
        if (j && !j.ok) errors.push(`재배정 필요: ${next.staff.find((s) => s.id === d.staffId)?.name ?? d.staffId} ${d.date} ${d.classKey} — ${j.reason}`);
    }
    return { next, replayed, errors };
}
