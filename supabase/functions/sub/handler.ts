// `sub` 함수 ①(B8): reg-options · register · list · mine — ③ 11-3 · ① 5-1 「등록」 판정 순서.
// 경로: `/functions/v1/sub/projects/<pid>/<동작>`(③ 11-3 의 `P/sub/…` 를 함수 이름 뒤로).
// 순수 — DB·열쇠·그날 입력·시계는 주입(SubDeps). Deno 진입점은 index.ts.
// B9: `:id`(후보·`me.whyNot`·notice 공개 범위) · claim(`whyNot` 재판정 → 조건부 UPDATE) · cancel(대기로).
// B10: assign · force · DELETE · stats — 위험 조작은 본문 `confirm:true` 없으면 400 · 바뀐 전/후 행 통째를 audit 에(_shared/audit.ts).

import { can } from '../../../shared/roles.ts';
import { appendAudit, type AuditStore } from '../_shared/audit.ts';
import { requireProjectMember, type AuthClient, type Member } from '../_shared/auth.ts';
import { isPastDate, seoulToday, type Clock } from '../_shared/clock.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle, subPath } from '../_shared/http.ts';
import { substituteCandidates, whyNot, type CandInput } from '../../../shared/sub-engine/candidates.ts';
import type { SlotItem } from '../../../shared/sub-engine/day-input.ts';
import { openSlot, openSlots, sealSlot, toSlotItem, type DbSlot, type SubSlotRow } from './rows.ts';

export const REASON_MAX = 100;
export const MEMO_MAX = 300;
/** ③ 11-3 `list?from&to` — 62일 이하(양 끝 포함) */
export const RANGE_MAX_DAYS = 62;

// ── 주입 ──────────────────────────────────────────────

export interface DayLesson { startMin: number; endMin: number; subject: string | null; teacherIds?: string[]; coIds: string[] }
export interface DayTrack { name: string; grade: number | null; lessons: DayLesson[] }
export interface DayPerson { id: string; name: string; kind: string }
/** 그날 입력(덩어리에서 조립 — 조립은 주입 쪽 몫) */
export type DayResult = { ok: true; tracks: DayTrack[]; people: DayPerson[] } | { ok: false; offReason: string };

export interface SubStore {
    /** 날짜 범위(양 끝 포함) 행 — date·start_min 순 */
    listRange(projectId: string, from: string, to: string): Promise<DbSlot[]>;
    /**
     * 한 번에 쓰기: `replace` 의 행(id·updated_at 이 그대로일 때만)을 지우고 `rows` 를 넣는다.
     * 유일 위반(23505)·지울 행이 그 사이 바뀜이면 'conflict'.
     */
    register(rows: DbSlot[], replace: { id: string; updatedAt: string }[]): Promise<'ok' | 'conflict'>;
    /** 행 하나(프로젝트 안) — 없으면 null */
    get(projectId: string, id: string): Promise<DbSlot | null>;
    /**
     * 조건부 UPDATE(B9 맡기·취소): `id`·`updated_at`·`status` 가 `expect` 그대로인 행만 `next` 의 status·take_ct·updated_at 으로.
     * 0행이면 'conflict'(그 사이 다른 분이 바꿈).
     */
    update(next: DbSlot, expect: { updatedAt: string; status: DbSlot['status'] }): Promise<'ok' | 'conflict'>;
    /** B10 삭제: `id`·`updated_at` 이 `expect` 그대로인 행만 지운다. 0행이면 'conflict'. */
    remove(projectId: string, id: string, expect: { updatedAt: string }): Promise<'ok' | 'conflict'>;
}

/** 엔진 판정 입력(① 8절 「그날 입력」) — 그날 보결 행(`slots`)을 얹어 조립하는 것은 주입 쪽 몫(`buildDayInput`) */
export type JudgeResult = { ok: true; input: CandInput } | { ok: false; offReason: string };

