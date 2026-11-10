#!/usr/bin/env node
/**
 * 이사 코드모드 — 사용법(레포 루트에서):  node scripts/move-files.mjs <map.json> [--dry]
 *   map.json = { "src/plugins/selection": "src/pane-ui-system/core/selection", "src/a/x.ts": "src/b/x.ts", ... }
 *   키가 폴더면 그 아래 전부(테스트·css 포함)를 옮긴다. 값은 새 자리(폴더면 폴더째).
 *   하는 일: git mv → src 전체의 from '…'·import('…')·vi.mock('…') 상대 경로를 절대 경로로 풀어 새 자리 기준으로 다시 계산.
 *   ⚠️ 상대 경로가 아닌 별칭·문자열 경로(vite 설정·json)는 안 고친다. 끝나면 tsc -b 로 확인.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const mapFile = args.find((a) => !a.startsWith('--'));
if (!mapFile) { console.error('usage: move-files.mjs <map.json> [--dry]'); process.exit(1); }
const ROOT = process.cwd();
const rawMap = JSON.parse(readFileSync(mapFile, 'utf-8'));

function walk(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
    }
    return out;
}

// 1) 파일 단위 이사표(절대 경로)
const fileMap = new Map();
for (const [from, to] of Object.entries(rawMap)) {
    const a = resolve(ROOT, from), b = resolve(ROOT, to);
    if (!existsSync(a)) { console.error('없음: ' + from); process.exit(1); }
    if (statSync(a).isDirectory()) for (const f of walk(a)) fileMap.set(f, join(b, relative(a, f)));
    else fileMap.set(a, b);
}
// 2) 모듈 경로(확장자 없이) 이사표 — index 는 폴더 경로로도 같이
const strip = (p) => p.replace(/\.(tsx?|jsx?|mjs)$/, '');
const modMap = new Map();
for (const [a, b] of fileMap) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(a)) continue;
    modMap.set(strip(a), strip(b));
    if (/[\\/]index\.(tsx?|jsx?)$/.test(a)) modMap.set(dirname(a), dirname(b));
}

const RE = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|importActual|doMock|importMock)\s*\(\s*|\brequire\s*\(\s*))(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g;
const rel = (fromDir, target) => { const r = relative(fromDir, target).split(sep).join('/'); return r.startsWith('.') ? r : './' + r; };

const changed = [];
const all = walk(join(ROOT, 'src')).filter((f) => /\.(tsx?|mjs|jsx?)$/.test(f));
for (const f of all) {
    const newF = fileMap.get(f) ?? f;
    const text = readFileSync(f, 'utf-8');
    const out = text.replace(RE, (m, pre, q, spec) => {
        const abs = resolve(dirname(f), spec);
        let target = null;
        if (modMap.has(abs)) target = modMap.get(abs);
        else if (fileMap.has(abs)) target = fileMap.get(abs);   // 확장자 붙은 자원(예: ./x.css)
        else target = abs;                                        // 안 옮긴 대상 — 위치 그대로
        if (target === abs && newF === f) return m;               // 둘 다 안 옮겨졌다 — 손대지 않는다
        const next = rel(dirname(newF), target);
        return next === spec ? m : `${pre}${q}${next}${q}`;
    });
    if (out !== text || newF !== f) changed.push([f, newF, out, out !== text]);
}
if (dry) { for (const [f, n, , c] of changed) console.log((n !== f ? 'MOVE ' : 'EDIT ') + relative(ROOT, f) + (n !== f ? ' -> ' + relative(ROOT, n) : '') + (c ? '' : ' (경로 그대로)')); process.exit(0); }

// 3) 옮기고 → 고친 내용 쓰기
for (const [a, b] of fileMap) { mkdirSync(dirname(b), { recursive: true }); execFileSync('git', ['mv', a, b], { cwd: ROOT }); }
let edits = 0;
for (const [, n, out, c] of changed) if (c) { writeFileSync(n, out); edits++; }
console.log(`옮김 ${fileMap.size}파일 · import 고침 ${edits}파일 — 이제 npx tsc -b`);
