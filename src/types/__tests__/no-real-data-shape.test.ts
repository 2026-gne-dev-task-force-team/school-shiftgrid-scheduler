/**
 * 실자료 모양 거름 — 이름 해시 거름이 못 잡는 「모양」으로 실자료·정답지 반입을 막는다(T-10e9).
 * 대상: git 추적 파일 + 안 무시된 새 파일. 실패 메시지엔 경로만 낸다(내용은 읽지도 출력하지도 않는다).
 *   ⓐ `*.shiftgrid.json` 이 허용 샘플 목록 밖이면 실패
 *   ⓑ 경로에 정답지·실명·deid(대소문자 무시)가 들어가면 실패
 *   ⓒ 200KB 넘는 `.json` 이 허용 목록 밖이면 실패
 * 정답지는 `OPS_FIXTURE_DIR` 로 레포 밖에서 준다 · 없으면 건너뜀이며 건너뜀≠통과.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// ⓐ 커밋돼 있는 합성 샘플(2026-11-17 줄기별 실측: 이 줄기엔 `*.shiftgrid.json` 이 0개). 새 합성 샘플은 여기에 경로를 더한다.
const ALLOWED_SHIFTGRID: ReadonlySet<string> = new Set<string>([]);

// ⓒ 정당한 큰 json(2026-11-17 실측). 이유를 주석으로 단다.
const ALLOWED_BIG_JSON: ReadonlySet<string> = new Set<string>([
  'package-lock.json', // npm 의존성 잠금 파일 — 생성물이라 크다
]);

const MAX_JSON_BYTES = 200 * 1024;
const root = resolve(__dirname, '../../..');

function listFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root, maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8').split('\0').filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => existsSync(resolve(root, f))); // 지운 추적 파일은 건너뛴다
}

describe('실자료 모양 거름', () => {
  const files = listFiles();

  it('ⓐ *.shiftgrid.json 은 허용 샘플 목록 안에서만 있다', () => {
    const bad = files.filter((f) => /\.shiftgrid\.json$/i.test(f) && !ALLOWED_SHIFTGRID.has(f));
    expect(bad, '허용 샘플 밖의 *.shiftgrid.json (경로만 출력)').toEqual([]);
  });

  it('ⓑ 경로에 정답지·실명·deid 가 없다', () => {
    const bad = files.filter((f) => /정답지|실명|deid/i.test(f));
    expect(bad, '금지 낱말이 든 경로').toEqual([]);
  });

  it('ⓒ 200KB 넘는 json 은 허용 목록 밖에 없다', () => {
    const bad = files.filter((f) => /\.json$/i.test(f) && !ALLOWED_BIG_JSON.has(f) && statSync(resolve(root, f)).size > MAX_JSON_BYTES);
    expect(bad, '200KB 넘는 json (경로만 출력)').toEqual([]);
  });
});
