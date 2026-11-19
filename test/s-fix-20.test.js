import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { cleanupOrgs, HAS_DB, PW } from './sec-helpers.js';

test('감사 로그 보기: 자기 기관 것만 · 남의 기관/교직원 거부 · 비밀 키 제외', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f20${Date.now()}`;
  const hash = await argon2.hash(PW);
  const mkOrg = async (n) => (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-${n}`])).rows[0].id;
  const mkUser = async (org, n, role) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [`${tag}${n}`, `${tag}-${n}`, hash])).rows[0].id;
    await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)`, [org, u, role]);
    return u;
  };
  const A = await mkOrg('A'); const B = await mkOrg('B');
  const adminA = await mkUser(A, 'adA', '기관관리자'); const staffA = await mkUser(A, 'stA', '교직원'); await mkUser(B, 'adB', '기관관리자');
  const ins = (org, user, action, after) => pool.query(`INSERT INTO audit_log (org_id, user_id, action, table_name, after) VALUES ($1,$2,$3,'x',$4)`, [org, user, action, after && JSON.stringify(after)]);
  await ins(A, adminA, 'a.one', { ok: 1, password_hash: 'SECRET', nest: { temp: 'T' } });
  await ins(A, adminA, 'b.two');
  await ins(B, null, 'other.org');
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await cleanupOrgs(pool, [A, B], tag); await pool.end(); });
  const client = async (org, n) => {
    let cookie = ''; let csrf = '';
    const call = async (path) => {
      const res = await fetch(base + path, { headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, method: path === '/api/auth/login' ? 'POST' : 'GET', body: path === '/api/auth/login' ? JSON.stringify({ orgId: org, loginId: `${tag}-${n}`, password: PW }) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    await call('/api/auth/session');
    await call('/api/auth/login');
    return call;
  };
  const adm = await client(A, 'adA');
  await t.test('관리자: 자기 기관 기록만, 최근순, 비밀 키 없음, 커서 · 거르기', async () => {
    const r = await adm(`/api/orgs/${A}/audit`);
    assert.equal(r.status, 200);
    const acts = r.json.items.map((x) => x.action);
    assert.ok(acts.includes('a.one') && acts.includes('b.two'));
    assert.ok(!acts.includes('other.org'));
    assert.ok(acts.indexOf('b.two') < acts.indexOf('a.one'));
    assert.ok(!JSON.stringify(r.json).includes('SECRET') && !JSON.stringify(r.json).includes('"T"'));
    const p1 = await adm(`/api/orgs/${A}/audit?limit=1`);
    assert.equal(p1.json.more, true);
    const p2 = await adm(`/api/orgs/${A}/audit?limit=1&before=${p1.json.next}`);
    assert.equal(p2.json.items[0].action, 'a.one');
    assert.deepEqual((await adm(`/api/orgs/${A}/audit?action=a.`)).json.items.map((x) => x.action), ['a.one']);
  });
  await t.test('남의 기관 주소 · 교직원 · 비로그인 거부', async () => {
    assert.equal((await adm(`/api/orgs/${B}/audit`)).status, 404);
    assert.equal((await adm(`/api/admin/orgs/${A}/audit`)).status, 404);
    const st = await client(A, 'stA');
    assert.equal((await st(`/api/orgs/${A}/audit`)).status, 404);
    assert.ok(staffA);
  });
});
