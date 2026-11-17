/**
 * 실명 거름 — 공개 레포에 실제 사람 성함이 들어가지 않게 한다.
 * 금지 목록에는 성함이 아니라 sha256 해시만 둔다(목록 자체가 유출 경로가 되지 않게).
 * 추적 파일의 한글 덩어리에서 2~4글자 부분 문자열을 모두 해시해 목록과 겹치면 실패한다.
 * 새 이름을 막으려면 해시만 더한다: printf %s '이름' | shasum -a 256
 * 정답지는 `OPS_FIXTURE_DIR` 로 레포 밖에서 준다 · 없으면 건너뜀이며 건너뜀≠통과.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BANNED = new Set([
  'f7d651f64acd7b528417fa74529ec591b485cace85758dccc7097c381a49fb18',
]);

const root = resolve(__dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function findBanned(text: string): number {
  let hits = 0;
  for (const run of text.match(/[가-힣]+/g) ?? []) {
    for (let i = 0; i < run.length; i++) {
      for (let len = 2; len <= 4 && i + len <= run.length; len++) {
        if (BANNED.has(sha(run.slice(i, i + len)))) hits++;
      }
    }
  }
  return hits;
}

describe('실명 거름', () => {
  it('추적 파일(경로 포함)에 금지 목록의 이름이 없다', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root, maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8').split('\0').filter(Boolean);
    const bad: string[] = [];
    for (const f of files) {
      const abs = resolve(root, f);
      if (!existsSync(abs)) continue;
      if (findBanned(f) > 0) { bad.push(f); continue; }
      if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf|xlsx?|hwpx?)$/i.test(f)) continue;
      if (findBanned(readFileSync(abs, 'utf8')) > 0) bad.push(f);
    }
    expect(bad, '실명이 든 파일(내용은 출력하지 않음)').toEqual([]);
  }, 60_000); // 전역 제한시간으로도 모자란 하나만 남김 — 윈도우는 git ls-files + 전수 읽기가 느려 병렬 부하에서 기본 5초를 넘는다
});
