// F-3: 스위치판 순수 함수 — 단계 단추가 바꿀 키 · 써 보기 메뉴 · 단계 묶음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, FEATURE_KEYS, MENU_FEATURES, featuresUpTo, featureDiff, tryMenu, featureStages } from '../shared/features.js';

test('전부 켠 상태에서 0단계로 → 14개 전부 끈다', () => {
  const d = featureDiff({}, featuresUpTo(0));
  assert.equal(Object.keys(d).length, FEATURE_KEYS.length);
  assert.ok(Object.values(d).every((v) => v === false));
});
test('이미 같은 단계면 바뀐 키 없음 · 빠진 키는 켬으로 본다', () => {
  assert.deepEqual(featureDiff(featuresUpTo(2), featuresUpTo(2)), {});
  assert.deepEqual(featureDiff({ gen: false }, { gen: true, setup: true }), { gen: true });
});
test('1단계 → 3단계는 2·3단계 키만 켠다', () => {
  const d = featureDiff(featuresUpTo(1), featuresUpTo(3));
  assert.deepEqual(Object.keys(d).sort(), FEATURES.filter((f) => f.stage === 2 || f.stage === 3).map((f) => f.key).sort());
});
test('tryMenu: 모든 키가 실재 메뉴나 grid', () => {
  const menus = new Set([...Object.keys(MENU_FEATURES), 'grid']);
  for (const k of [...FEATURE_KEYS, 'intro']) assert.ok(menus.has(tryMenu(k)), k);
  assert.equal(tryMenu('gen'), 'gen');
  assert.equal(tryMenu('import'), 'out');
  assert.equal(tryMenu('intro'), 'grid');
});
test('featureStages 는 1~6 에 14개를 빠짐없이', () => {
  assert.equal(featureStages().flatMap((s) => s.items).length, FEATURES.length);
});
