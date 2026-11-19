import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('새 학기 뒤: 반 목록은 현재 학기만 · termId 로 보관 학기 · 가져오기 · 시안 저장·확정 감사', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const { pool, A } = f;
  const c = await f.as('adminA');
  const P = `/api/orgs/${f.orgA}`;
  const n0 = (await c.call('GET', `${P}/classrooms`)).json.length;
  assert.ok(n0 >= 1);

  assert.equal((await c.call('POST', `${P}/terms/new-semester`, { confirm: true })).status, 200);
  assert.equal((await c.call('GET', `${P}/classrooms`)).json.length, 0); // 지난 학기 반이 안 섞임
  assert.equal((await c.call('GET', `${P}/timetables`)).json.length, 0);
  const old = (await c.call('GET', `${P}/classrooms?termId=${A.term}`)).json;
  assert.equal(old.length, n0);
  assert.ok(old.every((x) => Number(x.term_id) === Number(A.term)));
  assert.equal((await c.call('GET', `${P}/classrooms?termId=${f.B.term}`)).json.length, 0); // 남의 기관 학기는 무시 → 현재 학기

  const imp = await c.call('POST', `${P}/terms/import-previous`, {});
  assert.equal(imp.status, 200);
  assert.equal(imp.json.classrooms, n0);
  assert.equal((await c.call('GET', `${P}/classrooms`)).json.length, n0);
  assert.equal((await c.call('POST', `${P}/terms/import-previous`, {})).status, 409); // 두 번은 안 됨

  const cls = (await c.call('GET', `${P}/classrooms`)).json[0];
  const sv = await c.call('POST', `${P}/timetables/generated`, { name: '시안1', cells: [{ classroom_id: cls.id, weekday: 1, period: 1 }] });
  assert.equal(sv.status, 201);
  assert.equal((await c.call('POST', `${P}/timetables/${sv.json.id}/confirm`, { starts_on: '2027-03-02' })).status, 200);
  const cnt = async (a) => (await pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE org_id = $1 AND action = $2 AND row_id = $3`, [f.orgA, a, sv.json.id])).rows[0].n;
  assert.equal(await cnt('timetable.save'), 1);
  assert.equal(await cnt('timetable.confirm'), 1);
});
