// F-5: 격자 확정 재확인 문구 — 순수 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCount, confirmText } from '../shared/ttConfirm.js';

test('빈칸 세기: 학년별 교시 수 x 5 에서 채운 칸을 뺀다', () => {
  const cls = [{ grade: 1 }, { grade: 3 }];
  const periods = { grades: { 1: { periods: 4 }, 3: { periods: 6 } } };
  assert.equal(emptyCount(cls, periods, [{ subject_id: 1 }, { subject_id: null }]), 49);
  assert.equal(emptyCount([{ grade: 2 }], {}, []), 25); // 틀 없으면 5교시
});
test('문구: 문제 없으면 개수 없이, 있으면 개수를 보여 준다', () => {
  assert.ok(!confirmText('A', '2026-03-02', 0, 0).includes('남아'));
  const t = confirmText('A', '2026-03-02', 2, 5);
  assert.ok(t.includes('겹침·알림 2곳') && t.includes('빈칸 5칸'));
});
