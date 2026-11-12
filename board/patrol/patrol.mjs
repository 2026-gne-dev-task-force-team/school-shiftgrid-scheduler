// 감독관 순찰 — 레인 표 · 요청함 · 집은 카드 · git 로그를 읽어 채점 줄로 낸다. 원천은 읽기만(네트워크 · 남의 코드 수정 없음) — 쓰는 건 --write 로 지정한 노트 하나뿐. 설정 값(경로 외)은 출력하지 않는다.
// 쓰임: node board/patrol/patrol.mjs --config board/reporter/config.mac.json [--branch 1.2v-preview] [--repo .] [--json] [--parallel] [--now ISO] [--write 노트.md]
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLanes, parseLane, parseLaneNote } from '../reporter/snapshot.mjs'

export const DEFAULTS = { stuckMin: 30, idleHours: 3, urgentMin: 15, pickedHours: 1, parallelMin: 30, commits: 30 }
const KST = 9 * 3600e3
const FUTURE_SLACK = 15 * 60e3
const p2 = (n) => String(n).padStart(2, '0')
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const home = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p)

/** 「11-12 14:23」·「14:23」 → 시각(ms). 시각만이면 now 의 날짜(KST) — 15분 이내 미래는 시계 차·먼저 적기라 오늘로 두고, 그보다 미래면 하루 전. 못 읽으면 null. */
export function parseAt(text, now) {
  const m = /(?:(\d{1,2})-(\d{1,2})\s+)?(\d{1,2}):(\d{2})/.exec(text ?? '')
  if (!m) return null
  const k = new Date(now.getTime() + KST)
  const mo = m[1] ? +m[1] : k.getUTCMonth() + 1
  const d = m[2] ? +m[2] : k.getUTCDate()
  let t = Date.UTC(k.getUTCFullYear(), mo - 1, d, +m[3], +m[4]) - KST
  if (!m[1] && t > now.getTime() + FUTURE_SLACK) t -= 86400e3
  return t
}
const mins = (now, t) => Math.max(0, Math.floor((now.getTime() - t) / 60e3)) // 몇 분 미래(시계 차)는 경과 0
const span = (m) => (m >= 120 ? `${(m / 60).toFixed(1)}시간` : `${m}분`)
const grade = (m, limit) => (m <= limit ? '✅' : m > limit * 2 ? '❌' : '⚠️')
const hhmm = (now) => { const k = new Date(now.getTime() + KST); return `${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}` }
const read = (f) => (f && existsSync(f) ? readFileSync(f, 'utf-8') : '')

/** 한 항목의 줄들 — 문제 줄은 하나씩, 다 멀쩡하면 ✅ 한 줄로 접는다. */
function fold(item, checked, bad, okTarget, okBasis) {
  if (bad.length) return bad.map((b) => ({ item, ...b }))
  return [{ item, target: okTarget ?? `${checked}건`, verdict: '✅', basis: okBasis ?? `${checked}건 모두 기준 안` }]
}

/** 1. 멈춘 판 — 레인 표 🔄 인데 「🔄 HH:MM」 이 limit 분 넘음. 상태 칸에 ✅ 가 뒤따르면 끝난 줄. 시각이 없으면 잴 수 없어 세지 않는다. */
export function stuckRows(laneRows, now, limit) {
  const bad = []
  let n = 0
  for (const { lane, id, state } of laneRows) {
    if (!/^\s*🔄/u.test(state) || /✅/u.test(state)) continue
    const at = parseAt(state.replace(/^\s*🔄/u, ''), now)
    if (at == null) continue
    n++
    const m = mins(now, at)
    const v = grade(m, limit)
    if (v !== '✅') bad.push({ target: `${id} (${lane})`, verdict: v, basis: `🔄 ${span(m)} 째 (기준 ${limit}분)` })
  }
  return fold('멈춘 판', n, bad, null, `🔄 ${n}건 모두 ${limit}분 안`)
}

/** 요청함 → R 줄(시각·상태) · 🚨 U 줄(번호·시각·상태). */
export function parseBacklog(md, now) {
  const rs = []
  const us = []
  for (const line of (md ?? '').split(/\r?\n/)) {
    if (line.startsWith('|')) {
      const c = cells(line)
      if (c.length >= 6 && /^R\d+$/.test(c[0])) rs.push({ id: c[0], at: parseAt(c[1], now), state: c[5] })
      continue
    }
    const u = /^- 🚨 (U\d+) · (\d{1,2}:\d{2})\b.*?(📥|🔨|✅)?\s*$/u.exec(line)
    if (u) us.push({ id: u[1], at: parseAt(u[2], now), state: u[3] ?? '' })
  }
  return { rs, us }
}

/** 집은 카드 → U·R 번호별 { picked: 🔨 시각, done: ✅ 있나 }. 꼴 `- U3 · 🔨 세션 · 20:59` / `- U3 · ✅ 커밋 · 22:24`. */
export function parsePicked(md, now) {
  const map = new Map()
  for (const line of (md ?? '').split(/\r?\n/)) {
    const m = /^- ((?:U|R)\d+) · (🔨|✅|→)(.*)$/u.exec(line)
    if (!m) continue
    const e = map.get(m[1]) ?? { picked: null, claimed: false, done: false }
    if (m[2] === '✅') e.done = true
    else { e.claimed = true; e.picked ??= parseAt(m[3].split('·').pop(), now) }
    map.set(m[1], e)
  }
  return map
}

