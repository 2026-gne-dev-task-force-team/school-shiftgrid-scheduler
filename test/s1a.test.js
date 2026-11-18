// S-1a: 로그인 잠금 · 비밀번호 바꾸기 · 흔한 비밀번호 · 명단 · 시스템 관리자 경계. DB 필요(DATABASE_URL).
import test from 'node:test';
import { cleanupOrgs } from './sec-helpers.js';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { passwordProblem, tempPassword } from '../server/passwords.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('비밀번호 규칙: 8자 미만·흔한 것 거부, 임시 비밀번호는 8자', () => {
  assert.ok(passwordProblem('abc123'));
  assert.ok(passwordProblem('password')); // 흔한 목록
  assert.ok(passwordProblem('Password')); // 대소문자 무시
  assert.equal(passwordProblem('kx9-pelican-7Q', 'hong'), null);
  assert.equal(tempPassword().length, 8);
});

test('S-1a 흐름', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `s${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = async (name, kind = '초') => (await pool.query(`INSERT INTO org (name, kind) VALUES ($1,$2) RETURNING id`, [`${tag}-${name}`, kind])).rows[0].id;
  const user = async (orgId, id, role, must = false) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,$4) RETURNING id`, [id, `${tag}-${id}`, hash, must])).rows[0].id;
    await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)`, [orgId, u, role]);
    return `${tag}-${id}`;
  };
  const edu = await org('edu', '교육청');
  const school = await org('school');
  const sys = await user(edu, 'sys', '시스템관리자');
  const adm = await user(school, 'adm', '기관관리자');
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    // 시험 중간에 실패해도 이름 태그로 찾아 전부 지운다(시험 기관이 로그인 목록에 남지 않게)
    const ids = (await pool.query(`SELECT id FROM org WHERE name LIKE $1`, [`${tag}-%`])).rows.map((r) => r.id);
    await cleanupOrgs(pool, ids, tag);
    await pool.end();
  });
  const client = () => {
    let cookie = '';
    let csrf = '';
    const call = async (method, path, body, raw) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': raw ? 'application/octet-stream' : 'application/json', cookie, 'x-csrf-token': csrf }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    return { call, login: async (orgId, loginId, password = 'pw-test-1234') => { await call('GET', '/api/auth/session'); return call('POST', '/api/auth/login', { orgId, loginId, password }); } };
  };

  await t.test('실패 10회 → 잠금(맞는 비밀번호도 거부) → 관리자가 풀면 로그인', async () => {
    const victim = await user(school, 'victim', '교직원');
    const c = client();
    for (let i = 0; i < 10; i++) assert.equal((await c.login(school, victim, 'wrong-pass')).status, 401);
    assert.equal((await c.login(school, victim)).status, 401);
    const a = client();
    await a.login(school, adm);
    const list = (await a.call('GET', `/api/orgs/${school}/roster`)).json;
    const row = list.find((x) => x.loginId === victim);
    assert.equal(row.state, '잠김');
    assert.equal((await a.call('POST', `/api/orgs/${school}/roster/${row.id}/unlock`)).status, 200);
    assert.equal((await c.login(school, victim)).status, 200);
  });

  await t.test('첫 로그인 강제 변경: 바꾸기 전엔 기관 경로 403, 흔한 비밀번호 400, 바꾸면 열림 · 옛 비밀번호 불가', async () => {
    const id = await user(school, 'first', '기관관리자', true);
    const c = client();
    const l = await c.login(school, id);
    assert.equal(l.json.user.mustChange, true);
    assert.equal((await c.call('GET', `/api/orgs/${school}/roster`)).status, 403);
    assert.equal((await c.call('POST', '/api/auth/password', { current: 'pw-test-1234', next: 'password' })).status, 400);
    assert.equal((await c.call('POST', '/api/auth/password', { current: 'pw-test-1234', next: 'short' })).status, 400);
    assert.equal((await c.call('POST', '/api/auth/password', { current: 'pw-test-1234', next: 'new-pass-9z8y' })).status, 200);
    assert.equal((await c.call('GET', `/api/orgs/${school}/roster`)).status, 200);
    assert.equal((await client().login(school, id)).status, 401);
    assert.equal((await client().login(school, id, 'new-pass-9z8y')).status, 200);
  });

  await t.test('명단: 임시 비번 한 번 · 첫 로그인 후 변경 강제 · 역할 · 마지막 관리자 보호', async () => {
    const a = client();
    await a.login(school, adm);
    const made = await a.call('POST', `/api/orgs/${school}/roster`, { name: '김교사', loginId: `${tag}-kim`, role: '교직원', duty: '담임' });
    assert.equal(made.status, 201);
    assert.equal(made.json.temp.length, 8);
    assert.equal((await a.call('POST', `/api/orgs/${school}/roster`, { name: '또', loginId: `${tag}-KIM` })).status, 409); // ID 전체 유일(대소문자 무시)
    const k = client();
    const lk = await k.login(school, `${tag}-kim`, made.json.temp);
    assert.equal(lk.json.user.mustChange, true);
    const reset = await a.call('POST', `/api/orgs/${school}/roster/${made.json.id}/reset-password`);
    assert.equal(reset.status, 200);
    assert.notEqual(reset.json.temp, made.json.temp);
    assert.equal((await k.call('GET', '/api/auth/session')).json.user, null); // 초기화하면 그 사람 세션이 끊긴다
    const list = (await a.call('GET', `/api/orgs/${school}/roster`)).json;
    const admins = list.filter((x) => x.role === '기관관리자');
    assert.equal((await a.call('PATCH', `/api/orgs/${school}/roster/${made.json.id}`, { role: '보기만' })).status, 200);
    if (admins.length === 1) assert.equal((await a.call('PATCH', `/api/orgs/${school}/roster/${admins[0].id}`, { role: '교직원' })).status, 409);
  });

  await t.test('엑셀: 양식·미리보기·올리기 — 못 읽은 줄은 표시만 하고 나머지는 만든다', async () => {
    const a = client();
    await a.login(school, adm);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('명단');
    ws.addRow(['성명', '아이디', '역할']);
    ws.addRow(['박교사', `${tag}-park`, '교직원']);
    ws.addRow(['', `${tag}-noname`, '교직원']);
    ws.addRow(['이교사', `${tag}-lee`, '교장']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const pv = await a.call('POST', `/api/orgs/${school}/roster/import/preview`, null, buf);
    assert.equal(pv.status, 200);
    assert.deepEqual(pv.json.mapping, { name: 0, loginId: 1, role: 2, duty: -1 });
    const rows = pv.json.rows.map(([name, loginId, role]) => ({ name, loginId, role }));
    const im = await a.call('POST', `/api/orgs/${school}/roster/import`, { rows });
    assert.equal(im.json.made, 1);
    assert.equal(im.json.failed, 2);
    assert.equal(im.json.results[0].temp.length, 8);
    assert.match(im.json.results[1].error, /이름/);
    assert.match(im.json.results[2].error, /역할/);
  });

  await t.test('시스템 관리자: 기관 등록 → 첫 관리자 → 중지하면 로그인 막힘 · 비번 초기화 · 명단은 못 봄', async () => {
    const s = client();
    assert.equal((await s.login(edu, sys)).status, 200);
    assert.equal((await s.call('GET', `/api/orgs/${school}/roster`)).status, 404);
    assert.equal((await s.call('GET', `/api/orgs/${edu}/roster`)).status, 404);
    const o = await s.call('POST', '/api/admin/orgs', { name: `${tag}-new`, kind: '중' });
    assert.equal(o.status, 201);
    const fa = await s.call('POST', `/api/admin/orgs/${o.json.id}/first-admin`, { name: '교무', loginId: `${tag}-newadmin` });
    assert.equal(fa.status, 201);
    const n = client();
    assert.equal((await n.login(o.json.id, `${tag}-newadmin`, fa.json.temp)).json.user.role, '기관관리자');
    const admins = (await s.call('GET', `/api/admin/orgs/${o.json.id}/admins`)).json;
    const rp = await s.call('POST', `/api/admin/orgs/${o.json.id}/reset-password`, { userId: admins[0].userId });
    assert.equal(rp.status, 200);
    assert.equal((await client().login(o.json.id, `${tag}-newadmin`, rp.json.temp)).status, 200);
    // 겸임 계정(다른 기관에도 소속)도 시스템 관리자 비상 초기화는 된다 — 기관 관리자 쪽은 409 그대로
    const sm = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'교직원') RETURNING id`, [school, admins[0].userId])).rows[0].id;
    const rp2 = await s.call('POST', `/api/admin/orgs/${school}/reset-password`, { userId: admins[0].userId });
    assert.equal(rp2.status, 200);
    const ca = client();
    await ca.login(school, adm);
    assert.equal((await ca.call('POST', `/api/orgs/${school}/roster/${sm}/reset-password`)).status, 409);
    assert.ok((await pool.query(`SELECT 1 FROM audit_log WHERE action = 'admin.reset-password' AND (after->>'shared') = 'true' AND row_id = $1`, [admins[0].userId])).rows[0]);
    await pool.query(`DELETE FROM membership WHERE id = $1`, [sm]);
    assert.equal((await s.call('PATCH', `/api/admin/orgs/${o.json.id}`, { status: '중지' })).status, 200);
    assert.equal((await client().login(o.json.id, `${tag}-newadmin`, rp.json.temp)).status, 401);
    assert.equal((await s.call('PATCH', `/api/admin/orgs/${edu}`, { status: '중지' })).status, 400);
    // 기관 관리자는 시스템 관리자 경로에 못 들어간다
    const a = client();
    await a.login(school, adm);
    assert.equal((await a.call('GET', '/api/admin/orgs')).status, 404);
    await pool.query(`DELETE FROM audit_log WHERE org_id = $1 OR row_id IS NOT NULL AND table_name='org' AND (after->>'name') LIKE $2`, [o.json.id, `${tag}-%`]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [o.json.id]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [o.json.id]);
  });
});
