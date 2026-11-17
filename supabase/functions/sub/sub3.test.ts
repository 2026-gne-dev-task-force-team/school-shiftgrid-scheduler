// B10 검사: assign · force · DELETE · stats + audit. 위험 조작은 confirm 없으면 400 · audit 은 전/후 행 통째 · 지난 건은 관리자만.
// ⛔ 실명 — 가짜 이름만. 가짜 supabase 클라이언트 꼴은 sub.test.ts 와 같다.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthClient, Member } from '../_shared/auth.ts';
import { openAudit, type DbAudit } from '../_shared/audit.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { buildDayInput } from '../../../shared/sub-engine/day-input.ts';
import type { CandInput } from '../../../shared/sub-engine/candidates.ts';
import { canDelete, computeStats, parseAssignBody, requireConfirm, subHandler, type DayResult, type JudgeResult, type SubDeps, type SubStore } from './handler.ts';
import type { DbSlot, SubSlotRow } from './rows.ts';

const ORIGIN = 'https://tt.example.org';
const PID = 'p1';
const CLOCK = () => new Date('2026-11-16T23:59:00Z'); // 서울 2026-11-17 08:59

type MemberRow = { roles: string[]; personRef: string | null; name: string };
const MEMBERS: Record<string, MemberRow> = {
    tokA: { roles: ['교사'], personRef: 'agent:a', name: '가교사' },
    tokB: { roles: ['교사'], personRef: 'agent:b', name: '나교사' },
    tokD: { roles: ['교사'], personRef: 'agent:d', name: '바교사' },
    tokM: { roles: ['교무'], personRef: null, name: '다교무' },
    tokF: { roles: ['보결관리자'], personRef: null, name: '아관리' },
    tokX: { roles: ['관리자'], personRef: null, name: '사관리' },
};
const uid = (tok: string) => `u-${tok}`;

function fakeAuth(): AuthClient {
    return {
        auth: { getUser: async (jwt) => ({ data: { user: MEMBERS[jwt] ? { id: uid(jwt) } : null }, error: null }) },
        from: () => ({
            select: () => ({
                eq: (_c: string, pid: string) => ({
                    eq: (_c2: string, u: string) => ({
                        maybeSingle: async () => {
                            const tok = Object.keys(MEMBERS).find((t) => uid(t) === u);
                            return { data: pid === PID && tok ? { roles: MEMBERS[tok].roles, active: true } : null, error: null };
                        },
                    }),
                }),
            }),
        }),
    };
}

function fakeStore(): SubStore & { rows: DbSlot[] } {
    const rows: DbSlot[] = [];
    return {
        rows,
        async listRange(pid, from, to) {
            return rows.filter((r) => r.project_id === pid && r.date >= from && r.date <= to)
                .sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date < b.date ? -1 : 1));
        },
        async register(add, replace) {
            for (const r of replace) {
                const i = rows.findIndex((x) => x.id === r.id && x.updated_at === r.updatedAt);
                if (i < 0) return 'conflict';
                rows.splice(i, 1);
            }
            rows.push(...add);
            return 'ok';
        },
        async get(pid, id) {
            return rows.find((r) => r.project_id === pid && r.id === id) ?? null;
        },
        async update(next, expect) {
            const i = rows.findIndex((x) => x.id === next.id && x.updated_at === expect.updatedAt && x.status === expect.status);
            if (i < 0) return 'conflict';
            rows[i] = { ...rows[i], status: next.status, take_ct: next.take_ct, updated_at: next.updated_at };
            return 'ok';
        },
        async remove(pid, id, expect) {
            const i = rows.findIndex((x) => x.project_id === pid && x.id === id && x.updated_at === expect.updatedAt);
            if (i < 0) return 'conflict';
            rows.splice(i, 1);
            return 'ok';
        },
    };
}

const PEOPLE = [
    { id: 'agent:a', name: '가교사', kind: '전담' },
    { id: 'agent:b', name: '나교사', kind: '전담' },
    { id: 'agent:d', name: '바교사', kind: '전담' },
    { id: 'agent:c', name: '마강사', kind: '강사' },
];
const DAY: DayResult = {
    ok: true,
    tracks: [
        { name: '1-1', grade: 1, lessons: [
            { startMin: 540, endMin: 585, subject: '국어', coIds: [] },
            { startMin: 595, endMin: 640, subject: '국어', coIds: [] },
        ] },
        { name: '1-2', grade: 1, lessons: [{ startMin: 540, endMin: 585, subject: '음악', teacherIds: ['agent:a'], coIds: [] }] },
    ],
    people: PEOPLE,
};

