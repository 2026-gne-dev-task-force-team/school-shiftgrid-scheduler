// F-13: 특별실 주간 표 · 끌어 옮기기 미리보기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomWeek, isClash, movePreview } from '../shared/ttDrag.js';

const c = (classroom_id, weekday, period, o = {}) => ({ classroom_id, weekday, period, subject_id: 1, membership_id: null, special_room_id: null, ...o });

test('특별실 주간: 방별로 모으고 다른 반 둘이면 겹침', () => {
  const cells = [c(1, 1, 2, { special_room_id: 5 }), c(2, 1, 2, { special_room_id: 5 }), c(3, 2, 1, { special_room_id: 5 }), c(4, 1, 2, { special_room_id: 6 })];
  const m = roomWeek(cells, '5');
  assert.equal(m.size, 2);
  assert.ok(isClash(m.get('1:2')));
  assert.ok(!isClash(m.get('2:1')));
});
test('끌기 미리보기: 같은 교사가 다른 반에 있는 자리로 옮기면 겹침 · 보낸 칸은 빈다', () => {
  const cells = [c(1, 1, 1, { membership_id: 9 }), c(2, 1, 2, { membership_id: 9 })];
  const r = movePreview(cells, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 2 });
  assert.equal(r.overlaps.length, 1);
  assert.ok(r.vacates);
  const ok = movePreview(cells, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 3 });
  assert.deepEqual(ok.overlaps, []);
});
test('끌기 미리보기: 채워진 칸 위로는 맞바꿈, 제자리는 null', () => {
  const cells = [c(1, 1, 1), c(1, 1, 2)];
  assert.ok(movePreview(cells, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 2 }).swap);
  assert.equal(movePreview(cells, { classroom_id: 1, weekday: 1, period: 1 }, { classroom_id: 1, weekday: 1, period: 1 }), null);
});