export interface SubDeps {
    auth: AuthClient;
    store: SubStore;
    /** B10: 감사 덧붙이기(추가 전용) */
    audit: AuditStore;
    ring: () => Promise<KeyRing>;
    loadDay(projectId: string, date: string): Promise<DayResult>;
    /** B9: 상세·맡기의 `whyNot` 재판정 입력. `slots` = 그날 보결 행(엔진 꼴) */
    loadJudge(projectId: string, date: string, slots: SlotItem[]): Promise<JudgeResult>;
    /** 구성원의 사람 id(`person_ref`)·표시 이름 */
    memberInfo(projectId: string, userId: string): Promise<{ personRef: string | null; name: string }>;
    clock: Clock;
    newId: () => string;
    allowedOrigin: string | undefined;
}

// ── 순수 판정 ────────────────────────────────────────

const bad = (message: string, code = 'bad_request', extra?: Record<string, unknown>) => new HttpError(400, code, message, extra);

export function validDate(s: unknown): s is string {
    if (typeof s !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const dayNo = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;

export function addDays(date: string, n: number): string {
    return new Date((dayNo(date) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** from·to 검사 — 꼴·순서·62일 한도. 넘으면 400 `range_too_long`. */
export function checkRange(from: unknown, to: unknown): { from: string; to: string } {
    if (!validDate(from) || !validDate(to)) throw bad('from·to 는 2026-11-12 꼴로 적어 주세요');
    if (to < from) throw bad('to 가 from 보다 앞입니다');
    const days = dayNo(to) - dayNo(from) + 1;
    if (days > RANGE_MAX_DAYS) throw bad(`기간은 ${RANGE_MAX_DAYS}일까지입니다`, 'range_too_long', { limit: RANGE_MAX_DAYS, days });
    return { from, to };
}

/** 결근자로 올릴 수 없는 사람(① 5-1 「교감·비교과·보조 결근 ✗」) */
export const notAbsentable = (p: DayPerson) => p.kind === '교감' || p.kind === '비교과' || p.kind === '보조' || p.id.startsWith('aux:');

export interface RegisterBody {
    date: string;
    absentRef: string;
    allDay: boolean;
    times: { startMin: number; endMin: number }[];
    reason: string;
    memo: string;
    label: string;
    overwrite: boolean;
}

const isMin = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 24 * 60;

export function parseRegisterBody(raw: unknown): RegisterBody {
    if (!raw || typeof raw !== 'object') throw bad('본문이 JSON 객체가 아닙니다');
    const b = raw as Record<string, unknown>;
    if (!validDate(b.date)) throw bad('날짜는 2026-11-12 꼴로 적어 주세요');
    if (typeof b.absentRef !== 'string' || !b.absentRef.trim()) throw bad('빠지는 사람을 골라 주세요');
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const reason = str(b.reason);
    const memo = str(b.memo);
    if (reason.length > REASON_MAX) throw bad(`사유는 ${REASON_MAX}자까지입니다`);
    if (memo.length > MEMO_MAX) throw bad(`메모는 ${MEMO_MAX}자까지입니다`);
    const allDay = b.allDay === true;
    const times: { startMin: number; endMin: number }[] = [];
    if (!allDay) {
        if (!Array.isArray(b.times) || b.times.length === 0) throw bad('시각을 고르거나 종일로 올려 주세요');
        for (const t of b.times as unknown[]) {
            const o = (t ?? {}) as Record<string, unknown>;
            if (!isMin(o.startMin) || !isMin(o.endMin) || o.endMin <= o.startMin) throw bad('시각 꼴이 맞지 않습니다');
            times.push({ startMin: o.startMin, endMin: o.endMin });
        }
    }
    return { date: b.date, absentRef: b.absentRef.trim(), allDay, times, reason, memo, label: str(b.label), overwrite: b.overwrite === true };
}

export interface PlannedSlot { trackName: string; startMin: number; endMin: number; subject: string | null }
export interface Skipped { trackName: string; startMin: number; endMin: number; why: string }

/**
 * 시각마다 「그 사람 수업인가」(① 5-1): 담임(`homeroom:<반>`) = 그 반의 전담 없는 칸 · 전담 = teacherIds/coIds 에 있음.
 * 담임 반의 전담 칸은 건너뜀(「전담 수업 시간」).
 */
export function planSlots(tracks: readonly DayTrack[], absentRef: string, allDay: boolean, times: RegisterBody['times']) {
    const inWindow = (l: DayLesson) => allDay || times.some((t) => l.startMin < t.endMin && t.startMin < l.endMin);
    const slots: PlannedSlot[] = [];
    const skipped: Skipped[] = [];
    const home = absentRef.startsWith('homeroom:') ? absentRef.slice('homeroom:'.length) : null;
    for (const t of tracks) {
        if (home !== null && t.name !== home) continue;
        for (const l of t.lessons) {
            if (!inWindow(l)) continue;
            const at = { trackName: t.name, startMin: l.startMin, endMin: l.endMin };
            if (home !== null) {
                if ((l.teacherIds ?? []).length > 0) skipped.push({ ...at, why: '전담 수업 시간' });
                else slots.push({ ...at, subject: l.subject });
            } else if ((l.teacherIds ?? []).includes(absentRef) || l.coIds.includes(absentRef)) {
                slots.push({ ...at, subject: l.subject });
            }
        }
    }
    return { slots, skipped };
}

/** 덮어쓸 수 있나(① 5-1 · `:221`): 올린 사람·같은 결근자·결근자 본인·그 반 담임·관리 4역할 */
export function canOverwrite(existing: SubSlotRow, absentRef: string, me: Member, personRef: string | null): boolean {
    if (can(me.roles, 'sub.manage')) return true;
    if (existing.body.registeredBy === me.userId) return true;
    if (existing.body.absentRef === absentRef) return true;
    if (personRef && (existing.body.absentRef === personRef || personRef === `homeroom:${existing.trackName}`)) return true;
    return false;
}

/** 「내 것」: 내가 맡은 · 내가 결근자 · 내가 올린 (이름 일치 아님 — personRef·계정 비교, ① 5-1) */
export function mineReasons(r: SubSlotRow, userId: string, personRef: string | null): ('taker' | 'absent' | 'registered')[] {
    const out: ('taker' | 'absent' | 'registered')[] = [];
    if (personRef && r.take?.takerRef === personRef) out.push('taker');
    if (personRef && r.body.absentRef === personRef) out.push('absent');
    if (r.body.registeredBy === userId) out.push('registered');
    return out;
}

// ── 라우터 ───────────────────────────────────────────

async function readJson(req: Request): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        throw bad('본문이 JSON 이 아닙니다');
    }
}

function route(req: Request): { pid: string; action: string[] } {
    const p = subPath(req.url, 'sub');
    if (p[0] !== 'projects' || !p[1]) throw errors.notFound();
    return { pid: p[1], action: p.slice(2) };
}

export function subHandler(deps: SubDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            const { pid, action } = route(r);
            const method = r.method.toUpperCase();
            const me = await requireProjectMember(deps.auth, r.headers.get('Authorization'), pid);
            const q = new URL(r.url).searchParams;
            const one = action.length === 1 ? action[0] : null;

            if (one === 'reg-options') {
                if (method !== 'GET') throw errors.methodNotAllowed();
                return regOptions(deps, pid, q.get('date'));
            }
            if (one === 'register') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return register(deps, me, parseRegisterBody(await readJson(r)));
            }
            if (one === 'list') {
                if (method !== 'GET') throw errors.methodNotAllowed();
                const { from, to } = checkRange(q.get('from'), q.get('to'));
                const rows = await openSlots(await deps.ring(), await deps.store.listRange(pid, from, to));
                return jsonResponse({ rows });
            }
            if (one === 'mine') {
                if (method !== 'GET') throw errors.methodNotAllowed();
                const today = seoulToday(deps.clock);
                const { from, to } = checkRange(q.get('from') ?? today, q.get('to') ?? addDays(q.get('from') ?? today, RANGE_MAX_DAYS - 1));
                const { personRef } = await deps.memberInfo(pid, me.userId);
                const all = await openSlots(await deps.ring(), await deps.store.listRange(pid, from, to));
                const rows = all
                    .map((row) => ({ row, as: mineReasons(row, me.userId, personRef) }))
                    .filter((x) => x.as.length > 0)
                    .map((x) => ({ ...x.row, mineAs: x.as }));
                return jsonResponse({ rows });
            }
            // B9: `:id`(GET) · `:id/claim` · `:id/cancel`
            if (one === 'stats') {
                if (method !== 'GET') throw errors.methodNotAllowed();
                return stats(deps, me, q.get('from'), q.get('to'));
            }
            if (one !== null && method === 'GET') return detail(deps, me, one);
            if (action.length === 2 && action[1] === 'claim') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return claim(deps, me, action[0]);
            }
            if (action.length === 2 && action[1] === 'cancel') {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return cancel(deps, me, action[0]);
            }
            // B10: `:id/assign` · `:id/force` · DELETE `:id` (`stats` 는 위)
            if (action.length === 2 && (action[1] === 'assign' || action[1] === 'force')) {
                if (method !== 'POST') throw errors.methodNotAllowed();
                return assignOrForce(deps, me, action[0], action[1], await readJson(r));
            }
            if (one !== null && method === 'DELETE') return remove(deps, me, one, await readJson(r));
            throw errors.notFound();
        });
}

