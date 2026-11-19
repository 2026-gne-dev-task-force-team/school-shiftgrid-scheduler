import test from 'node:test';
import assert from 'node:assert/strict';
import { findOverlaps } from '../shared/overlap.js';
import { mergeConfig } from '../server/orgConfig.js';
import { resolveLevels, applyLevels } from '../server/rules.js';

const cell = (c, room = 7) => ({ classroom_id: c, weekday: 1, period: 2, special_room_id: room, subject_id: 5 });

test('같은 시각 같은 특별실 반들의 학생 수 합 > 정원이면 room_capacity (복식 묶음처럼 겹침이 허용돼도)', () => {
  const ctx = { combined: [[1, 2]], roomCap: { 7: 40 }, studentOf: { 1: 22, 2: 20 } };
  const f = findOverlaps([cell(1), cell(2)], ctx);
  assert.deepEqual(f.map((x) => x.rule), ['room_capacity']); // 묶음이라 room_overlap 은 없고 정원 합만
  assert.match(f[0].detail, /학생 42명 > 정원 40/);
  assert.equal(findOverlaps([cell(1), cell(2)], { ...ctx, roomCap: { 7: 42 } }).length, 0); // 합 == 정원은 통과
  assert.equal(findOverlaps([cell(1), cell(2)], { ...ctx, roomCap: {} }).length, 0); // 정원 없으면 판정 안 함
});

test('수위·세는 단위는 기관 설정 — 기본 알림, 끔·경고·반 수 단위로 바뀐다', () => {
  const found = findOverlaps([cell(1), cell(2), cell(3)], { combined: [[1, 2, 3]], roomCap: { 7: 2 }, studentOf: {}, capCount: mergeConfig({ roomCapacity: { count: 'classes' } }).roomCapacity.count });
  assert.match(found[0].detail, /3개 반/);
  assert.equal(mergeConfig({}).roomCapacity.count, 'students');
  assert.equal(applyLevels(resolveLevels({}), found)[0].level, '알림');
  assert.equal(applyLevels(resolveLevels({ room_capacity: '경고' }), found)[0].level, '경고');
  assert.equal(applyLevels(resolveLevels({ room_capacity: '끔' }), found).length, 0);
});
