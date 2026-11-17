// B8 검사: 409 need_overwrite · 400 past_date(서울) · 62일 한도 · mine 은 자기 것만. ⛔ 실명 — 가짜 이름만.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthClient } from '../_shared/auth.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { checkRange, planSlots, subHandler, type DayResult, type SubDeps, type SubStore } from './handler.ts';
import type { DbSlot } from './rows.ts';

const ORIGIN = 'https://tt.example.org';
const PID = 'p1';
// 서울 2026-11-17 08:59 = UTC 2026-11-16 23:59 (UTC 로 재면 「오늘」이 11-16)
const CLOCK = () => new Date('2026-11-16T23:59:00Z');

type MemberRow = { roles: string[]; active: boolean; personRef: string | null; name: string };
const MEMBERS: Record<string, MemberRow> = {
    tokA: { roles: ['교사'], active: true, personRef: 'agent:a', name: '가교사' },
    tokB: { roles: ['교사'], active: true, personRef: 'agent:b', name: '나교사' },
    tokM: { roles: ['교무'], active: true, personRef: null, name: '다교무' },
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
                            return { data: pid === PID && tok ? { roles: MEMBERS[tok].roles, active: MEMBERS[tok].active } : null, error: null };
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
            for (const a of add) {
                if (rows.some((x) => x.project_id === a.project_id && x.date === a.date && x.track_name === a.track_name && x.start_min === a.start_min)) return 'conflict';
                rows.push(a);
            }
            return 'ok';
        },
    };
}

const DAY: DayResult = {
    ok: true,
    tracks: [
        { name: '1-1', grade: 1, lessons: [
            { startMin: 540, endMin: 585, subject: '국어', coIds: ['agent:c'] },
            { startMin: 595, endMin: 640, subject: '음악', teacherIds: ['agent:a'], coIds: [] },
        ] },
        { name: '1-2', grade: 1, lessons: [{ startMin: 540, endMin: 585, subject: '음악', teacherIds: ['agent:a'], coIds: [] }] },
    ],
    people: [
        { id: 'agent:a', name: '가교사', kind: '전담' },
        { id: 'agent:c', name: '마강사', kind: '강사' },
        { id: 'user:vp', name: '라교감', kind: '교감' },
    ],
};

let ring: KeyRing;
beforeAll(async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    ring = await buildKeyRing(parseKeys(`k1:${raw}`));
});

