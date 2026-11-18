import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, softScore, ruleScore, resolveWeights, DEFAULT_WEIGHTS, SOFT_RULES } from '../web/src/gen/soft.js';

const base = {
  classrooms: [{ id: 1, grade: 1, class_no: 1 }, { id: 2, grade: 2, class_no: 1 }],
  teachers: [{ id: 10, tier: 1 }, { id: 11, tier: 3 }],
  lunchAfter: { 1: 4, 2: 4 },
};
const cell = (classroom_id, weekday, period, teacher_id, subject_id = 1, room_id = null) => ({ classroom_id, weekday, period, teacher_id, subject_id, room_id });

test('규칙 17개가 다 있다', () => {
  assert.equal(Object.keys(SOFT_RULES).length, 17);
  for (const k of Object.keys(SOFT_RULES)) assert.equal(typeof rules[k], 'function', k);
});

test('연속 제한 · 공강 · 점심 연달음', () => {
  const s = { ...base, params: { maxConsec: 2 }, cells: [cell(1, 1, 1, 10), cell(1, 1, 2, 10), cell(1, 1, 3, 10)] };
  assert.equal(rules.consecutive(s)[0].n, 1);
  const gap = { ...base, cells: [cell(1, 1, 1, 10), cell(1, 1, 4, 10)] };
  assert.equal(rules.compactDay(gap)[0].n, 2);
  const lunch = { ...base, cells: [cell(1, 2, 4, 10), cell(1, 2, 5, 10)] };
  assert.equal(rules.lunchBreak(lunch).length, 1);
});

test('회피는 티어가 센다 — 티어1 ×300, 티어3 ×1', () => {
  const mk = (t) => ({ ...base, avoid: { [t]: [{ weekday: 1, period: 1 }] }, cells: [cell(1, 1, 1, t)] });
  assert.equal(ruleScore('avoidance', mk(10)).score, 3 * 300);
  assert.equal(ruleScore('avoidance', mk(11)).score, 3 * 1);
});

test('끔 수위와 선택 규칙 · 기관 가중이 기본값을 덮는다', () => {
  const s = { ...base, cells: [cell(1, 1, 1, 10, 1, 5), cell(1, 1, 2, 10, 2, 6)] };
  assert.equal(ruleScore('roomClassSplit', s).score, 0); // options 로 안 켜면 0
  assert.equal(ruleScore('roomClassSplit', { ...s, options: { roomClassSplit: true } }).count, 1);
  assert.equal(ruleScore('roomClassSplit', { ...s, options: { roomClassSplit: true } }, { roomClassSplit: '끔' }).score, 0);
  const g = { ...base, cells: [cell(1, 1, 1, 10), cell(2, 1, 2, 10)] };
  assert.equal(softScore(g).byRule.gradeBlock.score, 20); // 중요 20 × 티어1 배수 1
  const heavy = resolveWeights({ bands: { 중요: 50 }, bogus: 1 });
  assert.equal(softScore(g, {}, heavy).byRule.gradeBlock.score, 50);
  assert.deepEqual(resolveWeights({ bands: { 중요: -5 } }).bands, DEFAULT_WEIGHTS.bands); // 잘못된 값은 기본값
});

test('빈 상태는 0점', () => {
  assert.equal(softScore({ cells: [], classrooms: [], teachers: [] }).total, 0);
});