async function regOptions(deps: SubDeps, pid: string, date: string | null): Promise<Response> {
    if (!validDate(date)) throw bad('날짜는 2026-11-12 꼴로 적어 주세요');
    if (isPastDate(date, deps.clock)) throw new HttpError(400, 'past_date', '지난 날짜에는 올릴 수 없습니다');
    const day = await deps.loadDay(pid, date);
    if (!day.ok) throw new HttpError(400, 'no_school_day', `수업이 없는 날입니다(${day.offReason})`);
    const tracks = day.tracks.map((t) => ({
        name: t.name, grade: t.grade,
        lessons: t.lessons.map((l) => ({ startMin: l.startMin, endMin: l.endMin, subject: l.subject })),
    }));
    const absentees = [
        ...day.tracks.map((t) => ({ id: `homeroom:${t.name}`, name: `${t.name} 담임`, kind: '담임' })),
        ...day.people.filter((p) => !notAbsentable(p)).map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
    ];
    return jsonResponse({ date, tracks, absentees });
}

async function register(deps: SubDeps, me: Member, b: RegisterBody): Promise<Response> {
    const pid = me.projectId;
    // 판정 순서(① 5-1): 지난 날 → 쉬는 날 → 결근자 종류 → 수업인가 → 되묻기 → 덮어쓰기 권한 → 쓰기
    if (isPastDate(b.date, deps.clock)) throw new HttpError(400, 'past_date', '지난 날짜에는 올릴 수 없습니다');
    const day = await deps.loadDay(pid, b.date);
    if (!day.ok) throw new HttpError(400, 'no_school_day', `수업이 없는 날입니다(${day.offReason})`);

    let absentName: string;
    if (b.absentRef.startsWith('homeroom:')) {
        const t = b.absentRef.slice('homeroom:'.length);
        if (!day.tracks.some((x) => x.name === t)) throw bad('없는 반입니다', 'unknown_person');
        absentName = `${t} 담임`;
    } else {
        const p = day.people.find((x) => x.id === b.absentRef);
        if (!p) throw bad('명단에 없는 사람입니다', 'unknown_person');
        if (notAbsentable(p)) throw bad('교감·비교과·보조 인력은 결근 보결로 올리지 않습니다', 'absent_not_allowed');
        absentName = p.name;
    }

    const { slots, skipped } = planSlots(day.tracks, b.absentRef, b.allDay, b.times);
    if (slots.length === 0) throw bad('그 시각에 그 사람 수업이 없습니다', 'no_lessons', { skipped });

    const ring = await deps.ring();
    const existing = await openSlots(ring, await deps.store.listRange(pid, b.date, b.date));
    const hits = existing.filter((e) => slots.some((s) => s.trackName === e.trackName && s.startMin === e.startMin));
    if (hits.length > 0 && !b.overwrite) {
        throw new HttpError(409, 'need_overwrite', '이미 올라온 칸이 있습니다 — 덮을까요?', {
            existing: hits.map((h) => ({ id: h.id, trackName: h.trackName, startMin: h.startMin, endMin: h.endMin, status: h.status, taken: h.take !== null })),
        });
    }
    const info = await deps.memberInfo(pid, me.userId);
    if (hits.some((h) => !canOverwrite(h, b.absentRef, me, info.personRef))) {
        throw new HttpError(403, 'overwrite_forbidden', '이 칸을 덮어쓸 권한이 없습니다');
    }

    const now = deps.clock().toISOString();
    const rows: SubSlotRow[] = slots.map((s) => ({
        id: deps.newId(), projectId: pid, date: b.date, trackName: s.trackName, startMin: s.startMin, endMin: s.endMin,
        status: '대기', createdAt: now, updatedAt: now,
        body: {
            absentRef: b.absentRef, absentName, registeredByName: info.name, registeredBy: me.userId,
            label: b.label, subject: s.subject, reason: b.reason, memo: b.memo, allDay: b.allDay, preApproved: false,
        },
        take: null,
    }));
    const sealed = await Promise.all(rows.map((row) => sealSlot(ring, row)));
    const res = await deps.store.register(sealed, hits.map((h) => ({ id: h.id, updatedAt: h.updatedAt })));
    if (res === 'conflict') throw new HttpError(409, 'register_race', '방금 다른 분이 올렸습니다 — 다시 불러옵니다');
    return jsonResponse({ rows, skipped, replaced: hits.length });
}