/** 2. 방치 📥 — R 줄이 📥 대기로 idleHours 넘음 · 🚨 U 줄은 집은 카드에 🔨 없이 urgentMin 넘음. */
export function idleRequests({ rs, us }, picked, now, o) {
  const bad = []
  let n = 0
  for (const r of rs) {
    if (!/^\s*📥/u.test(r.state) || r.at == null || picked.get(r.id)?.claimed) continue
    n++
    const m = mins(now, r.at)
    const v = grade(m, o.idleHours * 60)
    if (v !== '✅') bad.push({ target: r.id, verdict: v, basis: `📥 ${span(m)} 째 안 집힘 (기준 ${o.idleHours}시간)` })
  }
  for (const u of us) {
    if (u.state !== '📥' || u.at == null || picked.get(u.id)?.claimed) continue
    n++
    const m = mins(now, u.at)
    const v = grade(m, o.urgentMin)
    if (v !== '✅') bad.push({ target: `🚨 ${u.id}`, verdict: v, basis: `집은 카드에 🔨 없이 ${span(m)} (기준 ${o.urgentMin}분)` })
  }
  return fold('방치 📥', n, bad, null, `📥 ${n}건 모두 기준 안`)
}

/** 4. 집은 카드에 🔨 만 남음 — 🔨 줄은 있는데 ✅ 줄이 없는 U 번호가 pickedHours 넘음. */
export function lingeringPicks(picked, now, o) {
  const bad = []
  let n = 0
  for (const [id, e] of picked) {
    if (!id.startsWith('U') || e.done || e.picked == null) continue
    n++
    const m = mins(now, e.picked)
    const v = grade(m, o.pickedHours * 60)
    if (v !== '✅') bad.push({ target: id, verdict: v, basis: `🔨 ${span(m)} 째 ✅ 줄 없음 (기준 ${o.pickedHours}시간)` })
  }
  return fold('🔨만 남음', n, bad, null, `진행 중 U ${n}건 모두 ${o.pickedHours}시간 안`)
}

