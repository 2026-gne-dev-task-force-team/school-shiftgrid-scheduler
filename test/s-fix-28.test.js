import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('칸에 특별실 배정 저장·조회 · 비우면 NULL', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const P = `/api/orgs/${f.orgA}`;
  const c = await f.as('adminA');
  const base = { classroom_id: f.A.class, weekday: 1, period: 2, subject_id: f.A.subject };
  assert.equal((await c.call('PUT', `${P}/timetables/${f.A.tt}/cells`, { ...base, special_room_id: f.A.room })).status, 200);
  const g = await c.call('GET', `${P}/timetables/${f.A.tt}`);
  assert.equal(String(g.json.cells.find((x) => x.period === 2).special_room_id), String(f.A.room));
  await c.call('PUT', `${P}/timetables/${f.A.tt}/cells`, { ...base, special_room_id: null });
  const g2 = await c.call('GET', `${P}/timetables/${f.A.tt}`);
  assert.equal(g2.json.cells.find((x) => x.period === 2).special_room_id, null);
});

test('남의 기관 특별실 id 로 배정하면 404', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const c = await f.as('adminA');
  const r = await c.call('PUT', `/api/orgs/${f.orgA}/timetables/${f.A.tt}/cells`, { classroom_id: f.A.class, weekday: 1, period: 3, special_room_id: f.B.room });
  assert.equal(r.status, 404);
});
