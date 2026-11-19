// S-fix-37: 겸임 로그인(아이디 먼저·소속은 뒤에) · 기관 관리자가 겸임 데려오기 · 같은 종류 특별실 자동 배정
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, PW, setup } from './sec-helpers.js';
import { generate } from '../web/src/gen/core.js';

test('같은 종류 특별실(과학1실·과학2실): 두 반이 같은 시각에 다른 방으로, 방이 모자라면 못 놓고 경고', () => {
  const classrooms = [1, 2, 3].map((id) => ({ id, grade: 3, class_no: id }));
  const rooms = [{ id: 10, name: '과학1실' }, { id: 11, name: '과학2실' }, { id: 12, name: '강당' }];
  const mk = (n, hours) => ({ classrooms: classrooms.slice(0, n), periods: { grades: { 3: { periods: 1, lunchAfter: 0 } } }, days: 1, rooms,
    lines: classrooms.slice(0, n).map((c) => ({ classroom_id: c.id, membership_id: 100 + c.id, subject_id: 1, special_room_id: 10, weekly_hours: hours })), pins: [] });
  const ok = generate(mk(2, 1), { k: 1, perMs: 300 });
  assert.equal(ok.candidates[0].unplaced.length, 0);
  assert.deepEqual(ok.candidates[0].cells.map((c) => c.special_room_id).sort(), [10, 11]); // 한 교시 하루 — 같은 칸이라 방이 갈려야 한다
  const full = generate(mk(3, 1), { k: 1, perMs: 300 }); // 칸 1개·방 2개·반 3개
  assert.equal(full.candidates[0].unplaced.length, 1);
  assert.ok(full.candidates[0].warnings.some((w) => w.rule === 'room_pool_full'));
});

test('겸임: 아이디·비번만으로 로그인 → 소속 하나면 바로, 여럿이면 고르기 · 기관 관리자가 겸임 데려오기', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const one = f.client();
  await one.call('GET', '/api/auth/session');
  const r1 = await one.call('POST', '/api/auth/login', { loginId: f.users.staffA.loginId, password: PW });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.user.orgId, f.orgA);

  const c = f.client();
  await c.call('GET', '/api/auth/session');
  const r2 = await c.call('POST', '/api/auth/login', { loginId: f.users.dual.loginId, password: PW });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.user, undefined);
  assert.equal(r2.json.choose.length, 2);
  assert.equal((await c.call('GET', '/api/auth/memberships')).status, 401); // 고르기 전엔 로그인 아님
  assert.equal((await c.call('POST', '/api/auth/pick-org', { orgId: f.orgEdu })).status, 404); // 목록 밖 기관 불가
  const r3 = await c.call('POST', '/api/auth/pick-org', { orgId: f.orgB });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.user.orgId, f.orgB);
  assert.equal(r3.json.user.role, '기관관리자');
  const bad = f.client();
  await bad.call('GET', '/api/auth/session');
  assert.equal((await bad.call('POST', '/api/auth/login', { loginId: f.users.dual.loginId, password: 'x' })).status, 401);
  assert.equal((await bad.call('POST', '/api/auth/pick-org', { orgId: f.orgB })).status, 400);

  // 기관 관리자(B)가 다른 기관 사람(staffA)을 ID 로 데려온다
  const b = await f.as('adminB');
  const add = await b.call('POST', `/api/orgs/${f.orgB}/roster/concurrent`, { loginId: f.users.staffA.loginId, role: '교직원' });
  assert.equal(add.status, 201);
  assert.equal((await b.call('POST', `/api/orgs/${f.orgB}/roster/concurrent`, { loginId: f.users.staffA.loginId })).status, 409);
  assert.equal((await b.call('POST', `/api/orgs/${f.orgB}/roster/concurrent`, { loginId: 'no-such-id-zz' })).status, 404);
  const n = (await f.pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE org_id = $1 AND action = 'roster.concurrent-add'`, [f.orgB])).rows[0].n;
  assert.equal(n, 1);
  const s = await f.as('staffA');
  assert.equal((await s.call('POST', `/api/orgs/${f.orgA}/roster/concurrent`, { loginId: f.users.viewA.loginId })).status, 404); // 관리자만
});