/** 3. 번호 없는 커밋 — 메시지에 T-번호 · R/U/P번호 · merge 가 하나도 없음. */
const NUMBERED = /(?:\bT-\d|\b[RUP]\d|merge)/i
export function unnumberedCommits(commits) {
  const bad = commits.filter((c) => !NUMBERED.test(c.subject)).map((c) => ({ target: c.sha, verdict: '⚠️', basis: `번호 없음 — ${c.subject.slice(0, 40)}` }))
  return fold('번호 없는 커밋', commits.length, bad, null, `최근 ${commits.length}건 모두 번호 있음`)
}
export function readCommits(repo, branch, n) {
  try {
    const out = execFileSync('git', ['-C', repo, 'log', branch, '-n', String(n), '--format=%h%x09%s'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split('\n').filter(Boolean).map((l) => { const [sha, ...s] = l.split('\t'); return { sha, subject: s.join('\t') } })
  } catch { return null }
}

/** 5. 놀고 있는 병렬(선택) — ⬜ 줄 앞이 다 ✅ 인데 레인 노트가 limit 분 넘게 그대로(수정 시각 mtime 이 잣대). */
export function idleParallel(groups, now, limit) {
  const bad = []
  let n = 0
  for (const { lane, rows, mtime } of groups) {
    const i = rows.findIndex((r) => /^\s*⬜/u.test(r.state))
    if (i < 1 || !rows.slice(0, i).every((r) => /^\s*✅/u.test(r.state))) continue
    n++
    const m = mins(now, mtime)
    const v = grade(m, limit)
    if (v !== '✅') bad.push({ target: `${rows[i].id} (${lane})`, verdict: v, basis: `앞 ${i}칸 ✅ · ⬜ 인 채 노트 ${span(m)} 안 바뀜 (기준 ${limit}분)` })
  }
  return fold('놀고 있는 병렬', n, bad, null, `대기 ⬜ ${n}건 모두 ${limit}분 안`)
}

/** 원천 읽기 → 줄 모음. cfg: { lane, requests, laneRoot } (경로만). */
export function patrol(cfg, { now = new Date(), branch = '1.2v-preview', repo = process.cwd(), parallel = false, ...opt } = {}) {
  const o = { ...DEFAULTS, ...opt }
  const lane = home(cfg.lane)
  const reqFile = home(cfg.requests)
  const laneRoot = home(cfg.laneRoot)
  const laneRows = []
  const groups = []
  const addNote = (name, file, rows) => {
    for (const r of rows) laneRows.push({ lane: name, ...r })
    const sp = parseLane(read(file)).sprints.filter((s) => s.rows.length)
    const mtime = file && existsSync(file) ? statSync(file).mtimeMs : now.getTime()
    if (sp.length) for (const s of sp) groups.push({ lane: `${name} 스프린트 ${s.id}`, rows: s.rows, mtime })
    else groups.push({ lane: name, rows, mtime })
  }
  if (lane && existsSync(lane)) addNote('작업현황판', lane, parseLaneNote(read(lane)).rows)
  for (const l of readLanes(laneRoot)) { // readLanes 가 표 줄을 주고, 수정 시각·스프린트는 같은 파일을 다시 읽어 얻는다
    const f = readdirSync(join(laneRoot, l.name)).find((n) => /^레인 .*\.md$/.test(n))
    addNote(l.name, f ? join(laneRoot, l.name, f) : null, l.rows)
  }
  const backlog = parseBacklog(read(reqFile), now)
  const picked = parsePicked(read(join(dirname(reqFile), '집은 카드.md')), now)
  const commits = readCommits(repo, branch, o.commits)
  const lines = [
    ...stuckRows(laneRows, now, o.stuckMin),
    ...idleRequests(backlog, picked, now, o),
    ...(commits ? unnumberedCommits(commits) : [{ item: '번호 없는 커밋', target: branch, verdict: '⚠️', basis: '가지를 못 읽음(git log 실패)' }]),
    ...lingeringPicks(picked, now, o),
    ...(parallel ? idleParallel(groups, now, o.parallelMin) : []),
  ].map((l) => ({ at: hhmm(now), ...l }))
  const warn = lines.filter((l) => l.verdict === '⚠️').length
  const fail = lines.filter((l) => l.verdict === '❌').length
  const worst = lines.find((l) => l.verdict === '❌') ?? lines.find((l) => l.verdict === '⚠️')
  const summary = `${warn || fail ? '' : '✅ 이상 없음 · '}⚠️ ${warn} · ❌ ${fail} — 쥔님께 한 줄${worst ? `: ${worst.item} ${worst.target} — ${worst.basis}` : ''}`
  return { lines, summary, warn, fail }
}
export function render({ lines, summary }) {
  const esc = (s) => String(s).replace(/\|/g, '\\|')
  return ['| 시각 | 항목 | 대상 | 판정 | 근거 |', '|---|---|---|---|---|', ...lines.map((l) => `| ${l.at} | ${l.item} | ${esc(l.target)} | ${l.verdict} | ${esc(l.basis)} |`), '', summary].join('\n')
}

/** 노트 꼴(--write) — 요약 · ❌ · ⚠️ 목록. 「순찰 시각」은 비교에서 빼려고 한 줄 끝에 둔다. */
export function renderNote({ lines, warn, fail }, now) {
  const list = (v) => {
    const xs = lines.filter((l) => l.verdict === v)
    return xs.length ? xs.map((l) => `- ${l.item} ${l.target} — ${l.basis}`) : ['없음']
  }
  const k = new Date(now.getTime() + KST)
  const stamp = `${k.getUTCFullYear()}-${p2(k.getUTCMonth() + 1)}-${p2(k.getUTCDate())} ${hhmm(now)}`
  return [
    '---', 'title: 레인 감독', 'tags: [시간표, 감독관]', '공개등급: 내부', '층: 현황', `최종점검: ${stamp}`, '---', '',
    '> 🔍 감독관 순찰 — 자동 생성(5분마다 덮어씀). ⛔ 손으로 고치지 말 것.', '',
    '## 요약', '', `⚠️ ${warn} · ❌ ${fail} · 순찰 시각 ${hhmm(now)}`, '',
    '## ❌', '', ...list('❌'), '', '## ⚠️', '', ...list('⚠️'), '',
  ].join('\n')
}
/** 비교용 본문 — frontmatter 와 「순찰 시각」을 뺀다. */
const noteBody = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/ · 순찰 시각 .*$/m, '')
/** 직전 파일과 본문이 같으면 안 쓴다. 쓸 땐 임시 파일 → rename. 썼으면 true. */
export function writeNote(file, text) {
  if (existsSync(file) && noteBody(readFileSync(file, 'utf-8')) === noteBody(text)) return false
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
  return true
}

function main(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const file = arg('--config')
  if (!file) { console.error('사용: patrol.mjs --config <config.json> [--branch B] [--repo DIR] [--json] [--parallel] [--now ISO] [--write 노트.md]'); process.exit(2) }
  const cfg = JSON.parse(readFileSync(home(file), 'utf-8')) // 경로 3개만 쓴다 — 나머지 값은 읽어도 안 낸다
  const num = (k, d) => (arg(k) != null ? +arg(k) : d)
  const r = patrol({ lane: cfg.lane, requests: cfg.requests, laneRoot: cfg.laneRoot }, {
    now: arg('--now') ? new Date(arg('--now')) : new Date(), branch: arg('--branch', '1.2v-preview'), repo: arg('--repo', process.cwd()), parallel: argv.includes('--parallel'),
    stuckMin: num('--stuck-min', DEFAULTS.stuckMin), idleHours: num('--idle-hours', DEFAULTS.idleHours),
  })
  const out = arg('--write')
  if (out) { writeNote(home(out), renderNote(r, new Date(arg('--now') ?? Date.now()))); return }
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r))
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
