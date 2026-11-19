// 생성 중간 결과 저장: 키가 기관·학기·시간표로 갈리고, 남의 키·깨진 값은 읽히지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { genKey, packPartial, unpackPartial } from '../web/src/gen/store.js';

test('키는 기관·학기·시간표마다 다르다', () => {
  assert.notEqual(genKey(1, 2), genKey(3, 2));
  assert.notEqual(genKey(1, 2), genKey(1, 3));
  assert.notEqual(genKey(1, 2, 5), genKey(1, 2));
  assert.throws(() => genKey(null, 2));
});
test('직렬화 왕복 · 다른 기관 키/깨진 값/빈 후보는 null', () => {
  const k = genKey(1, 2);
  const p = { done: 3, k: 8, candidates: [{ rank: 0, hard: 0, rr: 0, soft: 1, cells: [{ weekday: 1 }], unplaced: [] }] };
  const back = unpackPartial(k, packPartial(k, p));
  assert.deepEqual(back.candidates, p.candidates);
  assert.equal(back.done, 3);
  assert.equal(unpackPartial(genKey(9, 2), packPartial(k, p)), null);
  assert.equal(unpackPartial(k, '{깨짐'), null);
  assert.equal(unpackPartial(k, packPartial(k, { ...p, candidates: [] })), null);
  assert.equal(unpackPartial(k, undefined), null);
});
