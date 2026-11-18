import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { clockOf, generate, groupRR, prepare, moveConflicts } from '../web/src/gen/core.js';
import { sampleSchool } from '../web/src/gen/sample.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

// 생성기와 따로 짠 검사기 — 생성기가 「됐다」 해도 칸을 직접 센다
function audit(input, cells) {
  const g = Object.fromEntries(input.classrooms.map((c) => [c.id, input.periods.grades[c.grade]]));
  const errs = [];
  const seen = new Map();
  const add = (k, what) => { if (seen.has(k)) errs.push(what); seen.set(k, 1); };
  for (const c of cells) {
    const cfg = g[c.classroom_id];
    if (c.period > cfg.periods) errs.push(`범위 밖 ${c.classroom_id} ${c.period}`);
    const clock = clockOf(cfg.lunchAfter, c.period);
    add(`c:${c.classroom_id}:${c.weekday}:${c.period}`, '반 겹침');
    if (c.membership_id) add(`t:${c.membership_id}:${c.weekday}:${clock}`, `교사 겹침 ${c.membership_id} ${c.weekday}/${clock}`);
    if (c.special_room_id) add(`r:${c.special_room_id}:${c.weekday}:${clock}`, '특별실 겹침');
  }
  // 시수
  const want = new Map();
  for (const l of input.lines) { const k = `${l.classroom_id}:${l.subject_id}:${l.membership_id}`; want.set(k, (want.get(k) || 0) + l.weekly_hours); }
  for (const c of cells) { const k = `${c.classroom_id}:${c.subject_id}:${c.membership_id}`; if (want.has(k)) want.set(k, want.get(k) - 1); }
  for (const [k, v] of want) if (v !== 0) errs.push(`시수 어긋남 ${k} ${v}`);
  // 고정·금지
  for (const p of input.pins) {
    if (p.target_kind === '교사' && cells.some((c) => c.membership_id === p.target_id && c.weekday === p.weekday && c.period === p.period)) errs.push('교사 불가 시간');
    if (p.target_kind === '반' && p.kind === '고정' && !cells.some((c) => c.classroom_id === p.target_id && c.weekday === p.weekday && c.period === p.period && c.subject_id === p.subject_id)) errs.push('반 고정 빠짐');
    if (p.target_kind === '특별실' && cells.some((c) => c.special_room_id === p.target_id && c.weekday === p.weekday && clockOf(g[c.classroom_id].lunchAfter, c.period) === p.period)) errs.push('특별실 불가 시간');
  }
  return errs;
}

test('시각 칸: 점심 뒤 교시는 한 칸 밀린다 — 3학년(3교시 뒤 점심) 4교시 = 5학년(5교시 뒤) 5교시', () => {
  assert.equal(clockOf(3, 4), 5);
  assert.equal(clockOf(5, 5), 5);
  assert.equal(clockOf(0, 4), 4);
});

test('진도 맞춤: 차시 번호가 아니라 반별 시간순 순번(ord)으로 센다', () => {
  const input = {
    classrooms: [{ id: 1, grade: 5 }, { id: 2, grade: 5 }],
    periods: { grades: { 5: { periods: 6, lunchAfter: 0 } } },
    lines: [1, 2].map((c) => ({ classroom_id: c, membership_id: 9, subject_id: 4, weekly_hours: 2, sync_progress: true })),
    pins: [],
  };
  const prep = prepare(input);
  const g = [...prep.groups.values()][0];
  const [a1, a2, b1, b2] = g;
  // 반1: 월1·화1 / 반2: 월2·화2 → 순서 맞음
  Object.assign(a1, { d: 0, p: 1 }); Object.assign(a2, { d: 1, p: 1 }); Object.assign(b1, { d: 0, p: 2 }); Object.assign(b2, { d: 1, p: 2 });
  assert.equal(groupRR(prep, g), 0);
  // 반1 이 둘째 세션을 반2 첫 세션보다 먼저 → 위반
  Object.assign(a2, { d: 0, p: 3 }); Object.assign(b1, { d: 0, p: 4 });
  assert.ok(groupRR(prep, g) > 0);
});

test('생성: 가짜 51반 — 필수 규칙을 따로 센 검사기로도 0 · 순위대로 줄 선다', () => {
  const input = sampleSchool();
  const r = generate(input, { k: 2, perMs: 3000, seed: 7 });
  const best = r.candidates[0];
  assert.equal(best.hard, 0, '못 놓은 시수');
  assert.deepEqual(audit(input, best.cells), []);
  assert.ok(r.candidates[0].hard <= r.candidates[1].hard);
});

test('생성: 성립이 안 되는 입력이면 못 놓은 시수를 목록으로 돌려주고 결과는 버리지 않는다', () => {
  const input = {
    classrooms: [{ id: 1, grade: 1 }, { id: 2, grade: 1 }],
    periods: { grades: { 1: { periods: 2, lunchAfter: 0 } } },
    // 한 교사가 두 반에 하루 2교시 × 5일 = 10칸 중 각 반 8시간 → 교사 16시간이 필요한데 10칸뿐
    lines: [1, 2].map((c) => ({ classroom_id: c, membership_id: 5, subject_id: 1, weekly_hours: 8 })),
    pins: [],
  };
  const r = generate(input, { k: 1, perMs: 300 });
  assert.equal(r.candidates[0].hard, 6);
  assert.equal(r.candidates[0].cells.length, 10);
  assert.deepEqual(audit({ ...input, lines: [] }, r.candidates[0].cells), []);
});

