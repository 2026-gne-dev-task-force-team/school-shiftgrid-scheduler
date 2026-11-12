import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// T-8e (R29): 루트 v1 서비스워커는 범위가 사이트 전체다. 형제 판(/preview/ · /v1.2/ · /v2/)으로 가는
// 주소 이동을 가로채 v1 의 index.html 을 내주면 안 된다 → 빌드된 sw.js 의 denylist 를 읽어 검사한다.
describe('v1 서비스워커 범위 (빌드 산출 sw.js)', () => {
    let denylist: RegExp[] = [];
    let outDir = '';

    beforeAll(() => {
        outDir = mkdtempSync(join(tmpdir(), 'sw-scope-'));
        execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { stdio: 'pipe' });
        const sw = readFileSync(join(outDir, 'sw.js'), 'utf8');
        const m = sw.match(/denylist:\s*\[(.*?)\]\s*[,}]/s);
        if (!m) throw new Error('sw.js 에서 denylist 를 못 찾았다');
        // 정규식 리터럴만 뽑아 RegExp 로 만든다
        denylist = [...m[1].matchAll(/\/((?:\\.|[^/\\])+)\/([a-z]*)/g)].map((x) => new RegExp(x[1], x[2]));
    }, 240000);

    const denied = (p: string) => denylist.some((r) => r.test(p));

    it.each(['/preview/', '/v1.2/', '/v2/', '/subnauticaz/preview/', '/x/v1.2/index.html'])('%s 는 v1 이 가로채지 않는다', (p) => {
        expect(denied(p)).toBe(true);
    });

    it('v1 자기 주소는 막지 않는다', () => {
        expect(denied('/')).toBe(false);
        expect(denied('/index.html')).toBe(false);
        expect(denied('/subnauticaz/')).toBe(false);
    });

    it('정리', () => {
        rmSync(outDir, { recursive: true, force: true });
    });
});