// ── B9: 상세 · 맡기 · 취소 ────────────────────────────

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 요청 문구(notice)를 볼 수 있나(③ 11-3 `:337`): 올린 이 · 결근자 본인 · 관리 4역할 */
export function canSeeNotice(r: SubSlotRow, me: Member, personRef: string | null): boolean {
    if (can(me.roles, 'sub.manage')) return true;
    if (r.body.registeredBy === me.userId) return true;
    return personRef !== null && r.body.absentRef === personRef;
}

/** 요청 문구 — 결근자·시각·과목·사유·메모를 한 줄로(목록에는 안 나가는 글) */
export function noticeText(r: SubSlotRow): string {
    const subj = r.body.subject ? ` ${r.body.subject}` : '';
    const memo = r.body.memo ? ` · ${r.body.memo}` : '';
    return `${r.date} ${r.trackName} ${hhmm(r.startMin)}~${hhmm(r.endMin)}${subj} — ${r.body.absentName}(${r.body.reason || '사유 없음'}) 보결 부탁드립니다${memo}`;
}

/** 행 하나 + 그날 행 전부(열린 꼴). 없으면 404. */
async function loadRow(deps: SubDeps, pid: string, id: string) {
    const raw = await deps.store.get(pid, id);
    if (!raw) throw new HttpError(404, 'not_found', '보결이 없어졌습니다 — 다시 불러옵니다');
    const ring = await deps.ring();
    const row = await openSlot(ring, raw);
    const day = await openSlots(ring, await deps.store.listRange(pid, row.date, row.date));
    return { ring, raw, row, day };
}

