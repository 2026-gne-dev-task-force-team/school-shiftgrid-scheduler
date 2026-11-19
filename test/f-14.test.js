// F-14: 연강 3 생성 · 이어 하기(저장된 최선해에서 시작)
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, solve, prepare } from '../web/src/gen/core.js';

const base = (block, hours, P = 6, L = 3) => ({
  classrooms: [{ id: 1, grade: 1 }], periods: { grades: { 1: { periods: P, lunchAfter: L } } }, days: 5,
  lines: [{ classroom_id: 1, membership_id: 'T', subject_id: 'S', weekly_hours: hours, block }], pins: [],
});
const runs = (cells) => { const by = {}; for (const c of cells) (by[c.weekday] ||= []).push(c.period); return Object.values(by).map((a) => a.sort((x, y) => x - y)); };

test('연강 3: 3연속으로 놓고 점심을 넘지 않는다', () => {
  const r = generate(base(3, 6), { k: 1, perMs: 500 }).candidates[0];
  assert.equal(r.hard, 0);
  for (const a of runs(r.cells)) {
    assert.equal(a.length, 3);
    assert.equal(a[2] - a[0], 2);
    assert.ok(!(a[0] <= 3 && a[2] > 3), '점심(3교시 뒤)을 가로지름');
  }
});

test('연강 3: 못 놓으면 경고를 남기고 생성은 계속', () => {
  const r = generate(base(3, 3, 2, 0), { k: 1, perMs: 200 }).candidates[0]; // 하루 2교시 — 3연강 불가
  assert.equal(r.unplaced.length, 1);
  assert.equal(r.warnings[0].rule, 'block_unplaced');
});

test('이어 하기: 저장된 최선해의 칸을 그대로 되살린다', () => {
  const inp = base(1, 8);
  const first = generate(inp, { k: 1, perMs: 300 }).candidates[0];
  const r = solve(prepare(inp), { seed: 99, init: first.cells });
  const key = (cs) => cs.map((c) => `${c.weekday}:${c.period}`).sort().join();
  assert.equal(key(r.cells), key(first.cells));
});
