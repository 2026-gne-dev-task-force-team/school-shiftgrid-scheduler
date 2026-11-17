// .githooks/commit-msg 를 git 공통 hooks 폴더로 복사한다 (T-N2 · R129). 의존성 0.
// core.hooksPath 를 바꾸지 않는다 — 씽크패드 post-commit 훅을 살리기 위해서다.
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '# shiftgrid task-num hook';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, '.githooks', 'commit-msg');

function main() {
    let common;
    try {
        common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
            cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return; // git 저장소가 아니거나 git 이 없다 — 조용히 넘어간다
    }
    if (!common || !existsSync(src)) return;
    const hooksDir = resolve(root, common, 'hooks'); // 상대 경로면 root 기준, 절대면 그대로
    const dest = resolve(hooksDir, 'commit-msg');
    if (existsSync(dest) && !readFileSync(dest, 'utf8').includes(MARK)) {
        console.warn(`install-hooks: ${dest} 에 다른 commit-msg 훅이 이미 있어 덮지 않는다. 합치려면 손으로.`);
        return;
    }
    mkdirSync(hooksDir, { recursive: true });
    copyFileSync(src, dest);
    chmodSync(dest, 0o755);
    console.log(`install-hooks: commit-msg 훅 설치 → ${dest}`);
}

try { main(); } catch (e) { console.warn('install-hooks: 건너뜀 —', e instanceof Error ? e.message : e); }
