// F-1: 기관 설정 features 칸 · 보낸 키만 덮기 · roomCapacity 유지 · 새 기관은 1단계 묶음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DEFAULTS } from '../server/orgConfig.js';
import { FEATURE_KEYS, featuresUpTo } from '../shared/features.js';

const HAS_DB = !!process.env.DATABASE_URL;

test('shared/features: 14키 · 1단계 묶음은 setup 하나', () => {
  assert.equal(FEATURE_KEYS.length, 14);
  assert.ok(FEATURE_KEYS.every((k) => DEFAULTS.features[k] === true)); // 기본은 전부 켬
  const one = featuresUpTo(1);
  assert.deepEqual(Object.keys(one).filter((k) => one[k]), ['setup']);
});

test('경로: features 저장·유지·거부 · 새 기관 1단계', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const { cleanupOrgs } = await import('./sec-helpers.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f1${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, ['adm', `${tag}-adm`, hash])).rows[0].id;
  await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자')`, [org, u]);
  const edu = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '교육청') RETURNING id`, [`${tag}-edu`])).rows[0].id;
  const su = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, ['sys', `${tag}-sys`, hash])).rows[0].id;
  await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'시스템관리자')`, [edu, su]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await cleanupOrgs(pool, [org, edu], tag); await pool.end(); });
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
  const P = `/api/orgs/${org}/org/config`;

  await t.test('features 저장 · 다른 키 저장 뒤에도 유지 · 키 단위 병합', async () => {
    const a = await call('PUT', P, { features: { gen: false, sub: false } });
    assert.equal(a.status, 200);
    assert.equal(a.json.features.gen, false);
    assert.equal(a.json.features.setup, true);
    await call('PUT', P, { limits: { periods: 14 } });
    await call('PUT', P, { features: { gen: true } }); // 한 키만 보내도 sub 는 그대로
    const g = (await call('GET', P)).json;
    assert.equal(g.features.gen, true);
    assert.equal(g.features.sub, false);
    assert.equal(g.limits.periods, 14);
  });

  await t.test('모르는 스위치 키·비 boolean 은 400', async () => {
    assert.equal((await call('PUT', P, { features: { nope: true } })).status, 400);
    assert.equal((await call('PUT', P, { features: { gen: 'yes' } })).status, 400);
  });

  await t.test('roomCapacity 저장되고 다른 키 저장에 안 날아간다', async () => {
    assert.equal((await call('PUT', P, { roomCapacity: { count: 'classes' } })).status, 200);
    await call('PUT', P, { weekdays: ['월', '화'] });
    assert.equal((await call('GET', P)).json.roomCapacity.count, 'classes');
    assert.equal((await call('PUT', P, { roomCapacity: { count: 'x' } })).status, 400);
  });

  await t.test('새 기관은 1단계 묶음(시스템관리자가 만든 기관의 저장값)', async () => {
    await call('POST', '/api/auth/logout');
    cookie = ''; csrf = '';
    await call('GET', '/api/auth/session');
    assert.equal((await call('POST', '/api/auth/login', { orgId: edu, loginId: `${tag}-sys`, password: 'pw-test-1234' })).status, 200);
    const o = await call('POST', '/api/admin/orgs', { name: `${tag}-new`, kind: '중' });
    assert.equal(o.status, 201);
    const cfg = (await pool.query(`SELECT config FROM org WHERE id = $1`, [o.json.id])).rows[0].config;
    assert.deepEqual(cfg.features, featuresUpTo(1));
  });
});