function setup(day: DayResult = DAY) {
    const store = fakeStore();
    let n = 0;
    const deps: SubDeps = {
        auth: fakeAuth(), store, ring: async () => ring, loadDay: async () => day,
        memberInfo: async (_p, u) => {
            const tok = Object.keys(MEMBERS).find((t) => uid(t) === u) ?? '';
            return { personRef: MEMBERS[tok]?.personRef ?? null, name: MEMBERS[tok]?.name ?? '' };
        },
        clock: CLOCK, newId: () => `s${++n}`, allowedOrigin: ORIGIN,
    };
    const h = subHandler(deps);
    const call = async (tok: string, method: string, path: string, body?: unknown) => {
        const res = await h(new Request(`https://ref.supabase.co/functions/v1/sub/projects/${PID}/${path}`, {
            method, headers: { Authorization: `Bearer ${tok}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        }));
        return { status: res.status, json: (await res.json()) as Record<string, any> };
    };
    return { store, call };
}

const reg = (over: Record<string, unknown> = {}) => ({ date: '2026-11-17', absentRef: 'homeroom:1-1', allDay: true, reason: '출장', memo: '', ...over });

describe('sub register', () => {
    it('담임 결근: 전담 칸은 건너뜀 · 행은 암호문으로 저장', async () => {
        const { store, call } = setup();
        const r = await call('tokB', 'POST', 'register', reg());
        expect(r.status).toBe(200);
        expect(r.json.rows.map((x: any) => [x.trackName, x.startMin, x.status])).toEqual([['1-1', 540, '대기']]);
        expect(r.json.skipped).toEqual([{ trackName: '1-1', startMin: 595, endMin: 640, why: '전담 수업 시간' }]);
        expect(r.json.rows[0].body).toMatchObject({ registeredBy: 'u-tokB', registeredByName: '나교사', absentName: '1-1 담임' });
        expect(store.rows).toHaveLength(1);
        expect(new TextDecoder().decode(store.rows[0].body_ct)).not.toContain('출장');
    });
    it('같은 자리 다시 올리면 409 need_overwrite · overwrite:true 면 덮는다', async () => {
        const { store, call } = setup();
        await call('tokB', 'POST', 'register', reg());
        const again = await call('tokB', 'POST', 'register', reg({ reason: '병가' }));
        expect(again.status).toBe(409);
        expect(again.json.error).toMatchObject({ code: 'need_overwrite', existing: [{ trackName: '1-1', startMin: 540, taken: false }] });
        expect(store.rows).toHaveLength(1);
        const ok = await call('tokB', 'POST', 'register', reg({ reason: '병가', overwrite: true }));
        expect(ok.status).toBe(200);
        expect(ok.json.replaced).toBe(1);
        const list = await call('tokA', 'GET', 'list?from=2026-11-17&to=2026-11-17');
        expect(list.json.rows.map((x: any) => x.body.reason)).toEqual(['병가']);
    });
    it('덮어쓸 권한 없으면 403 overwrite_forbidden · 같은 결근자·관리 역할은 통과', async () => {
        const { call } = setup();
        await call('tokA', 'POST', 'register', reg());                                   // A 가 올린 1-1 담임(540)
        const forb = await call('tokB', 'POST', 'register', reg({ absentRef: 'agent:c', overwrite: true }));
        expect(forb.status).toBe(403);
        expect(forb.json.error.code).toBe('overwrite_forbidden');
        expect((await call('tokB', 'POST', 'register', reg({ reason: 'x', overwrite: true }))).status).toBe(200); // 같은 결근자
        expect((await call('tokM', 'POST', 'register', reg({ absentRef: 'agent:c', overwrite: true }))).status).toBe(200);
    });
    it('지난 날은 400 past_date — 서울 기준(UTC 로는 「오늘」인 11-16)', async () => {
        const { call } = setup();
        const r = await call('tokA', 'POST', 'register', reg({ date: '2026-11-16' }));
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('past_date');
        expect((await call('tokA', 'GET', 'reg-options?date=2026-11-16')).json.error.code).toBe('past_date');
        expect((await call('tokA', 'POST', 'register', reg({ date: '2026-11-17' }))).status).toBe(200);
    });
    it('쉬는 날 400 no_school_day · 교감 결근 400 · 수업 없음 400 no_lessons', async () => {
        expect((await setup({ ok: false, offReason: '재량휴업일' }).call('tokA', 'POST', 'register', reg())).json.error.code).toBe('no_school_day');
        const { call } = setup();
        expect((await call('tokA', 'POST', 'register', reg({ absentRef: 'user:vp' }))).json.error.code).toBe('absent_not_allowed');
        expect((await call('tokA', 'POST', 'register', reg({ allDay: false, times: [{ startMin: 900, endMin: 945 }] }))).json.error.code).toBe('no_lessons');
    });
    it('사유 100자 넘으면 400 · 비구성원 403', async () => {
        const { call } = setup();
        expect((await call('tokA', 'POST', 'register', reg({ reason: 'x'.repeat(101) }))).status).toBe(400);
        expect((await call('nobody', 'POST', 'register', reg())).status).toBe(401);
    });
});

describe('sub list · mine · reg-options', () => {
    it('62일 한도: 62일은 통과 · 63일은 400 range_too_long', async () => {
        expect(checkRange('2026-11-17', '2027-01-17')).toEqual({ from: '2026-11-17', to: '2027-01-17' });
        const { call } = setup();
        const r = await call('tokA', 'GET', 'list?from=2026-11-17&to=2027-01-18');
        expect(r.status).toBe(400);
        expect(r.json.error).toMatchObject({ code: 'range_too_long', limit: 62, days: 63 });
        expect((await call('tokA', 'GET', 'mine?from=2026-11-17&to=2027-01-18')).status).toBe(400);
        expect((await call('tokA', 'GET', 'list?from=2026-11-20&to=2026-11-19')).status).toBe(400);
    });
    it('mine 은 자기 것만(결근자 본인·올린 이) — 남의 것은 안 보인다', async () => {
        const { call } = setup();
        await call('tokM', 'POST', 'register', reg({ absentRef: 'agent:a', allDay: true }));          // A 결근(1-1 595, 1-2 540)
        await call('tokB', 'POST', 'register', reg());                                                // B 가 올린 1-1 담임(540)
        const a = await call('tokA', 'GET', 'mine');
        expect(a.json.rows.map((x: any) => [x.trackName, x.startMin, x.mineAs])).toEqual([
            ['1-2', 540, ['absent']], ['1-1', 595, ['absent']],
        ]);
        const b = await call('tokB', 'GET', 'mine');
        expect(b.json.rows.map((x: any) => [x.trackName, x.startMin, x.mineAs])).toEqual([['1-1', 540, ['registered']]]);
        expect((await call('tokA', 'GET', 'list?from=2026-11-17&to=2026-11-17')).json.rows).toHaveLength(3);
    });
    it('reg-options: 반·교시 · 결근자 후보에서 교감 빠짐', async () => {
        const { call } = setup();
        const r = await call('tokA', 'GET', 'reg-options?date=2026-11-17');
        expect(r.status).toBe(200);
        expect(r.json.absentees.map((p: any) => p.id)).toEqual(['homeroom:1-1', 'homeroom:1-2', 'agent:a', 'agent:c']);
        expect(r.json.tracks[0].lessons[1]).toEqual({ startMin: 595, endMin: 640, subject: '음악' });
    });
    it('B9·B10 자리(:id 등)는 아직 404 · 방식 틀리면 405', async () => {
        const { call } = setup();
        expect((await call('tokA', 'GET', 's1')).status).toBe(404);
        expect((await call('tokA', 'GET', 'register')).status).toBe(405);
    });
    it('planSlots: 전담은 teacherIds·coIds 칸만', () => {
        const out = planSlots(DAY.ok ? DAY.tracks : [], 'agent:a', true, []);
        expect(out.slots.map((s) => `${s.trackName}@${s.startMin}`)).toEqual(['1-1@595', '1-2@540']);
    });
});
