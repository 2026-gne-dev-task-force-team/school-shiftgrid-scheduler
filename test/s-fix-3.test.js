import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { findOverlaps, periodTime } from '../server/violations.js';
import { applySmall, generate } from '../web/src/gen/core.js';
import { makeSoftScore, resolveParams } from '../web/src/gen/soft-adapter.js';
import { sampleSchool } from '../web/src/gen/sample.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);
const T = (s, e) => ({ start: s, end: e });

test('겹침: 교시 번호가 달라도 시각이 겹치면 잡는다(학년마다 교시 시각이 다름)', () => {
  const periods = {
    grades: {
      1: { periods: 5, times: [T('09:00', '09:40'), T('09:50', '10:30'), T('10:40', '11:20'), T('11:30', '12:10'), T('13:00', '13:40')] },
      3: { periods: 5, times: [T('09:00', '09:40'), T('09:50', '10:30'), T('10:40', '11:20'), T('12:50', '13:30'), T('13:40', '14:20')] },
    },
  };
  const gradeOf = { 1: 1, 2: 3 };
  const cells = [
    { classroom_id: 1, weekday: 1, period: 5, membership_id: 7 }, // 13:00~13:40
    { classroom_id: 2, weekday: 1, period: 4, membership_id: 7 }, // 12:50~13:30
  ];
  assert.equal(findOverlaps(cells).length, 0); // 옛 교시 기준은 놓쳤다
  const f = findOverlaps(cells, { periods, gradeOf });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'teacher_overlap');
  assert.match(f[0].detail, /12:50~13:40/);
  // 같은 교시 번호인데 시각은 안 겹침 → 겹침 아님
  const same = [{ classroom_id: 1, weekday: 1, period: 4, membership_id: 7 }, { classroom_id: 2, weekday: 1, period: 4, membership_id: 7 }];
  assert.equal(findOverlaps(same, { periods, gradeOf }).length, 0);
  assert.deepEqual(periodTime(periods, 3, 4), { start: 770, end: 810 });
});

test('겹침: 시각이 없으면 점심 자리 시각 칸 → 그것도 없으면 교시 번호', () => {
  const periods = { grades: { 3: { periods: 6, lunchAfter: 3 }, 5: { periods: 6, lunchAfter: 5 } } };
  const gradeOf = { 1: 3, 2: 5 };
  // 3학년 4교시(점심 뒤 → 시각 칸 5) = 5학년 5교시(시각 칸 5)
  const cells = [{ classroom_id: 1, weekday: 2, period: 4, membership_id: 9 }, { classroom_id: 2, weekday: 2, period: 5, membership_id: 9 }];
  assert.equal(findOverlaps(cells, { periods, gradeOf }).length, 1);
  assert.equal(findOverlaps(cells, { periods: {}, gradeOf }).length, 0);
  const same = [{ classroom_id: 1, weekday: 2, period: 2, membership_id: 9 }, { classroom_id: 2, weekday: 2, period: 2, membership_id: 9 }];
  assert.equal(findOverlaps(same, { periods: {}, gradeOf }).length, 1);
});

test('겹침: 복식 묶음 같은 교과는 겹침 아님 · 겸임 다른 기관 수업과는 겹침', () => {
  const cells = [
    { classroom_id: 1, weekday: 1, period: 1, membership_id: 5, subject_id: 3 },
    { classroom_id: 2, weekday: 1, period: 1, membership_id: 5, subject_id: 3 },
  ];
  assert.equal(findOverlaps(cells).length, 1);
  assert.equal(findOverlaps(cells, { combined: [[1, 2]] }).length, 0);
  assert.equal(findOverlaps([cells[0], { ...cells[1], subject_id: 4 }], { combined: [[1, 2]] }).length, 1);
  // 겸임: 우리 학교 1교시 09:00~09:40, 다른 학교 수업 09:30~10:10 → 겹침
  const periods = { times: [T('09:00', '09:40'), T('09:50', '10:30')] };
  const ext = [{ membership_id: 5, weekday: 1, period: 2, start: 570, end: 610 }];
  const f = findOverlaps([cells[0]], { periods, gradeOf: { 1: 1 }, external: ext });
  assert.equal(f.length, 1);
  assert.equal(f[0].other_org, true);
  // 시각이 없으면 교시 번호로 — 다른 교시라 겹침 아님
  assert.equal(findOverlaps([cells[0]], { external: ext }).length, 0);
});

