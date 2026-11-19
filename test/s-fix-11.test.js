import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DEFAULTS, dutyFromText, dutyKnown } from '../server/orgConfig.js';
import { findOverlaps } from '../server/violations.js';
import { findOverlaps as webOverlaps } from '../web/src/gen/overlap.js';
import { RULES } from '../server/rules.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('직무 한 목록: 옛 말 전담·비교과는 전담 · 목록 밖은 그대로(경고 몫)', () => {
  assert.equal(dutyFromText(DEFAULTS, '전담·비교과'), '전담');
  assert.equal(dutyFromText(DEFAULTS, '비교과'), '비교과');
  assert.equal(dutyFromText(DEFAULTS, '5학년 담임'), '담임');
  assert.equal(dutyFromText(DEFAULTS, '전담교사'), '전담');
  assert.equal(dutyFromText(DEFAULTS, '행정'), '행정');
  assert.equal(dutyFromText(DEFAULTS, ''), null);
  assert.equal(dutyKnown(DEFAULTS, '전담'), true);
  assert.equal(dutyKnown(DEFAULTS, '행정'), false);
  assert.equal(dutyKnown(DEFAULTS, '전담·비교과'), false); // 옛 값은 이제 마이그레이션이 옮긴다
});

test('요일 범위 · 섞인 칸 묶음', () => {
  const w = findOverlaps([{ classroom_id: 1, weekday: 6, period: 2, membership_id: 1 }], { weekdays: 5 });
  assert.equal(w.length, 1);
  assert.equal(w[0].rule, 'weekday_range');
  assert.ok(RULES.weekday_range);
  assert.equal(findOverlaps([{ classroom_id: 1, weekday: 5, period: 2, membership_id: 1 }], { weekdays: 5 }).length, 0);
  // 시각 칸 둘(시각상 안 겹침, 같은 교시) + 시각 없는 칸 → 시각 칸마다 따로 묶음 둘
  const T = (s, e) => ({ start: s, end: e });
  const periods = { grades: { 1: { periods: 3, times: [T('09:00', '09:40'), T('09:50', '10:30'), T('10:40', '11:20')] }, 3: { periods: 3, times: [T('10:00', '10:40'), T('10:50', '11:30'), T('11:40', '12:20')] } } };
  const C = (classroom_id, period) => ({ classroom_id, weekday: 1, period, membership_id: 7 });
  const ctx = { periods, gradeOf: { 1: 1, 2: 3, 3: 9 } };
  for (const f of [findOverlaps, webOverlaps]) {
    const r = f([C(1, 2), C(2, 2), C(3, 2)], ctx);
    assert.equal(r.length, 2);
    for (const x of r) assert.equal(x.classroom_ids.length, 2);
  }
});

test('경로: 마이그레이션 · 명단 올리기 목록 밖 글 재확인', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f11${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, ['adm', `${tag}-adm`, hash])).rows[0].id;
  await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자')`, [org, u]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await pool.query(`DELETE FROM audit_log WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM session WHERE (sess->>'userId') IN (SELECT id::text FROM app_user WHERE login_id LIKE $1)`, [`${tag}-%`]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [org]);
    await pool.end();
  });
  let cookie = ''; let csrf = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    let json = null; try { json = await res.json(); } catch { /* 본문 없음 */ }
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
  await call('GET', '/api/auth/session');
  assert.equal((await call('POST', '/api/auth/login', { orgId: org, loginId: `${tag}-adm`, password: 'pw-test-1234' })).status, 200);
  const P = `/api/orgs/${org}`;

  await t.test('옛 값 UPDATE: 전담·비교과 → 전담 (지우지 않음)', async () => {
    const u2 = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash) VALUES ('old', $1, $2) RETURNING id`, [`${tag}-old`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,'교직원','전담·비교과') RETURNING id`, [org, u2])).rows[0].id;
    await pool.query(`UPDATE membership SET duty = '전담' WHERE duty = '전담·비교과'`); // 마이그레이션 82 와 같은 문장
    assert.equal((await pool.query(`SELECT duty FROM membership WHERE id = $1`, [m])).rows[0].duty, '전담');
  });
  await t.test('명단 올리기: 목록 밖 → 409 되묻기(만들지 않음) → confirm 으로 저장 + 줄 경고', async () => {
    const rows = [{ name: '가', loginId: `${tag}-a`, duty: '전담·비교과' }, { name: '나', loginId: `${tag}-b`, duty: '행정오타' }];
    const a = await call('POST', `${P}/roster/import`, { rows });
    assert.equal(a.status, 409);
    assert.equal(a.json.needConfirm, true);
    assert.deepEqual(a.json.odd.map((x) => x.line), [2]);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM app_user WHERE login_id IN ($1,$2)`, [`${tag}-a`, `${tag}-b`])).rows[0].n, 0);
    const b = await call('POST', `${P}/roster/import`, { rows, confirm: true });
    assert.equal(b.status, 200);
    assert.equal(b.json.made, 2);
    assert.equal(b.json.results[0].warnings, undefined);
    assert.equal(b.json.results[1].warnings[0].key, 'duty');
    assert.equal((await pool.query(`SELECT m.duty FROM membership m JOIN app_user u ON u.id = m.user_id WHERE u.login_id = $1`, [`${tag}-a`])).rows[0].duty, '전담');
  });
});
