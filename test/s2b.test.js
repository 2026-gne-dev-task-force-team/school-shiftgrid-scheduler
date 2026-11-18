import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { generate } from '../web/src/gen/core.js';
import { makeSoftScore } from '../web/src/gen/soft-adapter.js';
import { diffFromDefault } from '../web/src/s2b/diff.js';
import { resolveWeights } from '../web/src/gen/soft.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

// 작은 학교 하나: 한 교사(1번)가 두 반에 1시수씩 — 어디에 놓느냐로만 권장 점수가 갈린다
const mini = () => ({
  classrooms: [{ id: 1, grade: 1 }, { id: 2, grade: 1 }],
  periods: { grades: { 1: { periods: 5, lunchAfter: 4 } } },
  lines: [
    { classroom_id: 1, membership_id: 1, subject_id: 1, special_room_id: null, weekly_hours: 3, sync_progress: false },
    { classroom_id: 2, membership_id: 1, subject_id: 1, special_room_id: null, weekly_hours: 3, sync_progress: false },
  ],
  pins: [],
});

test('권장 점수가 고르기를 바꾼다 — 필수가 같으면 점수 낮은 후보가 위', () => {
  const input = mini();
  const soft = makeSoftScore(input);
  const r = generate(input, { k: 6, perMs: 200, seed: 3, softScore: soft });
  const top = r.candidates.filter((c) => c.hard === r.candidates[0].hard && c.rr === r.candidates[0].rr);
  assert.ok(top.every((c, i) => i === 0 || top[i - 1].soft <= c.soft), '같은 필수 안에선 점수 오름차순');
  // 점수가 실제로 후보마다 갈리는 입력 — 일부러 점수를 뒤집으면 순서도 뒤집힌다
  const inv = generate(input, { k: 6, perMs: 200, seed: 3, softScore: (a) => -soft(a) });
  const a = r.candidates.map((c) => c.cells.length + ':' + c.soft).join();
  assert.ok(r.candidates.every((c) => Number.isFinite(c.soft)));
  const hi = Math.max(...r.candidates.map((c) => c.soft));
  const lo = Math.min(...r.candidates.map((c) => c.soft));
  if (hi !== lo) assert.notEqual(inv.candidates[0].cells.map((c) => c.weekday + '' + c.period).join(), r.candidates[0].cells.map((c) => c.weekday + '' + c.period).join(), a);
  // 가중도 점수에 반영: 점심 앞뒤 연달음(거의필수)을 0 으로 바꾸면 점수가 줄거나 같다
  const cheap = makeSoftScore({ ...input, weights: { bands: { 거의필수: 0, 중요: 0, 선호: 0 } } });
  assert.equal(cheap({ cells: r.candidates[0].cells }), 0);
});

test('저장 가중은 바꾼 것만 남는다', () => {
  const w = resolveWeights({ bands: { 중요: 50 }, ruleBand: { gradeBlock: '선호', consecutive: '중요' } });
  const d = diffFromDefault(w);
  assert.deepEqual(d.bands, { 중요: 50 });
  assert.deepEqual(d.ruleBand, { gradeBlock: '선호' });
});

test('S-2b 경로: 시수표 block 칸 저장 · 생성 재료로 넘김 · 가중 재료', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `b${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ('adm',$1,$2,FALSE) RETURNING id`, [`${tag}-adm`, hash])).rows[0].id;
  const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'기관관리자') RETURNING id`, [org, u])).rows[0].id;
  await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2)`, [org]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await pool.query(`DELETE FROM teaching_load WHERE org_id = $1`, [org]);
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
  const a = await call('POST', `${P}/loads`, { membership_id: m, weekly_hours: 2, block: 2 });
  assert.equal(a.status, 201);
  assert.equal(a.json.block, 2);
  const b = await call('POST', `${P}/loads`, { membership_id: m, weekly_hours: 1 });
  assert.equal(b.json.block, 1, '기본은 낱개');
  assert.equal((await call('PATCH', `${P}/loads/${b.json.id}`, { block: 2 })).json.block, 2);
  assert.equal((await call('POST', `${P}/loads`, { membership_id: m, block: 99 })).status, 400, '넓은 천장 밖만 거부(block 9 는 경고로 저장)');
  assert.deepEqual((await call('GET', `${P}/loads`)).json.lines.map((l) => l.block), [2, 2]);
  await call('PUT', `${P}/soft-weights`, { weights: { bands: { 중요: 33 } } });
  await call('PUT', `${P}/soft-weights/tier`, { membership_id: m, tier: 1 });
  const inp = (await call('GET', `${P}/gen/input`)).json;
  assert.deepEqual(inp.weights, { bands: { 중요: 33 } });
  assert.equal(inp.tiers[m], 1);
  assert.ok('small' in inp);
});