const queryOf = (r: SubSlotRow) => ({ trackName: r.trackName, startMin: r.startMin, endMin: r.endMin, absentId: r.body.absentRef });

async function detail(deps: SubDeps, me: Member, id: string): Promise<Response> {
    const pid = me.projectId;
    const { row, day } = await loadRow(deps, pid, id);
    const { personRef } = await deps.memberInfo(pid, me.userId);
    const judge = await deps.loadJudge(pid, row.date, day.map(toSlotItem));
    const q = queryOf(row);
    const cands = judge.ok ? substituteCandidates(judge.input, q) : null;
    const meWhy = !judge.ok ? [`수업이 없는 날(${judge.offReason})`]
        : personRef === null ? ['계정에 교사 연결이 없음']
            : whyNot(judge.input, q, personRef);
    const seeNotice = canSeeNotice(row, me, personRef);
    return jsonResponse({
        row,
        candidates: cands ? { A: cands.A, B: cands.B, C: cands.C, D: cands.D } : null,
        offReason: judge.ok ? null : judge.offReason,
        me: { personRef, whyNot: meWhy },
        notice: seeNotice ? noticeText(row) : null,
    });
}

async function claim(deps: SubDeps, me: Member, id: string): Promise<Response> {
    const pid = me.projectId;
    const { ring, raw, row, day } = await loadRow(deps, pid, id);
    // 판정 순서(① 5-1 「맡기」): 지난 날 → 대기 아님 → personRef 없음 → whyNot → 같은 시각 겹침 → 조건부 UPDATE
    if (isPastDate(row.date, deps.clock)) throw new HttpError(400, 'past_date', '지난 날 보결은 맡을 수 없습니다');
    if (row.status !== '대기') throw new HttpError(409, 'already_taken', '이미 다른 분이 맡은 보결입니다');
    const info = await deps.memberInfo(pid, me.userId);
    if (info.personRef === null) throw new HttpError(403, 'no_person', '계정에 교사 연결이 없어 맡을 수 없습니다');
    const personRef = info.personRef;
    const judge = await deps.loadJudge(pid, row.date, day.map(toSlotItem));
    if (!judge.ok) throw new HttpError(400, 'no_school_day', `수업이 없는 날입니다(${judge.offReason})`);
    const reasons = whyNot(judge.input, queryOf(row), personRef);
    if (reasons.length > 0) throw bad(`맡을 수 없습니다: ${reasons.join(' · ')}`, 'why_not', { whyNot: reasons });
    const clash = day.find((o) => o.id !== row.id && o.take?.takerRef === personRef && o.startMin < row.endMin && row.startMin < o.endMin);
    if (clash) throw new HttpError(409, 'time_clash', `같은 시각에 ${clash.trackName} 보결을 이미 맡았습니다`);

    const now = deps.clock().toISOString();
    const next: SubSlotRow = {
        ...row, status: '확정', updatedAt: now,
        take: { takerRef: personRef, takerName: info.name, takerUserId: me.userId, confirmedAt: now },
    };
    const res = await deps.store.update(await sealSlot(ring, next), { updatedAt: raw.updated_at, status: '대기' });
    if (res === 'conflict') throw new HttpError(409, 'claim_race', '방금 다른 분이 먼저 맡았습니다 — 다시 불러옵니다');
    return jsonResponse({ row: next });
}

