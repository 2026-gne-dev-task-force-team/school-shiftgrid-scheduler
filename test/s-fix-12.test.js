import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// S-fix-12: 명단 올리기 화면이 렌더 중에 doImport 를 부르던 버그(React #301 · 확인 없이 저장)의 재발 방지
test('Roster.jsx: onClick 에 함수 호출 결과를 넘기지 않는다', () => {
  const src = readFileSync(new URL('../web/src/s1a/Roster.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /onClick=\{(doImport|getTemplate|run)\(/);
});
