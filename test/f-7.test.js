// F-7: 첫 방문 키 · 켜진 것만 나열 · 따라 하기 대본 · 완료 체크 — 순수 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuresUpTo, featureDiff, FEATURES } from '../shared/features.js';
import { PITCH } from '../shared/feature-pitch.js';
import { seenKey, seenPrefix, clearSeen, pitchKeyFor, orderLine, welcomeSteps, WALKTHROUGH, stageTarget, parseDone, toggleDone } from '../shared/feature-guide.js';

test('첫 방문 키는 기관·사람·메뉴마다 다르다', () => {
  assert.notEqual(seenKey(1, 2, 'gen'), seenKey(1, 3, 'gen'));
  assert.notEqual(seenKey(1, 2, 'gen'), seenKey(2, 2, 'gen'));
  assert.ok(seenKey(1, 2, 'gen').startsWith(seenPrefix(1, 2)));
  assert.ok(!seenKey(1, 22, 'gen').startsWith(seenPrefix(1, 2))); // 2 와 22 가 섞이지 않는다
});
test('안내 다시 보기는 그 사람 키만 지운다', () => {
  const m = new Map([[seenKey(1, 2, 'gen'), '1'], [seenKey(1, 2, 'out'), '1'], [seenKey(1, 3, 'gen'), '1'], ['other', 'x']]);
  const st = { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => m.delete(k) };
  assert.equal(clearSeen(st, seenPrefix(1, 2)), 2);
  assert.deepEqual([...m.keys()].sort(), [seenKey(1, 3, 'gen'), 'other'].sort());
});
test('메뉴 → 소개 글: 격자는 intro · 켜진 첫 스위치 · 내 정보는 없음 · 모든 소개 키가 PITCH 에 있다', () => {
  assert.equal(pitchKeyFor('grid', {}, PITCH), 'intro');
  assert.equal(pitchKeyFor('me', {}, PITCH), null);
  assert.equal(pitchKeyFor('gen', {}, PITCH), 'gen');
  assert.equal(pitchKeyFor('school', { setup: false }, PITCH), 'loads'); // 첫 스위치가 꺼졌으면 다음 켜진 것
  assert.equal(pitchKeyFor('softset', { soft: false, small: false }, PITCH), 'levels');
  for (const m of ['roster', 'mine', 'school', 'gen', 'softset', 'orgcfg', 'out', 'att', 'sub', 'rooms', 'audit']) assert.ok(pitchKeyFor(m, {}, PITCH), m);
});
test('순서 안내는 켜진 것만', () => {
  assert.equal(orderLine({}), '명단 → 학교 기본(시수표까지) → 자동 생성 → 시안 저장 → 확정 → 출력');
  assert.equal(orderLine(featuresUpTo(0)), '시안 저장 → 확정');
  assert.ok(!orderLine(featuresUpTo(2)).includes('자동 생성'));
  assert.equal(welcomeSteps(featuresUpTo(0)).length, 1);
  assert.equal(welcomeSteps(featuresUpTo(1)).length, 3);
  assert.equal(welcomeSteps({}).length, 4);
});
test('대본은 1~6단계 각 2~4줄이고 단계 키는 그 단계 스위치뿐', () => {
  assert.deepEqual(WALKTHROUGH.map((w) => w.stage), [1, 2, 3, 4, 5, 6]);
  for (const w of WALKTHROUGH) assert.ok(w.steps.length >= 2 && w.steps.length <= 4, w.title);
  assert.deepEqual(Object.keys(stageTarget(3)).sort(), ['gen', 'pins']);
  assert.ok(Object.keys(stageTarget(5)).every((k) => FEATURES.find((f) => f.key === k).stage === 5));
});
test('이 단계 켜기는 바뀐 키만 — 다른 단계는 건드리지 않는다', () => {
  const now = featuresUpTo(2);
  assert.deepEqual(featureDiff(now, stageTarget(3)), { gen: true, pins: true });
  assert.deepEqual(featureDiff({ ...now, gen: true, pins: true }, stageTarget(3)), {});
});
test('완료 체크: 깨진 값은 빈 목록 · 토글', () => {
  assert.deepEqual(parseDone('깨짐'), []);
  assert.deepEqual(parseDone('[1,9,"x",3]'), [1, 3]);
  assert.deepEqual(toggleDone([1], 3), [1, 3]);
  assert.deepEqual(toggleDone([1, 3], 1), [3]);
});