async function cancel(deps: SubDeps, me: Member, id: string): Promise<Response> {
    const pid = me.projectId;
    const { ring, raw, row } = await loadRow(deps, pid, id);
    // 판정 순서(① 5-1 「취소」): 확정 아님 → 지난 날은 관리자만 → 맡은 본인·관리 4역할 → 대기로(행은 남음)
    if (row.status !== '확정' || !row.take) throw new HttpError(409, 'not_taken', '맡은 보결이 아니어서 취소할 수 없습니다');
    if (isPastDate(row.date, deps.clock) && !can(me.roles, 'sub.past')) {
        throw new HttpError(403, 'past_admin_only', '지난 날 보결은 관리자만 취소할 수 있습니다');
    }
    const { personRef } = await deps.memberInfo(pid, me.userId);
    const mine = personRef !== null && row.take.takerRef === personRef;
    if (!mine && !can(me.roles, 'sub.cancelAny')) throw new HttpError(403, 'cancel_forbidden', '맡은 본인이나 관리 역할만 취소할 수 있습니다');

    const next: SubSlotRow = { ...row, status: '대기', updatedAt: deps.clock().toISOString(), take: null };
    const res = await deps.store.update(await sealSlot(ring, next), { updatedAt: raw.updated_at, status: '확정' });
    if (res === 'conflict') throw new HttpError(409, 'cancel_race', '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다');
    return jsonResponse({ row: next });
}

// ── B10: assign · force · DELETE · stats ──────────────

export interface AssignBody { personId: string; confirm: true }

