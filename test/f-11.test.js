// F-11: 기능 소개 카드 — intro + FEATURE_KEYS 전부 · 빈 칸 없음 · terms 는 낱말 풀이에 있는 낱말
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../shared/features.js';
import { PITCH } from '../shared/feature-pitch.js';
import { GLOSSARY } from '../web/src/glossary.js';

const TEXT = ['line', 'concept', 'forSchools', 'pain', 'relief', 'scene', 'skipIf', 'tryIt'];

test('feature-pitch: 카드가 빠짐·남음 없이 있고 칸이 다 찼다', () => {
  assert.deepEqual(Object.keys(PITCH), ['intro', ...FEATURE_KEYS]);
  for (const [k, c] of Object.entries(PITCH)) {
    assert.deepEqual(Object.keys(c).sort(), [...TEXT, 'terms'].sort(), k);
    for (const f of TEXT) assert.ok(typeof c[f] === 'string' && c[f].trim().length >= 10, `${k}.${f}`);
    assert.ok(c.line.length >= 15 && c.line.length <= 30, `${k}.line 길이 ${c.line.length}`);
    assert.ok(c.terms.length >= 1 && c.terms.every((t) => t in GLOSSARY), `${k}.terms`);
    assert.ok(c.scene.includes('가상'), `${k}.scene 가상 표시`);
    assert.ok(!/\d\s*%/.test(TEXT.map((f) => c[f]).join(' ')), `${k} 퍼센트 숫자`);
  }
});
