import test from 'node:test';
import assert from 'node:assert/strict';
import { findById, pickOrFirst, sameId } from '../web/src/s1c/pick.js';
import { tempCsv } from '../web/src/s1a/csv.js';

test('반 고르기: 서버가 문자열 id 를 줘도 고른 반을 찾는다', () => {
  const cls = [{ id: '11', grade: 1, class_no: 1 }, { id: '12', grade: 1, class_no: 2 }, { id: 13, grade: 2, class_no: 1 }];
  assert.equal(pickOrFirst(cls, '12').class_no, 2);
  assert.equal(pickOrFirst(cls, 12).class_no, 2);
  assert.equal(pickOrFirst(cls, '13').grade, 2);
  assert.equal(pickOrFirst(cls, '999').id, '11');
  assert.equal(pickOrFirst([], 1), null);
  assert.equal(findById(cls, null), null);
  assert.ok(sameId(5, '5') && !sameId(null, null));
});

test('임시 비번 CSV: 따옴표 감싸기 · BOM · 실패 줄 제외', () => {
  const t = tempCsv([{ ok: true, name: '김,샘', loginId: 'a', temp: 'x"y' }, { ok: false, name: 'z', loginId: 'z', temp: null }]);
  assert.ok(t.startsWith('﻿이름,ID,임시 비밀번호'));
  assert.ok(t.includes('"김,샘","a","x""y"'));
  assert.equal(t.split('\r\n').length, 2);
});
