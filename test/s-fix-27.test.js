import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSoftScore } from '../web/src/gen/soft-adapter.js';
import { mergeConfig } from '../server/orgConfig.js';

const cls = [{ id: 1, grade: 1, class_no: 1 }];
const mk = (membership_id, period, subject_id = 5) => ({ classroom_id: 1, weekday: 1, period, subject_id, membership_id });
const input = { classrooms: cls, periods: { grades: {} }, lines: [], tiers: { 7: 1 } };

test('회피 칸이 input.avoid 로 들어오면 avoidance 점수가 0 이 아니다', () => {
  const cells = [mk(7, 1)];
  const base = makeSoftScore(input)({ cells });
  assert.ok(makeSoftScore({ ...input, avoid: { 7: [{ weekday: 1, period: 1 }] } })({ cells }) > base);
});

test('params(연속 한도)·기관 기본 점심 자리가 들어오면 해당 규칙 점수가 생긴다', () => {
  const cells = [mk(7, 1), mk(7, 2), mk(7, 3)];
  const base = makeSoftScore(input)({ cells });
  assert.ok(makeSoftScore({ ...input, params: { maxConsec: 2 } })({ cells }) > base);
  // 점심 자리 기본 3 → 3·4교시 연속 수업은 점심 확보 위반
  const lunch = [mk(7, 3), mk(7, 4)];
  const at = (n) => makeSoftScore({ ...input, params: { lunchAfter: n } })({ cells: lunch });
  assert.ok(at(3) > at(9));
});

test('숫자 기본값은 org.config 에 있고 기관이 덮는다', () => {
  assert.equal(mergeConfig({}).softParams.maxConsec, 6);
  assert.equal(mergeConfig({ softParams: { maxConsec: 4 } }).softParams.maxConsec, 4);
  assert.equal(mergeConfig({ softParams: { maxConsec: 4 } }).softParams.amTolerance, 3);
});
