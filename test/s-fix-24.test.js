import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('보결 대리 올리기: 관리자 됨(감사 로그에 누가 누구 대신) · 남의 기관 교사 404 · 교직원은 남 대신 못 함', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const P = `/api/orgs/${f.orgA}`;
  const admin = await f.as('adminA');
  const body = (mid) => ({ on_date: '2026-11-17', absent_membership_id: Number(mid), items: [{ period: 2 }], reason: '연수' });
  const ok = await admin.call('POST', `${P}/substitutes`, body(f.users.staffA.mid));
  assert.equal(ok.status, 201);
  const row = (await f.pool.query(`SELECT absent_membership_id FROM substitute WHERE id = $1`, [ok.json.ids[0]])).rows[0];
  assert.equal(String(row.absent_membership_id), String(f.users.staffA.mid));
  const log = (await f.pool.query(`SELECT after FROM audit_log WHERE org_id = $1 AND action = 'substitute.create' ORDER BY id DESC LIMIT 1`, [f.orgA])).rows[0].after;
  assert.equal(String(log.by_membership_id), String(f.users.adminA.mid));
  assert.equal(String(log.for_membership_id), String(f.users.staffA.mid));
  assert.equal((await admin.call('POST', `${P}/substitutes`, body(f.B.mem))).status, 404);
  const staff = await f.as('staffA');
  assert.equal((await staff.call('POST', `${P}/substitutes`, body(f.users.adminA.mid))).status, 404);
});

test('보관 학기: 시수·고정·반을 id 로 고쳐도 409', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const { pool, A } = f;
  const P = `/api/orgs/${f.orgA}`;
  const c = await f.as('adminA');
  const load = (await pool.query(`INSERT INTO teaching_load (org_id, term_id, subject_id, classroom_id, weekly_hours) VALUES ($1,$2,$3,$4,2) RETURNING id`, [f.orgA, A.term, A.subject, A.class])).rows[0].id;
  const pin = (await pool.query(`INSERT INTO pin (org_id, term_id, target_kind, target_id, weekday, period, kind) VALUES ($1,$2,'교사',$3,1,1,'금지') RETURNING id`, [f.orgA, A.term, f.users.staffA.mid])).rows[0].id;
  await pool.query(`UPDATE term SET status = '보관' WHERE id = $1`, [A.term]);
  assert.equal((await c.call('PATCH', `${P}/loads/${load}`, { weekly_hours: 3 })).status, 409);
  assert.equal((await c.call('DELETE', `${P}/loads/${load}`)).status, 409);
  assert.equal((await c.call('DELETE', `${P}/pins/${pin}`)).status, 409);
  assert.equal((await c.call('PATCH', `${P}/classrooms/${A.class}`, { student_count: 20 })).status, 409);
  assert.equal((await pool.query(`SELECT weekly_hours FROM teaching_load WHERE id = $1`, [load])).rows[0].weekly_hours, 2);
});
