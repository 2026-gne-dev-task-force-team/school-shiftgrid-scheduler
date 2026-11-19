import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('새 학기: 되묻기 → 지난 학기 보관 · 명단 유지 · 보관 시간표 쓰기 거부 · 감사 로그', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const { pool, A } = f;
  const c = await f.as('adminA');
  const P = `/api/orgs/${f.orgA}`;
  const members = async () => (await pool.query(`SELECT count(*)::int AS n FROM membership WHERE org_id = $1 AND deleted_at IS NULL`, [f.orgA])).rows[0].n;
  const before = await members();

  const ask = await c.call('POST', `${P}/terms/new-semester`, {});
  assert.equal(ask.status, 409);
  assert.equal(ask.json.needConfirm, true);
  assert.equal((await pool.query(`SELECT status FROM term WHERE id = $1`, [A.term])).rows[0].status, '진행'); // 확인 전엔 그대로

  const ok = await c.call('POST', `${P}/terms/new-semester`, { confirm: true });
  assert.equal(ok.status, 200);
  assert.equal((await pool.query(`SELECT status FROM term WHERE id = $1`, [A.term])).rows[0].status, '보관');
  const now = (await c.call('GET', `${P}/term`)).json;
  assert.notEqual(Number(now.id), Number(A.term));
  assert.equal(now.year, 2027); // 2026-2학기 다음은 2027-1학기
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM classroom WHERE term_id = $1 AND deleted_at IS NULL`, [now.id])).rows[0].n, 0); // 새 학기 반은 비어 있음
  assert.equal(await members(), before); // 명단 유지
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE org_id = $1 AND action = 'term.new_semester'`, [f.orgA])).rows[0].n, 1);

  const ov = await c.call('GET', `${P}/terms/${A.term}/overview`); // 보관 학기는 볼 수 있다
  assert.equal(ov.status, 200);
  assert.equal(ov.json.classrooms.length, 1);
  assert.equal((await c.call('PATCH', `${P}/timetables/${A.tt}`, { name: '고침' })).status, 409); // 보관 학기 쓰기 거부
  assert.equal((await c.call('GET', `${P}/timetables/${A.tt}`)).status, 200);

  const staff = await f.as('staffA');
  assert.equal((await staff.call('POST', `${P}/terms/new-semester`, { confirm: true })).status, 404); // 관리자만(권한 없으면 404)
});

test('새 학기: 남의 기관 학기는 404', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const c = await f.as('adminA');
  assert.equal((await c.call('GET', `/api/orgs/${f.orgA}/terms/${f.B.term}/overview`)).status, 404);
  assert.equal((await c.call('GET', `/api/orgs/${f.orgB}/terms`)).status, 404); // 남의 기관 경로
});