test('생성기: 담임 교과 빈 교사 칸은 담임으로 · 복식 묶음은 한 칸에 같이 · 설정으로 뒤집기', () => {
  const classrooms = [{ id: 1, grade: 1, class_no: 1, homeroom_membership_id: 50 }, { id: 2, grade: 2, class_no: 1, homeroom_membership_id: 50 }, { id: 3, grade: 3, class_no: 1, homeroom_membership_id: 51 }];
  const lines = [
    { classroom_id: 1, membership_id: null, subject_id: 1, weekly_hours: 4 },
    { classroom_id: 2, membership_id: null, subject_id: 1, weekly_hours: 5 },
    { classroom_id: 3, membership_id: null, subject_id: 1, weekly_hours: 4 },
    { classroom_id: 1, membership_id: 60, subject_id: 2, weekly_hours: 2 },
  ];
  const small = { enabled: true, homeroom_subject_ids: [1], combined: [{ name: '1·2학년', classroom_ids: [1, 2] }] };
  const input = { classrooms, periods: { grades: { 1: { periods: 5 }, 2: { periods: 5 }, 3: { periods: 5 } } }, lines, pins: [], small };
  const s = applySmall(input);
  assert.deepEqual(s.lines.slice(0, 3).map((l) => l.membership_id), [50, 50, 51]);
  assert.equal(s.joint.length, 1);
  assert.equal(s.joint[0].hours, 4);
  const r = generate(input, { k: 2, perMs: 500 }).candidates[0];
  assert.equal(r.hard, 0);
  const at = (c) => r.cells.filter((x) => x.classroom_id === c && x.subject_id === 1).map((x) => `${x.weekday}:${x.period}`);
  const c1 = new Set(at(1));
  assert.equal(c1.size, 4);
  assert.equal(at(2).filter((k) => c1.has(k)).length, 4); // 묶인 4시간은 같은 칸
  assert.equal(at(2).length, 5); // 남는 1시간은 따로
  assert.equal(findOverlaps(r.cells, { combined: [[1, 2]] }).length, 0);
  // 뒤집기: 따로 놓기 · 담임 안 채우기
  const off = applySmall({ ...input, small: { ...small, combined_mode: 'separate', homeroom_fill: false } });
  assert.equal(off.joint.length, 0);
  assert.equal(off.lines[0].membership_id, null);
  // 꺼져 있으면 아무것도 안 한다
  assert.equal(applySmall({ ...input, small: { ...small, enabled: false } }).joint.length, 0);
});

test('권장 점수: 회피 칸·숫자 값·진도 순환 교과가 실제로 점수에 들어간다', () => {
  const input = { classrooms: [{ id: 1, grade: 1, class_no: 1 }, { id: 2, grade: 1, class_no: 2 }], periods: { grades: {} }, lines: [{ subject_id: 9, sync_progress: true }], tiers: { 7: 1 } };
  const cells = [{ classroom_id: 1, weekday: 1, period: 1, subject_id: 9, membership_id: 7 }, { classroom_id: 2, weekday: 1, period: 2, subject_id: 9, membership_id: 7 }];
  const base = makeSoftScore(input)({ cells });
  const avoided = makeSoftScore({ ...input, weights: { avoid: { 7: [{ weekday: 1, period: 1 }] } } })({ cells });
  assert.equal(avoided - base, 3 * 300); // 선호(3) × 티어1 회피 배수(300)
  assert.deepEqual(resolveParams(undefined, input.lines).roundSubjects, [9]);
  // 진도 순환: 2반이 1반보다 먼저면 위반
  const swapped = [{ ...cells[0], period: 2 }, { ...cells[1], period: 1 }];
  assert.ok(makeSoftScore(input)({ cells: swapped }) > base);
  // 숫자 값: 연속 1교시 제한이면 2연속에 점수가 붙는다
  assert.ok(makeSoftScore({ ...input, params: { maxConsec: 1 } })({ cells }) > base);
  // 큰 시료에서도 생성이 돈다
  const big = sampleSchool();
  const r = generate(big, { k: 1, perMs: 3000, softScore: makeSoftScore(big) });
  assert.equal(r.candidates[0].hard, 0);
});

test('S-fix-7 권장 점수: 복식 묶음 칸은 교사 기준 규칙에서 한 번으로 센다', () => {
  const input = { classrooms: [{ id: 1, grade: 1, class_no: 1 }, { id: 2, grade: 1, class_no: 2 }], periods: { grades: {} }, lines: [], tiers: { 7: 2 } };
  const cells = [1, 2].flatMap((c) => [1, 2].map((p) => ({ classroom_id: c, weekday: 1, period: p, subject_id: 8 + p, membership_id: 7 })));
  const small = { enabled: true, combined: [{ classroom_ids: [1, 2] }] };
  const one = [{ ...cells[0] }, { ...cells[1] }];
  const params = { maxConsec: 1 };
  const joint = makeSoftScore({ ...input, small, params })({ cells });
  assert.equal(joint, makeSoftScore({ ...input, params })({ cells: one }));
  assert.ok(makeSoftScore({ ...input, params })({ cells }) >= joint);
});

