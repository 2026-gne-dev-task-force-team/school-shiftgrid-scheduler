import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// .githooks/commit-msg (T-N2 · R129) — 번호 없는 커밋 거부. 윈도우에 sh 가 없으면 건너뜀.
const hook = resolve(process.cwd(), '.githooks/commit-msg');

function run(msg: string, env: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'cm-'));
    const f = join(dir, 'MSG');
    writeFileSync(f, msg + '\n', 'utf8');
    try {
        return spawnSync('sh', [hook, f], { encoding: 'utf8', env: { ...process.env, ...env } });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe.skipIf(process.platform === 'win32')('commit-msg 훅', () => {
    it.each([
        'T-10fl 제목',
        'T-10e6 (R55) 제목',
        'T-씽크2 제목',
        'T-N1 제목',
        'K26',
        'U20 F10b: v1 내보내기',
        'R12(T-10fl): ops-days 저장',
        'merge p-T-10fl',
        'Revert "무언가"',
        'fixup! 앞 커밋',
    ])('통과: %s', (m) => {
        expect(run(m).status).toBe(0);
    });

    it.each([
        '자동 편성 화면 고침',
        'fix typo in README',
        'Update docs: 설명 보강',
    ])('거부: %s', (m) => {
        const r = run(m);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('T-10fl 제목');
    });

    it('SKIP_TASK_NUM=1 이면 통과하며 경고', () => {
        const r = run('번호 없음', { SKIP_TASK_NUM: '1' });
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('SKIP_TASK_NUM');
    });
});
