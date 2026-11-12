// 보고꾼 — 레인 노트 · git 가지 · 사용량 파일 → 공개해도 되는 스냅숏(BoardData 꼴, types.ts).
// build() 는 네트워크 없음(서비스는 publish 가 checkServices 로 재서 넘긴다). 원천은 읽기만. 자유 글은 넣지 않고 담백 틀로 조립한다.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import tls from 'node:tls'
import { clean, findDirty, isPlain } from './plain.mjs'
import { appModules } from './app-modules.mjs'

const ID = String.raw`T-\d+[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*` // T-7a · T-2n-6 · T-7h1
const TID = new RegExp(ID, 'g')

/** 「11-12 14:36」·「14:36」 → ISO(+09:00). date 는 「MM-DD」, 없으면 day 인자. */
export function kstIso(text, year, day) {
  const m = /(?:(\d{1,2})-(\d{1,2})\s+)?(\d{1,2}):(\d{2})/.exec(text ?? '')
  if (!m) return null
  const [mo, d] = m[1] ? [m[1], m[2]] : (day ?? '').split('-')
  if (!mo || !d) return null
  const p = (v) => String(v).padStart(2, '0')
  return `${year}-${p(mo)}-${p(d)}T${p(m[3])}:${m[4]}:00+09:00`
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
/** 백틱 안 낱말 — 경로·가지 이름·파일명·커밋 꼴이면 빈 값, 아니면 낱말 그대로. 끝 「/」 하나(한 칸 폴더 이름)는 낱말로 본다. */
export function codeWord(w) {
  const t = w.trim().replace(/^\/?([A-Za-z0-9_.-]+)\/$|^\/([A-Za-z0-9_.-]+)$/, '$1$2')
  const shaped = !isPlain(t) || /\.[A-Za-z0-9]{1,5}\b/.test(t) || /^[0-9a-f]{7,40}$/i.test(t) || /^[a-z0-9.]+(-[a-z0-9.]+)+$/i.test(t)
  return shaped ? '' : t
}
const strip = (s) => s
  .replace(/\*"[^"]*"\*|"[^"]*"/g, '') // 인용
  .replace(/`([^`]*)`/g, (_, w) => codeWord(w)) // 백틱 — 기호만 걷고 걸리는 낱말만 뺀다
  .replace(/\[\[[^\]]*\]\]/g, '') // 위키링크
  .replace(/\([^)]*\)/g, '') // 괄호 꼬리
  .replace(/\*\*/g, '')
  .replace(/쥔님\s*/g, '')
  .replace(/\b\d{1,2}:\d{2}\b/g, '')

/** 「무엇」 칸 → 공개 제목(첫 ` — `·` · ` 앞, 40자 안). */
export function publicTitle(what) {
  let t = strip(what).split(/ — | · /)[0]
  t = t.replace(/\s+/g, ' ').replace(/^[\s·—:,]+|[\s·—:,]+$/g, '').replace(/^(를|을|에|의|로)\s+/, '')
  return clean(t.slice(0, 40).trim())
}

const tidy = (t) => t.replace(/\s+/g, ' ').replace(/(\s*[·—]\s*)+/g, ' · ').replace(/^[\s·—:,]+|[\s·—:,]+$/g, '')
/** 목표 줄 → 공개 부분. 인용뿐이면 빈 값(호출부가 스프린트 제목으로 대신) — 쥔님 말 원문은 공개 판에 싣지 않는다. */
export function publicGoal(goal) {
  const t = tidy(strip(goal))
  return (t.match(/[가-힣]/g) ?? []).length >= 4 ? clean(t.slice(0, 200)) : ''
}

const TEAM = [[/메인|지휘/, '지휘'], [/화면/, '화면'], [/품질|검사|시험|맨눈/, '검사'], [/설계/, '설계']]
export const categoryOf = (team) => TEAM.find(([r]) => r.test(team))?.[1] ?? '코드'
export function columnOf(state) {
  if (/^\s*✅/.test(state)) return { column: 'done', reason: 'done' }
  if (/^\s*[🔄🔨]/u.test(state)) return { column: 'work', reason: 'new' }
  if (/^\s*(👀|검수)/u.test(state)) return { column: 'wait', reason: 'checking' }
  if (/^\s*⛔/.test(state)) return { column: 'wait', reason: 'blocked', block_kind: 'outside' }
  return { column: 'wait', reason: 'new' }
}

/** 레인 노트 → 스프린트·태스크 줄(원문 칸) · 진행 로그 줄. */
export function parseLane(md) {
  const sprints = []
  const log = []
  let cur = null
  let inLog = false
  let head = null
  for (const line of md.split(/\r?\n/)) {
    const h = /^## (.*)$/.exec(line)
    if (h) {
      const s = /^스프린트 (\d+) — (.*?)\s*\((\d{1,2}:\d{2})~?(?:\d{1,2}:\d{2})?\)\s*$/.exec(h[1])
      head = null
      cur = s ? { id: +s[1], title: s[2], began: s[3], goal: '', rows: [] } : null
      if (cur) sprints.push(cur)
      inLog = h[1].startsWith('진행 로그')
      continue
    }
    if (cur) {
      const g = /^- \*\*목표\*\*:\s*(.*)$/.exec(line)
      if (g) cur.goal = g[1]
      const c = line.startsWith('|') ? cells(line) : null
      if (c && c[0] === '태스크') head = c // 칸 이름으로 찾는다(표마다 칸 수가 다르다)
      const at = (name, i) => c[head ? head.indexOf(name) : i] ?? ''
      if (c && c.length >= 5 && new RegExp(`^${ID}$`).test(c[0])) cur.rows.push({ id: c[0], what: at('무엇', 1), team: at('팀', 2), est: at('est_min', 3), state: at('상태', 4) })
      const late = new RegExp(`^(${ID}) ✅`).exec(line) // 표 밖 「T-5c ✅ …」 덧줄
      const row = late && cur.rows.find((r) => r.id === late[1])
      if (row) row.state = '✅'
    }
    if (inLog && line.startsWith('|')) {
      const c = cells(line)
      if (/^\d{1,2}-\d{1,2} \d{1,2}:\d{2}$/.test(c[0])) log.push({ at: c[0], pan: c[1] ?? '', result: c[2] ?? '' })
    }
  }
  return { sprints, log }
}

/** 레인 노트 하나 → 「지금」 줄 · 표 줄(머리글에 「무엇」·「상태」와 「태스크」 또는 「판」 칸이 있는 표만). 쥔님 원문·세션 이름은 읽어도 싣지 않는다. */
export function parseLaneNote(md) {
  let now = ''
  const rows = []
  let head = null
  for (const line of md.split(/\r?\n/)) {
    const n = /^\*\*지금\*\*:\s*(.*)$/.exec(line)
    if (n) now = n[1]
    if (!line.startsWith('|')) { head = null; continue }
    const c = cells(line)
    const key = c.includes('태스크') ? '태스크' : c.includes('판') ? '판' : null
    if (key && c.includes('무엇') && c.includes('상태')) { head = { c, key }; continue }
    if (!head || /^:?-+:?$/.test(c[0])) continue
    const at = (name) => c[head.c.indexOf(name)] ?? ''
    if (at(head.key)) rows.push({ id: at(head.key), what: at('무엇'), state: at('상태') })
  }
  return { now, rows }
}

const LANE_SKIP = new Set(['닫힘', '요청함', '작업현황판']) // 작업현황판은 lanePath 로 따로 읽는다(l1)
/** 레인 뿌리 아래 폴더마다 「레인 *.md」 를 읽는다(읽기만). onWarn(폴더, 까닭) — 못 읽은 것. */
export function readLanes(root, onWarn = () => {}) {
  if (!root || !existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !LANE_SKIP.has(d.name)).sort((a, b) => a.name.localeCompare(b.name)).flatMap((d) => {
    const f = readdirSync(join(root, d.name)).find((n) => /^레인 .*\.md$/.test(n))
    if (!f) { onWarn(d.name, '레인 노트 없음'); return [] }
    const note = parseLaneNote(readFileSync(join(root, d.name, f), 'utf-8'))
    if (!note.rows.length) onWarn(d.name, '읽을 표 없음')
    return [{ name: d.name, ...note }]
  })
}

/** 요청함 노트 → R 줄(번호·처방·상태 칸). 쥔님 원문 칸은 읽지도 않는다. 칸 순서: # · 시각 · 원문 · 처방 · 종류 · 상태. */
export function parseRequests(md) {
  const rows = []
  for (const line of (md ?? '').split(/\r?\n/)) {
    const c = line.startsWith('|') ? cells(line) : null
    if (c && c.length >= 6 && /^R\d+$/.test(c[0])) rows.push({ id: c[0], what: c[3], state: c[5] })
  }
  return rows
}

/** 처방 칸 → 제목: 굵은 글이 8자 이상이면 그것, 아니면 처방 첫 문장(마크다운 걷고, 담백 검사에 걸려 비면 다음 문장). 40자 넘으면 말줄임. 다 비면 「요청 R번호」. */
export function requestTitle(what, id) {
  const pub = (s) => publicTitle(s.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, ''))
  const bold = /\*\*([^*]+)\*\*/.exec(what)
  let t = bold ? pub(bold[1]) : ''
  if (t.length < 8) {
    const first = what.replace(/\*\*/g, '').split(/(?<=[.!?])\s+|\n/).map((s) => pub(s).replace(/[.!?]+$/, '').trim()).find((s) => /[가-힣A-Za-z0-9]{2}/.test(s))
    if (first && first.length > t.length) t = first
  }
  return t ? (t.length >= 40 ? `${t.slice(0, 39)}…` : t) : `요청 ${id}`
}

/** 상태 칸 → 칸. 「→ T-…」 는 그 태스크(지휘 표에 있으면 그 상태, 없으면 진행)를 따른다. */
export function requestColumn(state, byId) {
  const link = new RegExp(`→[^|]*?(${ID})`).exec(state)
  if (link) { const t = byId.get(link[1]); return { link: link[1], sprint: t?.sprint, col: t ? { column: t.column, reason: t.reason } : { column: 'work', reason: 'new' } } }
  if (/^\s*✅/.test(state)) return { col: { column: 'done', reason: 'done' } }
  if (/^\s*🔨/.test(state)) return { col: { column: 'work', reason: 'new' } }
  return { col: { column: 'wait', reason: 'new' } } // 📥 대기 · 그 밖
}

function gitBranches(repoDir) {
  if (!repoDir || !existsSync(repoDir)) return []
  const git = (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf-8' }).trim()
  try {
    const refs = git('for-each-ref', '--format=%(refname:short)\t%(committerdate:iso-strict)', 'refs/heads/1.2v-preview*')
      .split('\n').filter(Boolean).map((l) => l.split('\t'))
    const trunk = refs.find(([n]) => n === '1.2v-preview')
    if (!trunk) return []
    return refs.map(([name, at]) => {
      if (name === trunk[0]) return { suffix: null, at, ahead: 0, merged: false }
      let merged = true
      try { git('merge-base', '--is-ancestor', name, trunk[0]) } catch { merged = false }
      return { suffix: name.slice(trunk[0].length + 1), at, ahead: +git('rev-list', '--count', `${trunk[0]}..${name}`), merged }
    })
  } catch { return [] }
}

function readUsage(usagePath, nowIso) {
  if (!usagePath || !existsSync(usagePath)) return []
  try {
    const l = JSON.parse(readFileSync(usagePath, 'utf-8')).limits ?? {}
    const at = (v) => (typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : nowIso)
    if (typeof l.five_hour?.pct !== 'number' || typeof l.seven_day?.pct !== 'number') return []
    return [{ account: 'org', ts: nowIso, pct_5h: l.five_hour.pct, pct_7d: l.seven_day.pct,
      reset_5h_at: at(l.five_hour.resets_at), reset_7d_at: at(l.seven_day.resets_at), tok_per_min: 0 }]
  } catch { return [] }
}

// 문지기 훅(볼트 배포/hooks/board-gate.js)이 적는 「지금 도는 에이전트」. 3시간 넘게 안 끝난 것은 끊긴 것으로 친다.
function readGate(gatePath, now) {
  if (!gatePath || !existsSync(gatePath)) return []
  try {
    return Object.values(JSON.parse(readFileSync(gatePath, 'utf-8')).actors ?? {})
      .filter((a) => !a.ended && typeof a.started === 'number' && now - a.started < 3 * 3600e3 && /^a-[0-9a-f]{8}$/.test(a.id))
  } catch { return [] }
}

// 모듈 = 이 현황판 자체의 부품. 화면 탭은 registry.ts 의 import 순서대로 각 파일의 tab 낱말을 읽는다(브라우저 TS 라 import 안 함).
export function readModules(layersDir = new URL('../src/layers/', import.meta.url)) {
  const at = (f) => new URL(f, layersDir)
  const read = (f) => { try { return readFileSync(at(f), 'utf-8') } catch { return '' } }
  const tabs = [...read('registry.ts').matchAll(/from '\.\/([\w-]+)\.ts'/g)]
    .map(([, f]) => [f, /\btab:\s*'([^']+)'/.exec(read(`${f}.ts`))?.[1]]).filter(([, t]) => t)
  const m = (id, name, parent) => ({ id, name, parent, state: 'built', task_id: null })
  const here = (f) => existsSync(new URL(f, import.meta.url))
  return [
    m('m-screen', '화면', null), ...tabs.map(([f, t]) => m(`m-tab-${f}`, t, 'm-screen')),
    m('m-data', '자료', null),
    ...(here('./snapshot.mjs') ? [m('m-reporter', '보고꾼', 'm-data')] : []),
    ...(here('./publish.mjs') && here('./sync.yml') ? [m('m-publish', '나르기', 'm-data')] : []),
    m('m-gate', '문지기 훅', 'm-data'), // 볼트 쪽이라 여기선 존재 확인 못 함
  ]
}

const PREVIEW = 'https://2026-gne-dev-task-force-team.github.io/school-shiftgrid-scheduler/preview/'
const RUNS = 'https://api.github.com/repos/2026-gne-dev-task-force-team/school-shiftgrid-scheduler/actions/runs?branch=board-data&per_page=1'
/** 화면 호스팅 판정 — res: { status, build } 또는 null(실패). head: 줄기 짧은 해시. */
export function serviceState(res, head) {
  if (!res || res.status !== 200) return 'down'
  const b = String(res.build ?? '')
  return head && b && (b.startsWith(head) || head.startsWith(b)) ? 'ok' : 'build' // 짧은 해시 길이가 기기마다 달 수 있다
}
/** 자료 싣기 판정 — 최신 Actions run 하나(또는 null). */
export function runState(run) {
  if (!run) return 'down'
  if (run.status !== 'completed') return 'build'
  return run.conclusion === 'success' ? 'ok' : 'down'
}
/** 공개 창구만 재서 Service[] — 어떤 오류도 던지지 않는다. */
export async function checkServices(repoDir, now = new Date()) {
  const checked_at = now.toISOString()
  // 기관망이 github.io 인증서를 중간에서 다시 서명한다 — node 기본 CA 로는 SELF_SIGNED_CERT_IN_CHAIN 이라 OS 인증서 저장소도 믿는다(curl·브라우저와 같게)
  try { tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]) } catch { /* 옛 node */ }
  const get = async (url, headers) => {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
      return { status: r.status, body: r.ok ? await r.json() : null }
    } catch { return null }
  }
  let head = ''
  try { head = execFileSync('git', ['-C', repoDir, 'rev-parse', '--short', '1.2v-preview'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* git 없음 */ }
  const [ver, runs] = await Promise.all([get(`${PREVIEW}version.json?t=${now.getTime()}`), get(RUNS, { 'User-Agent': 'board-reporter', Accept: 'application/vnd.github+json' })])
  // url 은 비운다 — 담백 검사가 「/」 를 거르고(공개 판), 화면도 url 을 안 쓴다
  const s = (id, name, state) => ({ id, name, state, url: '', task_id: null, checked_at })
  return [
    s('s-host', '화면 호스팅', serviceState(ver && { status: ver.status, build: ver.body?.build }, head)),
    s('s-sync', '자료 싣기', runState(runs?.status === 200 ? runs.body?.workflow_runs?.[0] : null)),
    s('s-reporter', '보고꾼', 'ok'),
  ]
}

// 분류 → 캐릭터(이름·팀·역할 = actor.ts ROLES 낱말). 코드 판은 지금 자료·보고를 만드니 「자료 나르기」. 지휘 분류는 따로 캐릭터를 안 만들고 지휘가 맡는다.
const ACTOR = { 화면: ['화면 다듬기', '화면팀', '화면', 'make', 175, 'teal', 'brush'], 코드: ['자료 나르기', '자료팀', '자료', 'make', 160, 'teal', 'box'],
  설계: ['설계', '설계팀', '설계', 'make', 190, 'teal', 'ruler'], 검사: ['시험', '시험팀', '시험', 'qa', 275, 'violet', 'check'], 지휘: ['지휘', '지휘', '지휘', 'hq', 40, 'amber', 'flag'] }
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)

/** 원천 → BoardData. onDrop(표, 까닭) 은 담백 검사로 버린 줄마다 부른다. 끝에 전체를 한 번 더 훑어 걸리면 예외. */
export function build({ lanePath, requestPath, requestMd, repoDir, usagePath, gatePath, laneRoot, now = new Date(), md, services = [], onDrop = () => {}, onWarn = () => {} }) {
  const { sprints: raw, log } = parseLane(md ?? readFileSync(lanePath, 'utf-8'))
  const nowIso = now.toISOString()
  const year = new Date(now.getTime() + 9 * 3600e3).getUTCFullYear()
  const day = log[0]?.at.split(' ')[0] // 맨 위가 최신 — 스프린트 제목 시각엔 날짜가 없어 이 날로 본다
  const logAt = log.map((r) => ({ ...r, ts: kstIso(r.at, year), ids: r.pan.match(TID) ?? [] })).filter((r) => r.ts).reverse() // 옛→새

  const tasks = []
  const sprints = []
  for (const s of raw) {
    const began = kstIso(s.began, year, day) ?? nowIso
    const mine = []
    for (const r of s.rows) {
      const title = publicTitle(r.what)
      if (!title) { onDrop('tasks', r.id); continue }
      const hits = logAt.filter((l) => l.ids.includes(r.id))
      const col = columnOf(r.state)
      const category = categoryOf(r.team)
      tasks.push({ id: r.id, title, category, kind: category === '검사' ? 'review' : 'work', team: ACTOR[category][1], sprint: s.id,
        est_min: parseInt(r.est, 10) || 0, started_at: hits[0]?.ts ?? began, lane_id: 'l1', ...col,
        actor_id: col.column !== 'work' ? null : category === '지휘' ? 'a-lead' : `a-${r.id}`, updated_at: hits.at(-1)?.ts ?? began })
      mine.push(tasks.at(-1))
    }
    const allDone = mine.length > 0 && mine.every((t) => t.column === 'done')
    sprints.push({ id: s.id, title: clean(s.title) || `스프린트 ${s.id}`, goal: publicGoal(s.goal) || clean(s.title), began,
      ended: allDone ? mine.map((t) => t.updated_at).sort().at(-1) : null, task_ids: mine.map((t) => t.id),
      est_min: mine.reduce((a, t) => a + t.est_min, 0), actual_min: 0, review: '', passed: allDone ? true : null, // 규칙: 레인 노트 스프린트 절 태스크가 전부 ✅ 면 통과, 아니면 진행 중(null)
       missed: '', next: '' })
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cur = [...sprints].reverse().find((s) => !s.ended) ?? sprints.at(-1)
  const curTasks = cur ? cur.task_ids.map((id) => byId.get(id)) : []
  const done = curTasks.filter((t) => t.column === 'done').length
  const goals = cur ? [{ id: `g${cur.id}`, title: cur.title, progress: curTasks.length ? Math.round((done / curTasks.length) * 100) : 0,
    state: cur.ended ? 'shipped' : 'work', sprint: cur.id }] : []
  const runs = cur ? [{ id: `r${cur.id}`, started_at: cur.began, ended_at: cur.ended, sprint: cur.id, goal_id: `g${cur.id}` }] : []

  const branches = []
  for (const b of gitBranches(repoDir)) {
    if (!b.suffix) { branches.push({ id: 'b-trunk', title: '줄기', trunk: true, ahead: 0, state: 'live', actor_id: null, task_id: null, updated_at: b.at }); continue }
    const t = byId.get(`T-${b.suffix}`)
    if (!t) continue // 태스크 없는 가지(임시 가지 등)는 싣지 않는다
    branches.push({ id: `b-${t.id}`, title: t.title, trunk: false, ahead: b.ahead, state: b.merged && t.column !== 'work' ? 'merged' : 'live', // 막 딴 판 가지(앞선 0)는 일감이 도는 동안 열린 가지
      actor_id: t.actor_id, task_id: t.id, updated_at: b.at })
  }

  const live = readGate(gatePath, now.getTime())
  const working = tasks.filter((t) => t.column === 'work')
  const leadTask = working.find((t) => t.category === '지휘')
  const lead = { id: 'a-lead', parent_id: null, kind: 'lead', name: '지휘', hue: 40, eye: 'amber', prop: 'flag', dept: 'hq', team: '지휘', role: '지휘',
    state: working.length || live.length ? 'work' : 'idle', task_id: leadTask?.id ?? null, branch_id: null, account: 'org', tok_per_min: 0, started_at: sprints[0]?.began ?? nowIso, ended_at: null }
  const actors = [lead, ...working.filter((t) => t.category !== '지휘').map((t) => {
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category]
    return { id: t.actor_id, parent_id: lead.id, kind: 'helper', name, hue, eye, prop, dept, team, role, state: 'work', task_id: t.id,
      branch_id: branches.some((b) => b.id === `b-${t.id}`) ? `b-${t.id}` : null, account: 'org', tok_per_min: 0, started_at: t.started_at ?? nowIso, ended_at: null }
  })]
  // 실제로 도는 에이전트: 판 표에 그 일감 캐릭터가 있으면 「지금 일함」으로, 없으면 새로 세운다(일감 모르면 일손).
  for (const g of live) {
    if (g.kind === 'session') continue
    const t = byId.get(g.task ?? '')
    const at = new Date(g.started).toISOString()
    const mine = t && actors.find((a) => a.task_id === t.id && a.kind === 'helper')
    if (mine) { mine.state = 'work'; mine.started_at = at; continue }
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t && t.category !== '지휘' ? t.category : '코드']
    actors.push({ id: t ? `a-${t.id}` : g.id, parent_id: lead.id, kind: 'helper', name: t ? name : '일손', hue, eye, prop, dept, team, role,
      state: 'work', task_id: t?.id ?? null, branch_id: t && branches.some((b) => b.id === `b-${t.id}`) ? `b-${t.id}` : null,
      account: 'org', tok_per_min: 0, started_at: at, ended_at: null })
  }

  // 문지기가 적은 `#시간표앱` 세션 자체 — 에이전트 없이도 캐릭터 하나(하는 일은 모르니 「대화 세션」)
  for (const g of live.filter((x) => x.kind === 'session'))
    actors.push({ id: g.id, parent_id: null, kind: 'helper', name: '대화 세션', hue: 40, eye: 'amber', prop: '', dept: 'hq', team: '세션', role: '세션',
      state: 'work', task_id: null, branch_id: null, account: 'org', tok_per_min: 0, started_at: new Date(g.started).toISOString(), ended_at: null })
  // 가지 ↔ 캐릭터: 그 가지 일감(T-<id>)을 맡은 캐릭터
  for (const b of branches) if (!b.trunk) b.actor_id = actors.find((a) => a.branch_id === b.id)?.id ?? null

  // 사건 = 태스크 id 가 있는 줄만(「{제목} 끝/시작/막힘/다시」) + 가장 최근 📌 줄 하나(「방향 바뀜」). 같은 글이 잇달면 하나로 접는다.
  const events = []
  const lastPin = logAt.findLast((l) => /📌/.test(l.pan))
  for (const l of logAt) {
    const known = l.ids.filter((id) => byId.has(id))
    const add = (kind, subject_type, subject_id, text, key) => {
      if (!clean(text)) { onDrop('events', l.at); return }
      if (events.at(-1)?.text === text) return
      events.push({ id: `e-${hash(l.at + l.pan + key)}`, ts: l.ts, kind, subject_type, subject_id, actor_id: lead.id, text })
    }
    if (known.length) {
      const t = byId.get(known[0])
      const name = `${t.title}${known.length > 1 ? ` 외 ${known.length - 1}` : ''}`
      const mark = `${l.pan} ${l.result}`
      const verb = /^\s*❌/.test(l.result) ? '다시' : /✅|머지/.test(l.pan) || /^\s*✅/.test(l.result) ? '끝' : /⏸|⛔|막힘/.test(mark) ? '막힘' : '시작'
      add(verb === '다시' ? 'task.reject' : 'task.move', 'task', t.id, `${name} ${verb}`, '')
    }
    if (l === lastPin) add('goal.progress', 'actor', lead.id, '방향 바뀜', '📌')
  }

  // 요청함 R 줄 → 카드. 지휘 일감·스프린트 진행률 셈이 끝난 뒤에 붙인다(그 셈에 안 섞인다). id 는 R번호라 T 태스크와 안 겹친다.
  const rmd = requestMd ?? (requestPath && existsSync(requestPath) ? readFileSync(requestPath, 'utf-8') : '')
  const reqTasks = parseRequests(rmd).map((r) => {
    const { col, link, sprint } = requestColumn(r.state, byId)
    const title = requestTitle(r.what, r.id)
    return { id: r.id, title: link ? `${title} (→ ${link})` : title, category: '지휘', kind: 'work', team: ACTOR['지휘'][1], sprint: sprint ?? cur?.id ?? 0,
      est_min: 0, started_at: null, lane_id: 'l1', ...col, actor_id: null, updated_at: nowIso }
  })

  // 다른 레인 폴더 → lane 한 줄 + 표 태스크(스프린트 0 · 어느 스프린트에도 안 든다 — 막대·Overview 수치와 안 섞인다). 담당 캐릭터는 안 세운다.
  const seen = new Set()
  const lanesRaw = readLanes(laneRoot, onWarn)
  const bare = (n) => clean(n.replace(/맥|업무 ?PC|씽크패드|NAS/gi, '').trim()) || '레인'
  const bareCount = lanesRaw.reduce((m, l) => m.set(bare(l.name), (m.get(bare(l.name)) ?? 0) + 1), new Map())
  const bareSeen = new Map() // 걷은 이름이 겹치면 기기 낱말은 못 싣는다(담백 검사) — 뒤 것에 번호를 붙여 구별
  const laneRows = lanesRaw.map((ln) => {
    const id = `l-${hash(ln.name).slice(0, 6)}`
    const mine = ln.rows.flatMap((r) => {
      const title = publicTitle(r.what)
      let tid = `${id}-${r.id}`
      if (!isPlain(tid) || seen.has(tid)) tid = `${id}-${hash(tid + seen.size)}`
      if (!title) { onDrop('tasks', tid); return [] }
      seen.add(tid)
      return [{ id: tid, title, category: '코드', kind: 'work', team: ACTOR['코드'][1], sprint: 0, est_min: 0, started_at: null, lane_id: id,
        ...columnOf(r.state), actor_id: columnOf(r.state).column === 'work' ? `a-${tid}` : null, updated_at: nowIso }]
    })
    const state = mine.some((t) => t.column === 'work') ? 'work' : /^[^\p{L}\p{N}]*(🛑|⛔)/u.test(ln.now) ? 'blocked' : 'idle'
    return { lane: { id, title: ((k, n) => (bareCount.get(k) > 1 && n > 1 ? `${k} ${n}` : k))(bare(ln.name), bareSeen.set(bare(ln.name), (bareSeen.get(bare(ln.name)) ?? 0) + 1).get(bare(ln.name))), state, actor_id: null }, tasks: mine }
  })

  // 다른 레인의 🔄 태스크 → 번호로 부르는 캐릭터(세션·기기·사람 이름 없이). 레인 표엔 맡은 이가 없어 여기서 세운다.
  for (const t of laneRows.flatMap((l) => l.tasks).filter((x) => x.column === 'work')) {
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category]
    actors.push({ id: t.actor_id, parent_id: lead.id, kind: 'helper', name: `${name} ${t.id.replace(/^l-\w+-/, '')}`, hue, eye, prop, dept, team, role, state: 'work',
      task_id: t.id, branch_id: null, account: 'org', tok_per_min: 0, started_at: nowIso, ended_at: null })
  }

  const data = {
    actors, tasks: [...tasks, ...reqTasks, ...laneRows.flatMap((l) => l.tasks)], lanes: [{ id: 'l1', title: '현황판 만들기', state: 'work', actor_id: lead.id }, ...laneRows.map((l) => l.lane)], branches,
    services, modules: appModules(parseRequests(rmd), readModules()),
    goals, events: events.reverse().slice(0, 50), usage: readUsage(usagePath, nowIso), runs, sprints,
  }
  const dirty = findDirty(data)
  if (dirty) throw new Error(`담백 검사 실패: ${dirty}`)
  return data
}