test('S-fix-3 DB: 오늘 적용 확정본 고르기 · 겸임 다른 기관 겹침 · 적용본 내 시간표', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const { appliedTimetable } = await import('../server/applied.js');
  const { findOverlapsFor } = await import('../server/violations.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f3${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const mkOrg = async (n, pc) => (await pool.query(`INSERT INTO org (name, kind, period_config) VALUES ($1, '초', $2) RETURNING id`, [`${tag}-${n}`, JSON.stringify(pc)])).rows[0].id;
  const times = (list) => list.map(([s, e]) => ({ start: s, end: e }));
  const orgA = await mkOrg('A', { grades: { 1: { periods: 2, times: times([['09:00', '09:40'], ['09:50', '10:30']]) } } });
  const orgB = await mkOrg('B', { grades: { 1: { periods: 2, times: times([['09:30', '10:10'], ['10:20', '11:00']]) } } });
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ('겸임', $1, $2, FALSE) RETURNING id`, [`${tag}-k`, hash])).rows[0].id;
  const mA = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자') RETURNING id`, [orgA, u])).rows[0].id;
  const mB = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'교직원') RETURNING id`, [orgB, u])).rows[0].id;
  const termOf = async (o) => (await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [o])).rows[0].id;
  const tA = await termOf(orgA);
  const tB = await termOf(orgB);
  const clsA = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,1) RETURNING id`, [orgA, tA])).rows[0].id;
  const clsB = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,1) RETURNING id`, [orgB, tB])).rows[0].id;
  const tt = async (o, term, name, status, starts) => (await pool.query(`INSERT INTO timetable (org_id, term_id, name, status, starts_on, confirmed_at) VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 = '확정' THEN now() END) RETURNING id`, [o, term, name, status, starts])).rows[0].id;
  const oldB = await tt(orgB, tB, '옛', '확정', '2026-03-02');
  const curB = await tt(orgB, tB, '지금', '확정', '2026-09-01');
  await tt(orgB, tB, '앞날', '확정', '2099-03-02');
  await tt(orgB, tB, '시안', '시안', null);
  // B 기관 「지금」 확정본: 월 1교시(09:30~10:10) 겸임 교사 수업 · 옛 확정본엔 월 2교시
  await pool.query(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, membership_id) VALUES ($1,$2,$3,1,1,$4), ($1,$5,$3,1,2,$4)`, [orgB, curB, clsB, mB, oldB]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    for (const o of [orgA, orgB]) for (const tb of ['cell', 'timetable', 'classroom', 'term', 'audit_log', 'membership']) await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [o]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = ANY($1::bigint[])`, [[orgA, orgB]]);
    await pool.end();
  });

  await t.test('오늘 적용 확정본: 시작일이 오늘 이전 중 가장 늦은 것', async () => {
    assert.equal(String((await appliedTimetable(pool, orgB, '2026-11-18')).id), String(curB));
    assert.equal(String((await appliedTimetable(pool, orgB, '2026-05-01')).id), String(oldB));
    assert.equal(String((await appliedTimetable(pool, orgB, '2026-09-01')).id), String(curB)); // 당일 포함
    assert.equal(await appliedTimetable(pool, orgB, '2026-01-01'), null);
  });

  await t.test('겸임: A 기관 월 1교시(09:00~09:40)가 B 기관 적용본 09:30~10:10 과 겹친다', async () => {
    const cell = { classroom_id: Number(clsA), weekday: 1, period: 1, membership_id: Number(mA) };
    const f = await findOverlapsFor(pool, orgA, [cell], { date: '2026-11-18' });
    assert.equal(f.length, 1);
    assert.equal(f[0].other_org, true);
    // 2교시(09:50~10:30)도 B 「지금」 1교시(~10:10)와 겹침 · 옛 확정본(B 2교시)은 안 본다
    assert.equal((await findOverlapsFor(pool, orgA, [{ ...cell, period: 2 }], { date: '2026-11-18' })).length, 1);
    assert.equal((await findOverlapsFor(pool, orgA, [cell], { date: '2026-05-01' })).length, 0); // 옛것: B 2교시 10:20~ 와 안 겹침
  });

  await t.test('S-fix-7 생성 재료: 겸임 교사의 다른 기관 확정본 칸이 금지 칸으로 · 다른 기관 내용은 안 넘김', async () => {
    const { externalBlockPins } = await import('../server/routes/generate.js');
    const pc = (await pool.query(`SELECT period_config FROM org WHERE id = $1`, [orgA])).rows[0].period_config;
    const pins = await externalBlockPins(pool, orgA, pc, '2026-11-18');
    assert.deepEqual(pins.map((p) => [p.target_kind, p.target_id, p.weekday, p.period, p.kind]).sort(), [['교사', Number(mA), 1, 1, '금지'], ['교사', Number(mA), 1, 2, '금지']]);
    assert.ok(pins.every((p) => !('classroom_id' in p) && p.subject_id === null));
    assert.deepEqual(await externalBlockPins(pool, orgA, pc, '2026-01-01'), []);
  });

  await t.test('경로: /timetables/applied/mine 은 적용 확정본의 내 칸', async () => {
    let cookie = ''; let csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    await call('GET', '/api/auth/session');
    assert.equal((await call('POST', '/api/auth/login', { orgId: orgB, loginId: `${tag}-k`, password: 'pw-test-1234' })).status, 200);
    const r = await call('GET', `/api/orgs/${orgB}/timetables/applied/mine?date=2026-11-18`);
    assert.equal(r.status, 200);
    assert.equal(r.json.timetable.name, '지금');
    assert.deepEqual(r.json.cells.map((c) => c.period), [1]);
    assert.equal((await call('GET', `/api/orgs/${orgB}/timetables/applied?date=2026-01-01`)).json.timetable, null);
  });
});
