import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { findOverlaps } from '../server/violations.js';
import { cleanupOrgs } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('겹침: 같은 교사 같은 시각 두 반 · 특별실 겹침 · 같은 반은 겹침 아님', () => {
  const cells = [
    { classroom_id: 1, weekday: 1, period: 1, membership_id: 5, special_room_id: 9 },
    { classroom_id: 2, weekday: 1, period: 1, membership_id: 5, special_room_id: 9 },
    { classroom_id: 3, weekday: 1, period: 2, membership_id: 5, special_room_id: null },
  ];
  const f = findOverlaps(cells);
  assert.deepEqual(f.map((x) => x.rule).sort(), ['room_overlap', 'teacher_overlap']);
  assert.equal(findOverlaps([cells[0], cells[2]]).length, 0);
});

test('S-1c 경로: 겹쳐도 저장된다 · 수위 따라 색 · 비우기 · 권한', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `c${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const mk = async (lid, role) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [lid, `${tag}-${lid}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3) RETURNING id`, [org, u, role])).rows[0].id;
    return { login: `${tag}-${lid}`, m };
  };
  const adm = await mk('adm', '기관관리자');
  const stf = await mk('stf', '교직원');
  const term = (await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [org])).rows[0].id;
  const c1 = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,1) RETURNING id`, [org, term])).rows[0].id;
  const c2 = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,1,2) RETURNING id`, [org, term])).rows[0].id;
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await cleanupOrgs(pool, org, tag);
    await pool.end();
  });
  const client = async (login) => {
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
    await call('POST', '/api/auth/login', { orgId: org, loginId: login, password: 'pw-test-1234' });
    return call;
  };
  const A = await client(adm.login);
  const S = await client(stf.login);
  const P = `/api/orgs/${org}`;

  const tt = await A('POST', `${P}/timetables`, { name: '시안 1' });
  assert.equal(tt.status, 201);
  assert.equal((await A('POST', `${P}/timetables`, { name: '시안 1' })).status, 409); // 같은 것이 둘
  assert.equal((await S('POST', `${P}/timetables`, { name: '시안 2' })).status, 404); // 교직원은 못 만든다

  await t.test('같은 교사가 같은 시각 두 반 — 저장은 되고 빨강 목록이 온다', async () => {
    const a = await A('PUT', `${P}/timetables/${tt.json.id}/cells`, { classroom_id: c1, weekday: 1, period: 1, membership_id: adm.m });
    assert.equal(a.status, 200);
    assert.equal(a.json.violations.length, 0);
    const b = await A('PUT', `${P}/timetables/${tt.json.id}/cells`, { classroom_id: c2, weekday: 1, period: 1, membership_id: adm.m });
    assert.equal(b.status, 200);
    assert.equal(b.json.violations[0].rule, 'teacher_overlap');
    assert.equal(b.json.violations[0].color, 'red');
    const g = await A('GET', `${P}/timetables/${tt.json.id}`);
    assert.equal(g.json.cells.length, 2);
  });
  await t.test('수위를 끔으로 하면 목록에서 빠지되 칸은 저장된다', async () => {
    await A('PUT', `${P}/rules`, { levels: { teacher_overlap: '끔' } });
    const g = await A('GET', `${P}/timetables/${tt.json.id}`);
    assert.equal(g.json.violations.length, 0);
    assert.equal(g.json.cells.length, 2);
  });
  await t.test('비우기 · 내 시간표 · 교직원은 칸을 못 고친다', async () => {
    const e = await A('PUT', `${P}/timetables/${tt.json.id}/cells`, { classroom_id: c2, weekday: 1, period: 1, subject_id: null, membership_id: null });
    assert.equal(e.status, 200);
    const mine = await A('GET', `${P}/timetables/${tt.json.id}/mine`);
    assert.equal(mine.json.cells.length, 1);
    assert.equal((await S('GET', `${P}/timetables/${tt.json.id}/mine`)).json.cells.length, 0);
    assert.equal((await S('PUT', `${P}/timetables/${tt.json.id}/cells`, { classroom_id: c1, weekday: 2, period: 1, membership_id: stf.m })).status, 404);
    assert.equal((await A('PUT', `${P}/timetables/${tt.json.id}/cells`, { classroom_id: c1, weekday: 9, period: 1 })).status, 400);
  });
});
