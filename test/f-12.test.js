// F-12: 빠른 시작 — 빈 기관에 학급·교시틀·시안 한 번에 · 두 번째 409 · 교직원 403 · 교사 없이 과목만으로 칸 저장
import { test } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';

const HAS_DB = !!process.env.DATABASE_URL;

test('빠른 시작 경로', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const { cleanupOrgs } = await import('./sec-helpers.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f12${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  for (const [n, role] of [['adm', '기관관리자'], ['stf', '교직원']]) {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [n, `${tag}-${n}`, hash])).rows[0].id;
    await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)`, [org, u, role]);
  }
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await cleanupOrgs(pool, [org], tag); await pool.end(); });
  const mk = () => {
    const st = { cookie: '', csrf: '' };
    return async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: st.cookie, 'x-csrf-token': st.csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) st.cookie = sc.map((c) => c.split(';')[0]).join('; ');
      let json = null; try { json = await res.json(); } catch { /* 본문 없음 */ }
      if (json?.csrf) st.csrf = json.csrf;
      return { status: res.status, json };
    };
  };
  const login = async (n) => {
    const call = mk();
    await call('GET', '/api/auth/session');
    assert.equal((await call('POST', '/api/auth/login', { orgId: org, loginId: `${tag}-${n}`, password: 'pw-test-1234' })).status, 200);
    return call;
  };
  const adm = await login('adm');
  const stf = await login('stf');
  const P = `/api/orgs/${org}`;
  const body = { classes: { 1: 2, 2: 1 }, periods: { 1: 5, 2: 4 } };

  await t.test('교직원은 막힘(이 앱은 권한 없음을 404 로 숨김)', async () => assert.equal((await stf('POST', `${P}/quick-start`, body)).status, 404));
  let ttId;
  await t.test('빈 기관: 학급 3 · 교시틀 · 시안 1', async () => {
    assert.equal((await adm('POST', `${P}/quick-start`, { classes: { 1: 0 } })).status, 400);
    const r = await adm('POST', `${P}/quick-start`, body);
    assert.equal(r.status, 201);
    ttId = r.json.timetable.id;
    const d = (await adm('GET', `${P}/timetables/${ttId}`)).json;
    assert.equal(d.classrooms.length, 3);
    assert.equal(d.periods.grades[1].periods, 5);
    assert.equal(d.periods.grades[2].periods, 4);
    assert.ok(d.subjects.length > 0);
    assert.equal((await adm('GET', `${P}/timetables`)).json.length, 1);
    assert.equal((await pool.query(`SELECT 1 FROM audit_log WHERE org_id = $1 AND action = 'school.quick_start'`, [org])).rowCount, 1);
  });
  await t.test('두 번째는 409 · 아무것도 안 늘어남', async () => {
    assert.equal((await adm('POST', `${P}/quick-start`, body)).status, 409);
    assert.equal((await adm('GET', `${P}/timetables`)).json.length, 1);
  });
  await t.test('교사 없이 새 과목만으로 칸 저장', async () => {
    const s = await adm('POST', `${P}/subjects`, { name: '창체' });
    assert.equal(s.status, 201);
    const d = (await adm('GET', `${P}/timetables/${ttId}`)).json;
    const r = await adm('PUT', `${P}/timetables/${ttId}/cells`, { classroom_id: d.classrooms[0].id, weekday: 1, period: 1, subject_id: s.json.id, membership_id: null, special_room_id: null });
    assert.equal(r.status, 200);
    const d2 = (await adm('GET', `${P}/timetables/${ttId}`)).json;
    assert.equal(d2.cells.length, 1);
    assert.equal(d2.cells[0].membership_id, null);
  });
});
