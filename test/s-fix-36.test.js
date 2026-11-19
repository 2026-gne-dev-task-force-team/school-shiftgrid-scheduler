// S-fix-36: 기록 요약(이름·등급·전→후) · 멤버십 번호를 이름으로
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeChange } from '../shared/audit-labels.js';
import { idsIn, nameIds } from '../server/routes/audit-log.js';

test('기록 요약: 등급은 이름으로, 전→후는 「A → B」 꼴', () => {
  const r = summarizeChange({ status: '접수', taken: null }, { taken: '김선생', grade: 'D' });
  assert.equal(r.text, '이전 상태 접수 · 맡은 사람 - → 김선생 · 등급 수업 없는 분·그 밖');
  assert.equal(r.raw, false);
  assert.deepEqual(summarizeChange(null, { ids: [1], zzz: 1 }), { text: '건수 1개', raw: true });
});

test('멤버십 번호는 이름으로 바뀌고 못 찾으면 지운 계정', () => {
  assert.deepEqual([...idsIn({ taken: 11673, status: 'x' }, { by_membership_id: '5', taken: '박강사' })].sort(), ['11673', '5']);
  const names = new Map([['11673', '김선생']]);
  assert.deepEqual(nameIds({ taken: 11673, by_membership_id: 9, on_date: 'd' }, names), { taken: '김선생', by: '지운 계정', on_date: 'd' });
  assert.deepEqual(nameIds({ taken: '박강사' }, names), { taken: '박강사' });
});
