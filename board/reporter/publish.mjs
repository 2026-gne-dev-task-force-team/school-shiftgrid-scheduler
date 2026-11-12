// 이 PC 에서 돈다: 스냅숏 생성 → 담백 검사 → 고아 가지 board-data 작업 폴더에 snapshot.json · apply.mjs · sync.yml 을 쓰고
// 바뀐 게 있을 때만 커밋 + push. push 되면 sync.yml(Actions)이 Supabase 에 싣는다.
// node board/reporter/publish.mjs [--dry] [--dir <작업 폴더>] [--lane <노트>] [--requests <요청함 노트>] [--usage <json>]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, checkServices } from './snapshot.mjs'
import { findDirty } from './plain.mjs'
import { TABLES } from './to-sql.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const dry = process.argv.includes('--dry')
const repoDir = fileURLToPath(new URL('../..', import.meta.url))
const dir = arg('--dir', 'D:/gne-dev-task/sg-board-data')
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf-8' }).trim()
const tryGit = (cwd, ...a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }

// 1. 스냅숏 + 최종 담백 검사
const snap = build({
  lanePath: arg('--lane', 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/작업현황판/레인 작업현황판.md'),
  requestPath: arg('--requests', 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/요청함/레인 요청함.md'),
  repoDir,
  usagePath: arg('--usage', join(homedir(), '.claude', 'rate-limits.json')),
  gatePath: arg('--gate', join(homedir(), '.claude', 'board', 'actors.json')),
  services: await checkServices(repoDir),
})
const dirty = findDirty(snap)
if (dirty) throw new Error(`담백 검사 실패: ${dirty}`)

// 2. 영구 작업 폴더(고아 가지 board-data). 원격에 있으면 그걸 추적한다.
if (!existsSync(join(dir, '.git'))) {
  tryGit(repoDir, 'fetch', 'origin', 'board-data')
  if (tryGit(repoDir, 'rev-parse', '--verify', '-q', 'refs/heads/board-data')) git(repoDir, 'worktree', 'add', dir, 'board-data')
  else if (tryGit(repoDir, 'rev-parse', '--verify', '-q', 'refs/remotes/origin/board-data')) git(repoDir, 'worktree', 'add', '--track', '-b', 'board-data', dir, 'origin/board-data')
  else git(repoDir, 'worktree', 'add', '--orphan', '-b', 'board-data', dir) // git 2.42+
  console.log('작업 폴더 만듦', dir)
}

// 3. 쓸 파일 셋. apply.mjs 는 to-sql 본문을 끼워 자립시킨다.
const here = (f) => readFileSync(new URL(f, import.meta.url), 'utf-8')
const IMPORT = "import { toSql, TABLES } from './to-sql.mjs'" // 줄끝 없이 — 체크아웃이 CRLF 로 바꿔도 맞는다
const applySrc = here('./apply.mjs')
if (!applySrc.includes(IMPORT)) throw new Error('apply.mjs 의 to-sql import 줄을 못 찾음')

// 「만든 시각」 칸(services.checked_at · usage.ts)은 비교에서 뺀다 — 내용이 같으면 옛 파일을 그대로 둔다.
// shortcut: 원천에 시각이 없어 now 로 메운 칸(started_at·began 대체값)은 못 거른다, 그런 줄이 생기면 여기에 더한다
const strip = (s) => JSON.stringify({ ...s,
  services: s.services?.map(({ checked_at: _c, ...r }) => r), usage: s.usage?.map(({ ts: _t, ...r }) => r) })
const snapPath = join(dir, 'snapshot.json')
let old = null
try { old = JSON.parse(readFileSync(snapPath, 'utf-8')) } catch { /* 처음 */ }
const files = {
  'snapshot.json': old && strip(old) === strip(snap) ? null : JSON.stringify(snap, null, 2) + '\n',
  // 함수 치환 — 문자열 치환이면 to-sql 안의 「$'」 를 특수 패턴으로 먹는다
  'apply.mjs': applySrc.replace(IMPORT, () => here('./to-sql.mjs').replace(/^\/\/.*\n/gm, '').trimEnd()),
  '.github/workflows/sync.yml': here('./sync.yml'),
}
const changed = Object.entries(files).filter(([f, body]) => {
  if (body === null) return false
  const p = join(dir, f)
  return !existsSync(p) || readFileSync(p, 'utf-8') !== body
})

for (const t of TABLES) {
  const was = old?.[t]?.length ?? '-'
  console.log(`${t}\t${was} → ${snap[t].length}`)
}
console.log(changed.length ? `바뀔 파일: ${changed.map(([f]) => f).join(', ')}` : '바뀐 것 없음')
if (dry || !changed.length) process.exit(0)

// 4. 쓰고 커밋 + push
for (const [f, body] of changed) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body) }
git(dir, 'add', '-A')
if (!git(dir, 'status', '--porcelain')) { console.log('바뀐 것 없음(git)'); process.exit(0) }
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
git(dir, 'commit', '-q', '-m', `현황판 자료 ${kst}`)
git(dir, 'push', 'origin', 'board-data')
console.log('push 끝', kst)