let ring: KeyRing;
beforeAll(async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    ring = await buildKeyRing(parseKeys(`k1:${raw}`));
});

const loadJudge = async (_p: string, _d: string, slots: Parameters<SubDeps['loadJudge']>[2]): Promise<JudgeResult> => {
    const r = buildDayInput({
        dayIndex: 1, base: { tracks: (DAY.ok ? DAY.tracks : []).map((t) => ({ ...t, lunch: null })), people: PEOPLE },
        vps: [], fixed: [], slots, calendar: [], changes: [], classSubjects: [], periodStart: () => null, aux: [],
    });
    return r.ok ? { ok: true, input: r.input as CandInput } : { ok: false, offReason: r.offReason };
};

function setup() {
    const store = fakeStore();
    const auditRows: DbAudit[] = [];
    const clock = { now: CLOCK() };
    let n = 0;
    const deps: SubDeps = {
        auth: fakeAuth(), store, audit: { append: async (r) => { auditRows.push(r); } }, ring: async () => ring,
        loadDay: async () => DAY, loadJudge,
        memberInfo: async (_p, u) => {
            const tok = Object.keys(MEMBERS).find((t) => uid(t) === u) ?? '';
            return { personRef: MEMBERS[tok]?.personRef ?? null, name: MEMBERS[tok]?.name ?? '' };
        },
        clock: () => clock.now, newId: () => `s${++n}`, allowedOrigin: ORIGIN,
    };
    const h = subHandler(deps);
    const call = async (tok: string, method: string, path: string, body?: unknown) => {
        const res = await h(new Request(`https://ref.supabase.co/functions/v1/sub/projects/${PID}/${path}`, {
            method, headers: { Authorization: `Bearer ${tok}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        }));
        return { status: res.status, json: (await res.json()) as Record<string, any> };
    };
    // 1-1 담임 결근(국어 540·595) — B 가 올림 → s1(540) · s2(595)
    const seed = async () => {
        const r = await call('tokB', 'POST', 'register', { date: '2026-11-17', absentRef: 'homeroom:1-1', allDay: true, reason: '출장', memo: '' });
        expect(r.status).toBe(200);
    };
    return { store, auditRows, call, clock, seed };
}

describe('assign (교감·교무)', () => {
    it('confirm 없으면 400 confirm_required — 행도 감사도 그대로', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        for (const body of [{ personId: 'agent:d' }, { personId: 'agent:d', confirm: 'true' }, { personId: 'agent:d', confirm: false }]) {
            const r = await call('tokM', 'POST', 's1/assign', body);
            expect(r.status).toBe(400);
            expect(r.json.error.code).toBe('confirm_required');
        }
        expect(store.rows[0].status).toBe('대기');
        expect(auditRows).toHaveLength(0);
    });

    it('교무가 지정 → 확정 · audit 에 전(대기)·후(확정) 행 통째', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        const r = await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true });
        expect(r.status).toBe(200);
        expect(r.json.row).toMatchObject({ status: '확정', take: { takerRef: 'agent:d', takerName: '바교사' } });
        expect(store.rows.find((x) => x.id === 's1')!.status).toBe('확정');
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]).toMatchObject({ module: 'sub', action: 'assign', target: 's1', project_id: PID });
        const a = await openAudit(ring, auditRows[0]);
        expect(a.actorUserId).toBe('u-tokM');
        expect(a.before).toMatchObject({ id: 's1', status: '대기', take: null, body: { reason: '출장', absentName: '1-1 담임' }, trackName: '1-1', startMin: 540 });
        expect(a.after).toMatchObject({ id: 's1', status: '확정', take: { takerRef: 'agent:d' }, body: { reason: '출장' } });
        // 평문 열엔 사람·사유가 없다
        expect(JSON.stringify({ ...auditRows[0], body_ct: '' })).not.toMatch(/출장|바교사|u-tokM/);
    });

    it('교사 403 · 판정 걸리면 400 why_not · 이미 맡음 409 · 겹침 409 · 모르는 사람 400', async () => {
        const { call, seed } = setup();
        await seed();
        expect((await call('tokB', 'POST', 's1/assign', { personId: 'agent:d', confirm: true })).status).toBe(403);
        expect((await call('tokF', 'POST', 's1/assign', { personId: 'agent:d', confirm: true })).status).toBe(403); // 보결관리자는 force 몫
        const w = await call('tokM', 'POST', 's1/assign', { personId: 'agent:a', confirm: true });
        expect(w.status).toBe(400);
        expect(w.json.error).toMatchObject({ code: 'why_not', whyNot: ['그 시각 수업 있음 1-2'] });
        expect((await call('tokM', 'POST', 's1/assign', { personId: 'agent:zz', confirm: true })).json.error.code).toBe('unknown_person');
        expect((await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true })).status).toBe(200);
        expect((await call('tokM', 'POST', 's1/assign', { personId: 'agent:b', confirm: true })).json.error.code).toBe('already_taken');
        expect((await call('tokM', 'POST', 's9/assign', { personId: 'agent:b', confirm: true })).status).toBe(404);
    });

    it('지난 날은 assign 400 past_date', async () => {
        const { call, clock, seed } = setup();
        await seed();
        clock.now = new Date('2026-11-17T15:00:00Z'); // 서울 11-18
        expect((await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true })).json.error.code).toBe('past_date');
    });
});

describe('force (보결관리자)', () => {
    it('confirm 없으면 400 · 교무는 403', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        const r = await call('tokF', 'POST', 's1/force', { personId: 'agent:a' });
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('confirm_required');
        expect((await call('tokM', 'POST', 's1/force', { personId: 'agent:a', confirm: true })).status).toBe(403);
        expect(store.rows[0].status).toBe('대기');
        expect(auditRows).toHaveLength(0);
    });

    it('판정을 건너뛰고 지정 · audit 에 그때의 whyNot 과 전/후 행 통째', async () => {
        const { auditRows, call, seed } = setup();
        await seed();
        const r = await call('tokF', 'POST', 's1/force', { personId: 'agent:a', confirm: true }); // A 는 1-2 수업 중 — assign 이면 400
        expect(r.status).toBe(200);
        expect(r.json.row.take.takerRef).toBe('agent:a');
        const a = await openAudit(ring, auditRows[0]);
        expect(auditRows[0].action).toBe('force');
        expect(a.note).toMatchObject({ whyNot: ['그 시각 수업 있음 1-2'], pastDay: false });
        expect(a.before).toMatchObject({ status: '대기', take: null });
        expect(a.after).toMatchObject({ status: '확정', take: { takerRef: 'agent:a' } });
    });

    it('확정된 칸도 덮어 지정 · 지난 날도 가능(관리자도)', async () => {
        const { auditRows, call, clock, seed } = setup();
        await seed();
        expect((await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true })).status).toBe(200);
        clock.now = new Date('2026-11-17T15:00:00Z');
        const r = await call('tokX', 'POST', 's1/force', { personId: 'agent:b', confirm: true });
        expect(r.status).toBe(200);
        expect(r.json.row.take.takerRef).toBe('agent:b');
        const a = await openAudit(ring, auditRows[1]);
        expect(a.before).toMatchObject({ status: '확정', take: { takerRef: 'agent:d' } });
        expect(a.note).toMatchObject({ pastDay: true });
    });
});

describe('DELETE', () => {
    it('confirm 없으면 400 · 남은 403 delete_forbidden · 행 그대로', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        expect((await call('tokB', 'DELETE', 's1', {})).json.error.code).toBe('confirm_required');
        expect((await call('tokD', 'DELETE', 's1', { confirm: true })).json.error.code).toBe('delete_forbidden');
        expect(store.rows).toHaveLength(2);
        expect(auditRows).toHaveLength(0);
    });

    it('올린 이가 지움 → audit 에 행 통째(before) · after null', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        const r = await call('tokB', 'DELETE', 's1', { confirm: true });
        expect(r.status).toBe(200);
        expect(store.rows.map((x) => x.id)).toEqual(['s2']);
        const a = await openAudit(ring, auditRows[0]);
        expect(auditRows[0]).toMatchObject({ action: 'delete', target: 's1' });
        expect(a.after).toBeNull();
        expect(a.before).toMatchObject({
            id: 's1', projectId: PID, date: '2026-11-17', trackName: '1-1', startMin: 540, endMin: 585, status: '대기',
            body: { absentRef: 'homeroom:1-1', reason: '출장', registeredBy: 'u-tokB', registeredByName: '나교사' }, take: null,
        });
        expect((await call('tokB', 'DELETE', 's1', { confirm: true })).status).toBe(404);
    });

    it('지난 건: 올린 이·교무도 403 past_admin_only · 관리자만 200', async () => {
        const { store, auditRows, call, clock, seed } = setup();
        await seed();
        clock.now = new Date('2026-11-17T15:00:00Z');
        expect((await call('tokB', 'DELETE', 's1', { confirm: true })).json.error.code).toBe('past_admin_only');
        expect((await call('tokM', 'DELETE', 's1', { confirm: true })).json.error.code).toBe('past_admin_only');
        expect(store.rows).toHaveLength(2);
        expect((await call('tokX', 'DELETE', 's1', { confirm: true })).status).toBe(200);
        expect(auditRows).toHaveLength(1);
    });

    it('교무(관리 4역할)는 남의 것도 지운다 · 확정 행은 take 까지 통째 기록', async () => {
        const { auditRows, call, seed } = setup();
        await seed();
        await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true });
        expect((await call('tokM', 'DELETE', 's1', { confirm: true })).status).toBe(200);
        const a = await openAudit(ring, auditRows[1]);
        expect(a.before).toMatchObject({ status: '확정', take: { takerRef: 'agent:d', takerName: '바교사' } });
    });
});

describe('stats (읽기)', () => {
    it('관리 4역할만 · 집계 · 행·감사는 안 바뀐다', async () => {
        const { store, auditRows, call, seed } = setup();
        await seed();
        await call('tokM', 'POST', 's1/assign', { personId: 'agent:d', confirm: true });
        auditRows.length = 0;
        const before = JSON.stringify(store.rows.map((r) => ({ ...r, body_ct: [...r.body_ct], take_ct: r.take_ct && [...r.take_ct] })));
        expect((await call('tokB', 'GET', 'stats?from=2026-11-17&to=2026-11-17')).status).toBe(403);
        const r = await call('tokF', 'GET', 'stats?from=2026-11-17&to=2026-11-17');
        expect(r.status).toBe(200);
        expect(r.json).toMatchObject({
            total: 2, confirmed: 1, waiting: 1,
            byTaker: [{ takerRef: 'agent:d', takerName: '바교사', count: 1 }],
            byAbsent: [{ absentRef: 'homeroom:1-1', absentName: '1-1 담임', count: 2 }],
        });
        expect(auditRows).toHaveLength(0);
        expect(JSON.stringify(store.rows.map((x) => ({ ...x, body_ct: [...x.body_ct], take_ct: x.take_ct && [...x.take_ct] })))).toBe(before);
        expect((await call('tokF', 'POST', 'stats', {})).status).toBe(405);
        expect((await call('tokF', 'GET', 'stats?from=2026-11-17&to=2027-01-18')).json.error.code).toBe('range_too_long');
    });
});

describe('순수 판정', () => {
    const mem = (roles: Member['roles'], userId = 'u-z'): Member => ({ userId, projectId: PID, roles });
    const row = (over: Partial<SubSlotRow['body']> = {}, status: SubSlotRow['status'] = '대기'): SubSlotRow => ({
        id: 'r1', projectId: PID, date: '2026-11-17', trackName: '1-1', startMin: 540, endMin: 585, status, createdAt: '', updatedAt: '',
        body: { absentRef: 'agent:a', absentName: '가', registeredByName: '나', registeredBy: 'u-b', label: '', subject: null, reason: '', memo: '', allDay: true, preApproved: false, ...over },
        take: status === '확정' ? { takerRef: 'agent:d', takerName: '바', takerUserId: null, confirmedAt: '' } : null,
    });
    it('requireConfirm · parseAssignBody', () => {
        expect(() => requireConfirm(null)).toThrow();
        expect(() => requireConfirm({ confirm: 1 })).toThrow(/확인/);
        expect(requireConfirm({ confirm: true })).toEqual({ confirm: true });
        expect(() => parseAssignBody({ confirm: true })).toThrow();
        expect(parseAssignBody({ confirm: true, personId: ' agent:a ' })).toEqual({ personId: 'agent:a', confirm: true });
    });
    it('canDelete: 지난 건은 관리자만 · 결근자 본인 통과 · 남은 거절', () => {
        expect(canDelete(row(), mem(['교사'], 'u-b'), null, false)).toBe('ok');
        expect(canDelete(row(), mem(['교사']), 'agent:a', false)).toBe('ok');
        expect(canDelete(row(), mem(['교사']), 'agent:q', false)).toBe('forbidden');
        expect(canDelete(row(), mem(['교무']), null, true)).toBe('past_admin_only');
        expect(canDelete(row(), mem(['관리자']), null, true)).toBe('ok');
    });
    it('computeStats: 빈 기간 · 많은 순', () => {
        expect(computeStats([], 'a', 'b')).toEqual({ from: 'a', to: 'b', total: 0, confirmed: 0, waiting: 0, byTaker: [], byAbsent: [] });
        const s = computeStats([row(), row({ absentRef: 'agent:q', absentName: '큐' }, '확정'), row({ absentRef: 'agent:q', absentName: '큐' })], 'a', 'b');
        expect(s.byAbsent.map((x) => [x.absentRef, x.count])).toEqual([['agent:q', 2], ['agent:a', 1]]);
        expect(s).toMatchObject({ total: 3, confirmed: 1, waiting: 2 });
    });
});
