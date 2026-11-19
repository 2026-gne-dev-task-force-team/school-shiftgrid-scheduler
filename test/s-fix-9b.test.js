// S-fix-9b — 기관 설정: 요일 수·식사 빈 칸 끄기·교시 상한이 생성기에 인자로 들어가고, 설정 기본값이 폴백된다
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../web/src/gen/core.js';
import { rules } from '../web/src/gen/soft.js';
import { resolveParams } from '../web/src/gen/soft-adapter.js';
import { DEFAULTS, mergeConfig, dutyOptions, roleLabel } from '../web/src/orgConfig.js';

const line = (c, m, s, h) => ({ classroom_id: c, membership_id: m, subject_id: s, special_room_id: null, weekly_hours: h, sync_progress: false });

test('core 가 요일 6개를 받으면 6일로 짓는다', () => {
  const input = { days: 6, classrooms: [{ id: 1, grade: 1 }], periods: { grades: { 1: { periods: 5, lunchAfter: 0 } } }, lines: [line(1, 11, 1, 15), line(1, 12, 2, 15)] };
  const best = generate(input, { k: 2, perMs: 400 }).candidates[0];
  assert.equal(best.hard, 0);
  assert.equal(Math.max(...best.cells.map((c) => c.weekday)), 6);
  assert.equal(best.cells.length, 30);
});

test('요일 인자가 없으면 지금처럼 5일', () => {
  const input = { classrooms: [{ id: 1, grade: 1 }], periods: { grades: { 1: { periods: 5, lunchAfter: 0 } } }, lines: [line(1, 11, 1, 25)] };
  const best = generate(input, { k: 1, perMs: 300 }).candidates[0];
  assert.equal(Math.max(...best.cells.map((c) => c.weekday)), 5);
  assert.equal(best.hard, 0);
});

// 한 교사가 점심 자리가 다른 두 학년을 하루 5칸 꽉 채워 가르친다 — 식사 빈 칸을 필수로 두면 다 못 놓는다
const mealInput = (hardOff) => ({
  hardOff,
  classrooms: [{ id: 1, grade: 1 }, { id: 2, grade: 2 }],
  periods: { grades: { 1: { periods: 4, lunchAfter: 2 }, 2: { periods: 4, lunchAfter: 3 } } },
  lines: [line(1, 11, 1, 12), line(2, 11, 1, 13)],
});
test('식사 빈 칸 규칙을 끄면 다 놓는다(켜면 못 놓은 시수가 남는다)', () => {
  const on = generate(mealInput([]), { k: 4, perMs: 400 }).candidates[0];
  const off = generate(mealInput(['teacherMealGap']), { k: 4, perMs: 400 }).candidates[0];
  assert.ok(on.hard > 0, `켠 쪽 hard=${on.hard}`);
  assert.equal(off.hard, 0, `끈 쪽 hard=${off.hard}`);
});

test('교시 상한 인자(maxPeriods)와 미지정 기본(defaultPeriods)', () => {
  const input = { maxPeriods: 4, defaultPeriods: 3, classrooms: [{ id: 1, grade: 1 }, { id: 2, grade: 2 }], periods: { grades: { 2: { periods: 9, lunchAfter: 0 } } }, lines: [line(1, 11, 1, 10), line(2, 12, 1, 10)] };
  const best = generate(input, { k: 1, perMs: 300 }).candidates[0];
  const maxP = (id) => Math.max(...best.cells.filter((c) => c.classroom_id === id).map((c) => c.period));
  assert.ok(maxP(1) <= 3);
  assert.ok(maxP(2) <= 4);
});

test('상위 티어 이른 시각 우선 — earlyTiers 로 범위를 바꾼다', () => {
  const cell = (t) => ({ classroom_id: 1, weekday: 1, period: 5, teacher_id: t, subject_id: 1 });
  const s = { classrooms: [{ id: 1, grade: 1 }], lunchAfter: { 1: 4 }, teachers: [{ id: 1, tier: 1 }, { id: 2, tier: 2 }], cells: [cell(1), cell(2)] };
  assert.equal(rules.priorityEarly(s).length, 2);
  assert.equal(rules.priorityEarly({ ...s, params: { earlyTiers: [1] } }).length, 1);
  assert.deepEqual(resolveParams({ earlyTiers: [1, 9] }).earlyTiers, [1]);
});

test('orgConfig 기본값 폴백', () => {
  assert.deepEqual(mergeConfig(undefined), DEFAULTS);
  assert.deepEqual(mergeConfig({}).weekdays, ['월', '화', '수', '목', '금']);
  const m = mergeConfig({ weekdays: ['월', '화', '수', '목', '금', '토'], limits: { periods: 10 } });
  assert.equal(m.weekdays.length, 6);
  assert.equal(m.limits.periods, 10);
  assert.equal(m.limits.grades, 12); // 안 준 칸은 기본값
  assert.deepEqual(mergeConfig({ weekdays: [] }).weekdays, DEFAULTS.weekdays); // 빈 목록은 기본값
});

test('직무 목록·역할 표시명', () => {
  assert.deepEqual(dutyOptions(DEFAULTS), ['담임', '전담', '비교과']); // S-fix-11: 목록 하나
  assert.deepEqual(dutyOptions({ duties: ['담임', '행정'] }, '도서'), ['담임', '행정', '도서']);
  assert.equal(roleLabel({ roleLabels: { 교직원: '선생님' } }, '교직원'), '선생님');
  assert.equal(roleLabel(DEFAULTS, '보기만'), '보기만');
});