/** 위험 조작 본문 꼴 — `confirm` 이 정확히 `true` 가 아니면 400 `confirm_required`(문자열 "true"·1 도 거절). */
export function requireConfirm(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') throw bad('본문이 JSON 객체가 아닙니다');
    const b = raw as Record<string, unknown>;
    if (b.confirm !== true) throw bad('되돌리기 어려운 조작입니다 — confirm:true 로 확인해 주세요', 'confirm_required');
    return b;
}

export function parseAssignBody(raw: unknown): AssignBody {
    const b = requireConfirm(raw);
    if (typeof b.personId !== 'string' || !b.personId.trim()) throw bad('맡길 사람을 골라 주세요');
    return { personId: b.personId.trim(), confirm: true };
}

/** 삭제할 수 있나(③ 11-3 `:422`): 올린 이 · 결근자 본인 · 관리 4역할. 지난 건은 `sub.past`(관리자)만. */
export function canDelete(r: SubSlotRow, me: Member, personRef: string | null, past: boolean): 'ok' | 'past_admin_only' | 'forbidden' {
    if (past && !can(me.roles, 'sub.past')) return 'past_admin_only';
    if (can(me.roles, 'sub.manage') || r.body.registeredBy === me.userId) return 'ok';
    return personRef !== null && r.body.absentRef === personRef ? 'ok' : 'forbidden';
}

export interface SubStats {
    from: string; to: string; total: number; waiting: number; confirmed: number;
    byTaker: { takerRef: string; takerName: string; count: number }[];
    byAbsent: { absentRef: string; absentName: string; count: number }[];
}

/** 순수: 기간 안 행 → 집계. 읽기 전용 — 많은 순(같으면 이름 순). */
export function computeStats(rows: readonly SubSlotRow[], from: string, to: string): SubStats {
    const taker = new Map<string, { takerRef: string; takerName: string; count: number }>();
    const absent = new Map<string, { absentRef: string; absentName: string; count: number }>();
    let confirmed = 0;
    for (const r of rows) {
        const a = absent.get(r.body.absentRef) ?? { absentRef: r.body.absentRef, absentName: r.body.absentName, count: 0 };
        a.count++;
        absent.set(a.absentRef, a);
        if (r.status === '확정' && r.take) {
            confirmed++;
            const t = taker.get(r.take.takerRef) ?? { takerRef: r.take.takerRef, takerName: r.take.takerName, count: 0 };
            t.count++;
            taker.set(t.takerRef, t);
        }
    }
    const order = <T extends { count: number }>(m: Map<string, T>, name: (x: T) => string) =>
        [...m.values()].sort((x, y) => y.count - x.count || name(x).localeCompare(name(y), 'ko'));
    return {
        from, to, total: rows.length, confirmed, waiting: rows.length - confirmed,
        byTaker: order(taker, (x) => x.takerName), byAbsent: order(absent, (x) => x.absentName),
    };
}

async function stats(deps: SubDeps, me: Member, f: string | null, t: string | null): Promise<Response> {
    if (!can(me.roles, 'sub.manage')) throw new HttpError(403, 'forbidden', '보결 관리 역할만 볼 수 있습니다');
    const from0 = f ?? seoulToday(deps.clock);
    const { from, to } = checkRange(from0, t ?? addDays(from0, RANGE_MAX_DAYS - 1));
    const rows = await openSlots(await deps.ring(), await deps.store.listRange(me.projectId, from, to));
    return jsonResponse(computeStats(rows, from, to));
}

/** 감사 한 줄 — 행 통째 전·후(③ 11-3 · ④ 4절). 바뀐 뒤에 쓴다(안 바뀌었으면 남기지 않는다). */
async function audit(
    deps: SubDeps, ring: KeyRing, me: Member, action: string, before: SubSlotRow, after: SubSlotRow | null, note: Record<string, unknown> | null,
) {
    await appendAudit(ring, deps.audit, {
        projectId: me.projectId, id: deps.newId(), at: deps.clock().toISOString(), module: 'sub', action, target: before.id,
        body: { actorUserId: me.userId, before, after, note },
    });
}

