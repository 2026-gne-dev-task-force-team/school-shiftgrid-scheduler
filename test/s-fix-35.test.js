// S-fix-35: argon2 강도 상수 · 시안 있고 반 없는 학교 빠른 시작 · index 폴백 압축
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import argon2 from 'argon2';
import { ARGON } from '../server/accounts.js';

const HAS_DB = !!process.env.DATABASE_URL;

test('argon2 상수는 OWASP 하한 · 해시에 박힘 · 예전 해시도 verify', async () => {
  const h = await argon2.hash('pw-1234-abcd', ARGON);
  assert.match(h, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.ok(await argon2.verify(h, 'pw-1234-abcd'));
  assert.ok(await argon2.verify(await argon2.hash('x-old-pw'), 'x-old-pw'));
});

test('SPA 폴백(/가짜경로)도 압축본', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx35-'));
  const html = '<html>' + 'x'.repeat(500) + '</html>';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'index.html.br'), zlib.brotliCompressSync(html));
  process.env.WEB_DIST = dir;
  const { createApp } = await import('../server/app.js');
  const app = createApp({ query: async () => ({ rows: [] }) }, { testMode: true, cookieSecure: false });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(() => { server.close(); delete process.env.WEB_DIST; fs.rmSync(dir, { recursive: true, force: true }); });
  const r = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { 'accept-encoding': 'br' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-encoding'), 'br');
  assert.match(r.headers.get('content-type'), /html/);
  assert.equal(await r.text(), html);
});

test('빠른 시작: 시안이 이미 있으면 새로 안 만든다', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const { cleanupOrgs } = await import('./sec-helpers.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `sf35${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234', ARGON);
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ('adm',$1,$2,FALSE) RETURNING id`, [`${tag}-adm`, hash])).rows[0].id;
  await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자')`, [org, u]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await cleanupOrgs(pool, [org], tag); await pool.end(); });
  const st = { cookie: '', csrf: '' };
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie: st.cookie, 'x-csrf-token': st.csrf }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) st.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    let json = null; try { json = await res.json(); } catch { /* 본문 없음 */ }
    if (json?.csrf) st.csrf = json.csrf;
    return { status: res.status, json };
  };
  await call('GET', '/api/auth/session');
  assert.equal((await call('POST', '/api/auth/login', { orgId: org, loginId: `${tag}-adm`, password: 'pw-test-1234' })).status, 200);
  const P = `/api/orgs/${org}`;
  const first = (await call('POST', `${P}/timetables`, { name: '내 시안' }));
  assert.ok(first.status < 300, JSON.stringify(first));
  const r = await call('POST', `${P}/quick-start`, { classes: { 1: 2 } });
  assert.equal(r.status, 201);
  assert.equal(r.json.timetable.name, '내 시안');
  assert.equal((await call('GET', `${P}/timetables`)).json.length, 1);
});
