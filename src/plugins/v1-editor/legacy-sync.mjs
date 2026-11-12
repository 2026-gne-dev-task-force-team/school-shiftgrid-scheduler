// v1 편성기 사본(legacy/) 동기화·검증 — 설계 ① 2-1·P10a. 사본은 손대지 않는다(패치 목표 0).
//   node src/plugins/v1-editor/legacy-sync.mjs sync [v1-ref]   v1 가지 src/ 를 legacy/ 로 복사하고 MANIFEST.json 을 다시 쓴다
//   node src/plugins/v1-editor/legacy-sync.mjs verify [v1-ref]  legacy/ 가 git 의 v1 src/ 와 같은지 직접 대조(git 필요)
// 사본 방식 = 커밋된 사본(설계 「가지 안 폴더」). 시험(legacy.test.ts)은 git 없이 MANIFEST.json 과 대조한다.
// 제외: *.test.ts(x) — v1 시험은 v1 가지에서 돈다(사본 쪽 vitest·tsc 에 안 싣는다).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEGACY = join(HERE, 'legacy')
const REPO = join(HERE, '..', '..', '..')
const [mode, ref = 'v1'] = process.argv.slice(2)
const sha = (b) => createHash('sha256').update(b).digest('hex')
const isTest = (p) => /\.test\.tsx?$/.test(p)
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 1 << 28 })

function fromGit() {
  const names = git('ls-tree', '-r', '--name-only', '-z', ref, 'src').toString('utf8').split('\0').filter(Boolean)
  const out = {}
  for (const n of names) if (!isTest(n)) out[n.slice(4)] = git('show', `${ref}:${n}`)
  return out
}
function walk(dir, base = dir, acc = {}) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, base, acc)
    else if (e !== 'MANIFEST.json' && e !== 'PATCHES') acc[p.slice(base.length + 1)] = readFileSync(p)
  }
  return acc
}

if (mode === 'sync') {
  const files = fromGit()
  rmSync(LEGACY, { recursive: true, force: true })
  const manifest = { source: `v1@${git('rev-parse', ref).toString().trim()}`, files: {} }
  for (const [n, buf] of Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))) {
    mkdirSync(dirname(join(LEGACY, n)), { recursive: true })
    writeFileSync(join(LEGACY, n), buf)
    manifest.files[n] = sha(buf)
  }
  writeFileSync(join(LEGACY, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(LEGACY, 'PATCHES'), '// legacy 패치 목록 — 지금 0개. 패치가 생기면 한 줄씩 적는다(v1 가지를 다시 들여올 때 다시 입힌다).\n')
  console.log(`sync ${Object.keys(files).length} files from ${manifest.source}`)
} else if (mode === 'verify') {
  const want = fromGit(), have = walk(LEGACY)
  const diff = []
  for (const n of new Set([...Object.keys(want), ...Object.keys(have)])) {
    if (!(n in have)) diff.push(`missing ${n}`)
    else if (!(n in want)) diff.push(`extra ${n}`)
    else if (sha(want[n]) !== sha(have[n])) diff.push(`changed ${n}`)
  }
  if (diff.length) { console.error(diff.join('\n')); process.exit(1) }
  console.log(`legacy diff 0 (${Object.keys(want).length} files vs ${ref})`)
} else { console.error('usage: sync|verify [v1-ref]'); process.exit(2) }