async function assignOrForce(deps: SubDeps, me: Member, id: string, kind: 'assign' | 'force', raw: unknown): Promise<Response> {
    const pid = me.projectId;
    // 판정 순서: 역할 → confirm → 행 → (assign 만) 지난 날·대기 아님 → 사람 → (assign 만) whyNot·겹침 → 조건부 UPDATE → 감사
    if (!can(me.roles, kind === 'assign' ? 'sub.assign' : 'sub.force')) {
        throw new HttpError(403, 'forbidden', kind === 'assign' ? '교감·교무만 지정할 수 있습니다' : '보결관리자만 강제 지정할 수 있습니다');
    }
    const { personId } = parseAssignBody(raw);
    const { ring, raw: dbRow, row, day } = await loadRow(deps, pid, id);
    const past = isPastDate(row.date, deps.clock);
    if (kind === 'assign') {
        if (past) throw new HttpError(400, 'past_date', '지난 날 보결은 지정할 수 없습니다');
        if (row.status !== '대기') throw new HttpError(409, 'already_taken', '이미 맡은 분이 있는 보결입니다');
    }
    const dayIn = await deps.loadDay(pid, row.date);
    if (!dayIn.ok) throw new HttpError(400, 'no_school_day', `수업이 없는 날입니다(${dayIn.offReason})`);
    const person = dayIn.people.find((p) => p.id === personId);
    if (!person) throw bad('명단에 없는 사람입니다', 'unknown_person');
    const judge = await deps.loadJudge(pid, row.date, day.map(toSlotItem));
    const reasons = judge.ok ? whyNot(judge.input, queryOf(row), personId) : [`수업이 없는 날(${judge.offReason})`];
    if (kind === 'assign') {
        if (reasons.length > 0) throw bad(`맡길 수 없습니다: ${reasons.join(' · ')}`, 'why_not', { whyNot: reasons });
        const clash = day.find((o) => o.id !== row.id && o.take?.takerRef === personId && o.startMin < row.endMin && row.startMin < o.endMin);
        if (clash) throw new HttpError(409, 'time_clash', `같은 시각에 ${clash.trackName} 보결을 이미 맡았습니다`);
    }
    const now = deps.clock().toISOString();
    const next: SubSlotRow = {
        ...row, status: '확정', updatedAt: now,
        take: { takerRef: personId, takerName: person.name, takerUserId: null, confirmedAt: now },
    };
    const res = await deps.store.update(await sealSlot(ring, next), { updatedAt: dbRow.updated_at, status: row.status });
    if (res === 'conflict') throw new HttpError(409, `${kind}_race`, '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다');
    // force 는 판정을 건너뛴 근거(그때의 whyNot)를 남긴다. 바뀐 뒤 감사가 실패하면 500 — 화면은 다시 불러온다.
    await audit(deps, ring, me, kind, row, next, { whyNot: reasons, ...(kind === 'force' ? { pastDay: past } : {}) });
    return jsonResponse({ row: next });
}

async function remove(deps: SubDeps, me: Member, id: string, raw: unknown): Promise<Response> {
    const pid = me.projectId;
    requireConfirm(raw);
    const { ring, raw: dbRow, row } = await loadRow(deps, pid, id);
    const { personRef } = await deps.memberInfo(pid, me.userId);
    const verdict = canDelete(row, me, personRef, isPastDate(row.date, deps.clock));
    if (verdict === 'past_admin_only') throw new HttpError(403, 'past_admin_only', '지난 날 보결은 관리자만 지울 수 있습니다');
    if (verdict === 'forbidden') throw new HttpError(403, 'delete_forbidden', '올린 분·결근자·관리 역할만 지울 수 있습니다');
    const res = await deps.store.remove(pid, row.id, { updatedAt: dbRow.updated_at });
    if (res === 'conflict') throw new HttpError(409, 'delete_race', '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다');
    await audit(deps, ring, me, 'delete', row, null, null);
    return jsonResponse({ deleted: row.id });
}
