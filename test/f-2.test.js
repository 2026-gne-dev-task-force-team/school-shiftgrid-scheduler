// F-2: 기관 스위치대로 메뉴 숨기기(순수 함수) — 전부 켬 · 1단계 · 빠진 키는 켬 · 권한과 AND
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS, featuresUpTo, visibleMenus, MENU_FEATURES } from '../shared/features.js';

const ALL = ['roster', 'school', 'grid', 'gen', 'softset', 'orgcfg', 'out', 'mine', 'att', 'sub', 'rooms', 'audit', 'me'];
const items = (show = true) => ALL.map((v) => ({ v, show }));
const vs = (f, it = items()) => visibleMenus(it, f).map((i) => i.v);

test('MENU_FEATURES 의 키는 모두 실재 스위치', () => {
  for (const ks of Object.values(MENU_FEATURES)) assert.ok(ks.every((k) => FEATURE_KEYS.includes(k)));
});
test('전부 켬 · 빠진 키·features 없음은 켬', () => {
  assert.deepEqual(vs(featuresUpTo(6)), ALL);
  assert.deepEqual(vs(undefined), ALL);
  assert.deepEqual(vs({}), ALL);
});
test('1단계: 명단·학교 기본·내 시간표만 더 보임', () => {
  assert.deepEqual(vs(featuresUpTo(1)), ['roster', 'school', 'grid', 'mine', 'me']);
});
test('0단계는 격자·내 정보만', () => {
  assert.deepEqual(vs(featuresUpTo(0)), ['grid', 'me']);
});
test('한 키만 끄면 그 메뉴만 · 권한 없으면 켜도 안 보임', () => {
  assert.ok(!vs({ sub: false }).includes('sub'));
  assert.equal(vs({ sub: false }).length, ALL.length - 1);
  assert.deepEqual(vs({}, items(false)), []);
});
