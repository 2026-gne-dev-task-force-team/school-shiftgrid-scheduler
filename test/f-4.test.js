// F-4: 화면 안 조각(탭) 거르기 — 순수 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS, SCHOOL_TAB_FEATURE, OUT_TAB_FEATURE, visibleTabs } from '../shared/features.js';

const S = ['basic', 'spec', 'loads', 'pins', 'rules'];
const O = ['down', 'lunch', 'cmp', 'homeroom'];

test('탭 맵의 키는 모두 실재 스위치', () => {
  for (const k of [...Object.values(SCHOOL_TAB_FEATURE), ...Object.values(OUT_TAB_FEATURE)]) assert.ok(FEATURE_KEYS.includes(k));
});
test('빠진 키·features 없음은 전부 보임', () => {
  assert.deepEqual(visibleTabs(SCHOOL_TAB_FEATURE, undefined, S), S);
  assert.deepEqual(visibleTabs(OUT_TAB_FEATURE, {}, O), O);
});
test('학교 기본 탭: loads 끄면 전담·시수표, pins 끄면 고정·금지, levels 끄면 규칙 수위만 빠짐', () => {
  assert.deepEqual(visibleTabs(SCHOOL_TAB_FEATURE, { loads: false }, S), ['basic', 'pins', 'rules']);
  assert.deepEqual(visibleTabs(SCHOOL_TAB_FEATURE, { pins: false, levels: false }, S), ['basic', 'spec', 'loads']);
  assert.equal(visibleTabs(SCHOOL_TAB_FEATURE, { setup: false }, S)[0], 'spec');
});
test('출력: import 와 output 은 따로', () => {
  assert.deepEqual(visibleTabs(OUT_TAB_FEATURE, { import: false }, O), ['down', 'lunch', 'cmp']);
  assert.deepEqual(visibleTabs(OUT_TAB_FEATURE, { output: false }, O), ['homeroom']);
});
