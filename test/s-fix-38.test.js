// S-fix-38: 같은 종류 특별실 묶기 · 겸임 실패 응답 통일 · 예약 겹침 서버 재확인 · 포인터 끌기 · 미리보기 정원
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_DB, setup } from './sec-helpers.js';
import { generate, roomKind } from '../web/src/gen/core.js';
import { movePreview } from '../shared/ttDrag.js';

test('1. 방 종류: 숫자·제N·끝 영문 한 글자를 떼고, 과학A실·과학B실이 같은 방 묶음', () => {
  assert.equal(roomKind('과학A실'), '과학실');
  assert.equal(roomKind('과학1실'), '과학실');
  assert.equal(roomKind('제2과학실'), '과학실');
  assert.equal(roomKind('강당'), '강당');
  const classrooms = [1, 2].map((id) => ({ id, grade: 3, class_no: id }));
  const rooms = [{ id: 10, name: '과학A실' }, { id: 11, name: '과학B실' }];
  const r = generate({ classrooms, periods: { grades: { 3: { periods: 1, lunchAfter: 0 } } }, days: 1, rooms,
    lines: classrooms.map((c) => ({ classroom_id: c.id, membership_id: 100 + c.id, subject_id: 1, special_room_id: 10, weekly_hours: 1 })), pins: [] }, { k: 1, perMs: 300 });
  assert.deepEqual(r.candidates[0].cells.map((c) => c.special_room_id).sort(), [10, 11]);
});

test('2·3. 겸임 실패 응답이 같고 · 예약 겹침은 409+목록, force 로 저장', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const b = await f.as('adminB');
  const url = `/api/orgs/${f.orgB}/roster/concurrent`;
  const none = await b.call('POST', url, { loginId: 'no-such-id-zz' });
  const dup = await b.call('POST', url, { loginId: f.users.adminB.loginId }); // 이미 이 기관 소속
  assert.equal(none.status, dup.status);
  assert.deepEqual(none.json, dup.json);

  const a = await f.as('adminA');
  const P = `/api/orgs/${f.orgA}`;
  const body = { special_room_id: Number(f.A.room), on_date: '2026-11-16', period: 3 };
  assert.equal((await a.call('POST', `${P}/bookings`, body)).status, 201);
  const s = await f.as('staffA');
  const again = await s.call('POST', `${P}/bookings`, body);
  assert.equal(again.status, 409);
  assert.ok(again.json.overlaps.length > 0);
  assert.equal((await s.call('POST', `${P}/bookings`, { ...body, force: true })).status, 201);
});

test('4. 끌어 옮기기는 포인터 이벤트(마우스·터치 공통), HTML5 drag 이벤트는 쓰지 않는다', () => {
  const src = readFileSync(new URL('../web/src/s1c/Grid.jsx', import.meta.url), 'utf8');
  assert.match(src, /onPointerDown/);
  assert.match(src, /onPointerUp/);
  assert.doesNotMatch(src, /onDragStart|draggable=/);
});

test('5. 미리보기에 특별실 정원 초과가 경고로 더해진다', () => {
  const c = (classroom_id, period) => ({ classroom_id, weekday: 1, period, subject_id: 1, membership_id: null, special_room_id: 5 });
  const cells = [c(1, 1), c(2, 2)];
  const mv = (ctx) => movePreview(cells, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 2 }, ctx);
  assert.ok(mv({ roomCap: { 5: 30 }, studentOf: { 1: 20, 2: 20 } }).overlaps.some((d) => d.includes('정원')));
  assert.ok(!mv({ roomCap: { 5: 50 }, studentOf: { 1: 20, 2: 20 } }).overlaps.some((d) => d.includes('정원')));
});