test('수정 모드: 같은 시각 칸에 같은 교사가 생기면 겹침으로 본다(교시가 달라도)', () => {
  const info = { 1: { L: 3, P: 6 }, 2: { L: 5, P: 6 } };
  const cells = [
    { classroom_id: 1, weekday: 1, period: 1, membership_id: 9 },
    { classroom_id: 2, weekday: 1, period: 5, membership_id: 9 },
  ];
  // 반1 1교시 → 4교시(시각 5) 로 옮기면 반2 5교시(시각 5)와 겹침
  assert.deepEqual(moveConflicts(cells, info, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 4 }).map((x) => x.rule), ['teacher_overlap']);
  assert.equal(moveConflicts(cells, info, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 2 }).length, 0);
});

test('S-2 경로: 생성 시안 저장 · 복제 · 확정(여럿 허용) · 지우기', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `g${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ('adm',$1,$2,FALSE) RETURNING id`, [`${tag}-adm`, hash])).rows[0].id;
  const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자') RETURNING id`, [org, u])).rows[0].id;
  const term = (await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [org])).rows[0].id;
  const c1 = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,1) RETURNING id`, [org, term])).rows[0].id;
  const c2 = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,2) RETURNING id`, [org, term])).rows[0].id;
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await pool.query(`DELETE FROM cell WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM timetable WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM classroom WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM term WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM audit_log WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [org]);
    await pool.end();
  });
  let cookie = '';
  let csrf = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const json = await res.json().catch(() => null);
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
  await call('GET', '/api/auth/session');
  assert.equal((await call('POST', '/api/auth/login', { orgId: org, loginId: `${tag}-adm`, password: 'pw-test-1234' })).status, 200);
  const P = `/api/orgs/${org}`;
  const inp = await call('GET', `${P}/gen/input`);
  assert.equal(inp.status, 200);
  assert.equal(inp.json.classrooms.length, 2);
  // 교사 겹침이 있어도 저장된다(거부 아님 · 목록으로)
  const cells = [
    { classroom_id: c1, weekday: 1, period: 1, subject_id: null, membership_id: m },
    { classroom_id: c2, weekday: 1, period: 1, subject_id: null, membership_id: m },
  ];
  const g = await call('POST', `${P}/timetables/generated`, { name: '생성 1', cells, gen_info: { rank: 0, hard: 0, rr: 0 } });
  assert.equal(g.status, 201);
  assert.ok(g.json.violations.some((v) => v.rule === 'teacher_overlap'));
  assert.equal((await call('POST', `${P}/timetables/generated`, { name: '생성 1', cells: [] })).status, 409, '같은 이름 둘');
  assert.equal((await call('POST', `${P}/timetables/generated`, { name: '생성 2', cells: [cells[0], cells[0]] })).status, 409, '같은 칸 둘');
  const cp = await call('POST', `${P}/timetables/${g.json.id}/copy`, { name: '생성 1 사본' });
  assert.equal(cp.status, 201);
  assert.equal((await call('GET', `${P}/timetables/${cp.json.id}`)).json.cells.length, 2);
  // 맞바꾸기: 트랜잭션 한 번 — 칸 둘이 서로 바뀐다 · 없는 반이면 아무것도 안 바뀐다
  const sw = await call('POST', `${P}/timetables/${g.json.id}/cells/swap`, { from: { classroom_id: c1, weekday: 1, period: 1 }, to: { classroom_id: c1, weekday: 2, period: 3 } });
  assert.equal(sw.status, 200);
  const after = (await call('GET', `${P}/timetables/${g.json.id}`)).json.cells;
  assert.ok(after.some((x) => x.classroom_id === c1 && x.weekday === 2 && x.period === 3 && x.membership_id === m), '옮겨 간 칸');
  assert.ok(!after.some((x) => x.classroom_id === c1 && x.weekday === 1 && x.period === 1), '빈 자리가 된 칸');
  assert.equal((await call('POST', `${P}/timetables/${g.json.id}/cells/swap`, { from: { classroom_id: 999999999, weekday: 1, period: 1 }, to: { classroom_id: c1, weekday: 2, period: 3 } })).status, 404);
  assert.equal((await call('GET', `${P}/timetables/${g.json.id}`)).json.cells.length, after.length);
  const c1r = await call('POST', `${P}/timetables/${g.json.id}/confirm`, { starts_on: '2026-09-01' });
  assert.equal(c1r.json.status, '확정');
  const c2r = await call('POST', `${P}/timetables/${cp.json.id}/confirm`, { starts_on: '2026-09-01' });
  assert.equal(c2r.status, 200, '확정은 여럿이어도 된다');
  assert.equal(c2r.json.notes.length, 1, '같은 시작일은 알림만');
  assert.equal((await call('DELETE', `${P}/timetables/${cp.json.id}`)).status, 200);
  assert.equal((await call('GET', `${P}/timetables/${cp.json.id}`)).status, 404);
});
