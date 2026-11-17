// 보고꾼 — 레인 노트 · git 가지 · 사용량 파일 → 공개해도 되는 스냅숏(BoardData 꼴, types.ts).
// build() 는 네트워크 없음(서비스는 publish 가 checkServices 로 재서 넘긴다). 원천은 읽기만. 자유 글은 넣지 않고 담백 틀로 조립한다.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import tls from 'node:tls'
import { DEVICE_LANE, clean, findDirty, isPlain, isPlainPath, isPlainText, publicText, setRedactNames } from './plain.mjs'
import { appModules } from './app-modules.mjs'
import { targetOf } from './tags.mjs'
import { raceOfDevice } from './race.mjs'
import { pickName } from './names.mjs'
import { claudeVariants } from './claude-home.mjs'
import { bodyFromLinks, bodyFromLog, branchTitle, sprintNext, sprintReview } from './fill.mjs'

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

// 칸 안의 `\|`(표 안 위키링크 별칭 `[[노트#절\|별칭]]`)는 칸 나눔이 아니다 — 나누면 뒤 칸이 한 칸씩 밀려 설명이 비고 상태가 틀린다(T-10e)
export const cells = (line) => line.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
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
// 가짜 막힘(R102④): 「⛔ 고칠 것 없음」 류는 막힘이 아니라 끝이다.
const NOTHING_LEFT = /(?:고칠|할|손댈|남은)\s*(?:것|게|일)\s*없|해당\s*없|필요\s*없/
/** 상태 칸 → 칸. columnOf 에 더해 ↪(넘김)은 끝 · 「⛔ … → T-번호」 는 그 번호 상태를 따른다(stateOf 가 모르는 번호면 대기) · 「⛔ 고칠 것 없음」 류는 끝. */
export function columnOfLinked(state, stateOf = () => undefined, depth = 0) {
  const s = String(state ?? '')
  if (/^\s*↪/u.test(s)) return { column: 'done', reason: 'done' }
  if (/^\s*⛔/u.test(s)) {
    const link = new RegExp(`→[^|]*?(${ID})`).exec(s)
    if (link) {
      const next = depth < 5 ? stateOf(link[1]) : undefined
      return next === undefined ? { column: 'wait', reason: 'new' } : columnOfLinked(next, stateOf, depth + 1)
    }
    if (NOTHING_LEFT.test(s)) return { column: 'done', reason: 'done' }
  }
  return columnOf(s)
}

/** 레인 노트 → 스프린트·태스크 줄(원문 칸) · 진행 로그 줄. */
export function parseLane(md, onWarn = () => {}) {
  const sprints = []
  const log = []
  const closes = new Map() // 진행 로그 「🏁 스프린트 N 닫음」 → N → 「MM-DD HH:MM」
  let laneClosed = false // 레인 「지금」 줄의 🏁 — 마지막 스프린트가 닫혔다
  let cur = null
  let inLog = false
  let head = null
  for (const line of md.split(/\r?\n/)) {
    if (/^\*\*지금\*\*/.test(line) && line.includes('🏁')) laneClosed = true
    const h = /^## (.*)$/.exec(line)
    if (h) {
      const s = /^스프린트 (\d+) — (.*?)\s*\((\d{1,2}:\d{2})~?(\d{1,2}:\d{2})?[^)]*\)\s*$/.exec(h[1]) // 괄호 안 꼬리(「~ 맥」 등)는 받는다
      if (!s && /^스프린트 \d+/.test(h[1])) onWarn('스프린트', `머리를 못 읽음 — ${h[1].replace(/\s+/g, ' ').slice(0, 30)}`)
      head = null
      cur = s ? { id: +s[1], title: s[2], began: s[3], endedAt: s[4] ?? null, closed: /🏁/u.test(h[1]), goal: '', rows: [] } : null
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
      if (/^\d{1,2}-\d{1,2} \d{1,2}:\d{2}$/.test(c[0])) {
        log.push({ at: c[0], pan: c[1] ?? '', result: c[2] ?? '' })
        const k = /🏁\s*스프린트 (\d+)/u.exec(c[1] ?? '')
        if (k && !closes.has(+k[1])) closes.set(+k[1], c[0])
      }
    }
  }
  return { sprints, log, closes, laneClosed }
}

/** 레인 노트 하나 → 「지금」 줄 · 표 줄(머리글에 「무엇」·「상태」와 「태스크」 또는 「판」 칸이 있는 표만). 쥔님 원문·세션 이름은 읽어도 싣지 않는다. */
const NUM_COLS = ['칸', '번호', '#', 'ID', 'id']
const NUM_CELL = new RegExp(`^(?:\\d+[A-Za-z]?(?:-[A-Za-z0-9]+)?|${ID})$`) // 「5」·「2-C」·「T-101a」 — 「11~」 같은 자리표시는 번호가 아니다
/** 표 머리 별칭(U18①) — 「| 번호 | 할 일 | 맡은 이 | 상태 |」 꼴: 「할 일」=무엇 · 태스크·판 칸이 없으면 「번호」=태스크. 머리 줄이 아니면 그대로. */
export function headAlias(c) {
  if (!c.includes('상태') || !(c.includes('무엇') || c.includes('할 일'))) return c
  const out = c.map((x) => (x === '할 일' && !c.includes('무엇') ? '무엇' : x))
  return out.includes('태스크') || out.includes('판') ? out : out.map((x) => (x === '번호' ? '태스크' : x))
}
export function parseLaneNote(md) {
  let now = ''
  const rows = []
  let head = null
  let headSeen = false // 상태 칸이 있는 표 머리를 봤나(못 읽은 표와 표 없음을 가르는 값)
  for (const line of md.split(/\r?\n/)) {
    const n = /^\*\*지금\*\*(?:\([^)]*\))?:\s*(.*)$/.exec(line) // 「**지금**: …」 · 「**지금**(10:13): …」
    if (n) now = n[1]
    if (!line.startsWith('|')) { head = null; continue }
    const c = headAlias(cells(line))
    const key = c.includes('태스크') ? '태스크' : c.includes('판') ? '판' : null
    if (c.includes('상태') && c.includes('무엇')) headSeen = true
    // 상태 칸 + 번호(ID) 칸이 있는 표만 — 태스크 칸이 곧 번호이고, 판 표는 칸/번호/# 칸이 따로 있어야 한다(모델 배분 같은 설명 표는 안 읽는다)
    const numCol = NUM_COLS.find((n) => c.includes(n))
    if (key && c.includes('무엇') && c.includes('상태') && (key === '태스크' || numCol)) { head = { c, key, numCol }; continue }
    if (!head || /^:?-+:?$/.test(c[0])) continue
    const at = (name) => c[head.c.indexOf(name)] ?? ''
    if (!at(head.key)) continue
    if (head.key === '판' && !NUM_CELL.test(at(head.numCol))) continue
    rows.push({ id: at(head.key), what: at('무엇'), state: at('상태') })
  }
  return { now, rows, headSeen }
}

/** 레인 폴더 이름에 판 이름(v1 · 1.2v · v2)이 낱말로 적혀 있으면 그 판, 아니면 1.2v. 이름에서 짐작하지 않는다 — 적힌 낱말만 읽는다. */
export function appOfLane(name) {
  return appsOfLane(name)[0]
}
/** 레인 이름에 적힌 판 낱말을 전부(적힌 순서 · 겹침 없이). 「v1·v2 설계」 → ['v1', 'v2'] — 둘 다 든 레인의 카드는 두 판에 다 싣는다(R101). 없으면 ['1.2v']. */
export function appsOfLane(name) {
  const got = [...new Set([...String(name ?? '').matchAll(/(?<![\w.])(v1|1\.2v|v2)(?![\w.])/gi)].map((m) => m[1].toLowerCase()))]
  return got.length ? got : ['1.2v']
}
/** 카드 줄 「무엇」 칸 맨 앞의 판 표시 — `[v2] …` · `(v1) …` · `v2: …` · `v2 · …`. 있으면 레인 이름보다 이게 이긴다. 본문 중간의 판 낱말은 안 읽는다(언급일 뿐). */
export function appOfRow(what) {
  const m = /^\s*(?:\*\*)?(?:[[(（]\s*(v1|1\.2v|v2)\s*[\])）]|(v1|1\.2v|v2)\s*(?::|\s·))/i.exec(String(what ?? ''))
  return m ? (m[1] ?? m[2]).toLowerCase() : null
}

/** 레인 노트의 로그 절(머리에 「로그」 · 「기록」) → [{ at: 'MM-DD HH:MM', pan, result }]. 표 `| 시각 | 판 | 결과 | 비고 |` 꼴과 `- HH:MM …` 줄 꼴을 다 읽는다.
 * 날짜 없는 시각은 앞서 본 날짜(`- 11-16 11:41 …` 줄 · `### 11-16` 머리)를 잇고, 줄 꼴에서 시각이 거꾸로 가면 다음 날로 넘긴다. 날짜를 하나도 못 본 줄은 버린다(옛 일을 오늘로 잘못 싣지 않게). */
export function parseLaneLog(md, year = new Date().getUTCFullYear()) {
  const out = []
  const p = (v) => String(v).padStart(2, '0')
  const plusDay = (md) => { const [m, d] = md.split('-').map(Number); const t = new Date(Date.UTC(year, m - 1, d + 1)); return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}` }
  let inLog = false, day = null, prev = -1
  const stamp = (date, hm, bullet) => {
    const mins = hm.split(':').reduce((h, m) => +h * 60 + +m)
    if (date) { const [m, d] = date.split('-'); day = `${p(m)}-${p(d)}` }
    else if (!day) return null
    else if (bullet && mins < prev) day = plusDay(day)
    prev = mins
    return `${day} ${p(hm.split(':')[0])}:${hm.split(':')[1]}`
  }
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const h = /^(#{2,3})\s+(.*)$/.exec(line)
    if (h) {
      if (h[1] === '##') { inLog = /로그|^\W*기록/u.test(h[2]); day = null; prev = -1 }
      const d = /(?:\d{4}-)?(\d{1,2}-\d{1,2})(?!\d)/.exec(h[2])
      if (inLog && h[1] === '###' && d) { day = d[1].split('-').map((x) => p(x)).join('-'); prev = -1 }
      continue
    }
    if (!inLog) continue
    if (line.startsWith('|')) {
      const c = cells(line)
      const m = /^(?:\d{4}-)?(?:(\d{1,2}-\d{1,2})\s+)?(\d{1,2}:\d{2})$/.exec(c[0] ?? '')
      const at = m && stamp(m[1], m[2], false)
      if (at) out.push({ at, pan: c[1] ?? '', result: c[2] ?? '' })
      continue
    }
    const b = /^- (?:~~)?(?:\d{4}-)?(?:(\d{1,2}-\d{1,2})\s+)?(\d{1,2}:\d{2})(?!\d)\s*(.*)$/.exec(line)
    const at = b && stamp(b[1], b[2], true)
    if (at) out.push({ at, pan: b[3], result: '' })
  }
  return out
}

/** 바퀴 줄의 번호 낱말 — T-번호 · B5·R92·U18 꼴. */
const WHEEL_TOK = new RegExp(`${ID}|(?<![\\w-])[A-Z]\\d+[a-z]?(?![\\w-])`, 'g')
const wheelToks = (s) => [...new Set(String(s ?? '').match(WHEEL_TOK) ?? [])]
/** 운전 레인 진행 로그의 바퀴 줄 → 바퀴들(옛→새 · U18②). 새 꼴 「바퀴 N 시작(번호·번호)」(「띄움」도) ~ 「바퀴 N 끝」 · 옛 꼴 「바퀴 N(번호…)」 한 줄은 시작이자 끝.
 * 지금보다 미래인 줄은 버린다(U18③). 끝 없이 다음 바퀴가 열리면 그 앞 마지막 로그 줄 시각으로 닫는다. 끝이 없는 마지막 바퀴는 열린 채(ended null) —
 * 「지금」 줄(nowLine)이 「바퀴 N」 으로 그 바퀴를 부르면 그 줄의 번호도 일감에 더한다. 돌려주는 값: [{ n, began, ended, ids }] (시각은 ISO +09:00). */
export function parseWheels(md, year, nowMs, nowLine = '') {
  const lines = parseLaneLog(md, year).map((l) => ({ ...l, ts: kstIso(l.at, year) })).filter((l) => l.ts && Date.parse(l.ts) <= nowMs)
  const RANK = { start: 0, one: 1, end: 2 }
  const marks = lines.flatMap((l) => {
    const m = /^[^\p{L}\p{N}]*바퀴\s*(\d+)\s*(시작|띄움|끝)?\s*(?:\(([^)]*)\))?/u.exec(l.pan)
    if (!m) return []
    const kind = m[2] === '끝' ? 'end' : m[2] || m[3] === undefined ? 'start' : 'one'
    return [{ n: +m[1], kind, ids: wheelToks(m[3]), ts: l.ts }]
  }).sort((a, b) => a.ts.localeCompare(b.ts) || a.n - b.n || RANK[a.kind] - RANK[b.kind]) // 같은 분이면 바퀴 번호순(표는 맨 위가 최신이라 파일 순서를 못 믿는다)
  const times = lines.map((l) => l.ts).sort()
  const out = []
  let open = null
  const closeOpen = (ts) => { if (open) { open.ended = times.filter((t) => t >= open.began && t < ts).at(-1) ?? open.began; open = null } }
  for (const k of marks) {
    if (k.kind === 'end') { if (open?.n === k.n) { open.ended = k.ts; open = null } continue }
    closeOpen(k.ts)
    const w = { n: k.n, began: k.ts, ended: k.kind === 'one' ? k.ts : null, ids: k.ids }
    out.push(w)
    if (k.kind === 'start') open = w
  }
  if (open && new RegExp(`바퀴\\s*${open.n}(?!\\d)`).test(nowLine)) open.ids = [...new Set([...open.ids, ...wheelToks(nowLine)])]
  return out
}

/** 레인 폴더 이름 → 판에 띄울 레인 이름(U18④). 기기 낱말을 떼고, 떼고 남는 게 없으면(폴더 이름이 기기 이름뿐) 「<기기> 운전」. */
const DEVICE = /맥|업무 ?PC|씽크패드|NAS/gi
export function laneTitleOf(name) {
  const rest = String(name ?? '').replace(DEVICE, '').trim()
  if (rest) return clean(rest) || '레인'
  const dev = `${String(name ?? '').trim()} 운전`
  return DEVICE_LANE.test(dev) ? dev : '레인'
}

export const LANE_RUN_MS = 10 * 60e3 // 「지금」 줄 🔨/🔄 + 노트가 이만큼 안에 바뀌었으면 도는 레인(U18⑤)
export const LANE_FRESH_MS = 60 * 60e3 // 레인 폴더 노트가 이만큼 넘게 안 바뀌면 그 레인 표의 🔄·🔨·⛔ 줄 캐릭터는 퇴근(R102①)
/** 폴더 안 .md 들 중 가장 늦은 수정 시각(ms). 못 읽으면 0. */
function newestMd(dir) {
  try { return Math.max(0, ...readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => statSync(join(dir, n)).mtimeMs)) } catch { return 0 }
}

const LANE_SKIP = new Set(['닫힘', '요청함', '작업현황판']) // 작업현황판은 lanePath 로 따로 읽는다(l1)
/** 레인 뿌리 아래 폴더마다 「레인 *.md」 를 읽는다(읽기만). onWarn(폴더, 까닭) — 못 읽은 것. 돌려주는 줄엔 로그 줄(md 원문 · build 가 거른다)과 폴더 노트 최신 수정 시각(mtime)도 붙는다. */
export function readLanes(root, onWarn = () => {}, onInfo = () => {}) {
  if (!root || !existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !LANE_SKIP.has(d.name)).sort((a, b) => a.name.localeCompare(b.name)).flatMap((d) => {
    const f = readdirSync(join(root, d.name)).find((n) => /^레인 .*\.md$/.test(n))
    if (!f) { onWarn(d.name, '레인 노트 없음'); return [] }
    const md = readFileSync(join(root, d.name, f), 'utf-8')
    const note = parseLaneNote(md)
    if (!note.rows.length) (note.headSeen ? onWarn : onInfo)(d.name, note.headSeen ? '표는 있는데 줄을 못 읽음' : '읽을 표 없음') // 표 자체가 없으면 정보일 뿐
    return [{ name: d.name, ...note, md, mtime: newestMd(join(root, d.name)) }]
  })
}

export const SUPERVISOR_FRESH_MS = 10 * 60e3
/** 레인 폴더의 감독 노트 → { state, line }. 노트가 없거나 못 읽으면 null. 한 줄이 담백 검사에 걸리면 빈 글. */
export function readSupervisor(root, now) {
  const f = root ? join(root, '감독', '레인 감독.md') : ''
  if (!f || !existsSync(f)) return null
  try {
    const md = readFileSync(f, 'utf-8')
    const sec = /^## 요약\s*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(md)
    const line = (sec?.[1] ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
    return { state: now.getTime() - statSync(f).mtimeMs <= SUPERVISOR_FRESH_MS ? 'work' : 'idle', line: clean(line) }
  } catch { return null }
}

/** 요청함 노트 → R 줄(번호·처방·상태·시각·원문·종류 칸). 원문은 읽어 두되 싣기 전에 build 가 publicText 로 거른다. 칸 순서: # · 시각 · 원문 · 처방 · 종류 · 상태. */
export function parseRequests(md) {
  const rows = []
  for (const line of (md ?? '').split(/\r?\n/)) {
    const c = line.startsWith('|') ? cells(line) : null
    if (c && c.length >= 6 && /^R\d+$/.test(c[0])) rows.push({ id: c[0], what: c[3], state: c[5], at: c[1], ask: c[2], type: c[4] })
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
  if (link && /^\s*✅/u.test(state)) return { link: link[1], sprint: byId.get(link[1])?.sprint, col: { column: 'done', reason: 'done' } } // 「✅ → T-…」 는 끝이 이긴다
  if (link) { const t = byId.get(link[1]); return { link: link[1], sprint: t?.sprint, col: t ? { column: t.column, reason: t.reason } : { column: 'work', reason: 'new' } } }
  if (/^\s*✅/.test(state)) return { col: { column: 'done', reason: 'done' } }
  if (/^\s*🔨/.test(state)) return { col: { column: 'work', reason: 'new' } }
  return { col: { column: 'wait', reason: 'new' } } // 📥 대기 · 그 밖
}

/** 「집은 카드」 노트(R84) → Map(번호 → 상태 글). 줄 꼴 `- R84 · → T-10bh · 세션 · 11:55` · `- U10 · 🔨 세션 · 11:55` · `- R30 · ✅ 0fcb463 (…) · 23:41`.
 * 같은 번호가 여럿이면 **마지막 줄**이 이긴다(덧붙이기만 하는 노트). 둘째 칸에 ✅ 가 들었으면(`→ T-10i ✅ 9523348`) 끝으로 본다. R · U · K 다 읽는다. */
export function parsePicked(md) {
  const out = new Map()
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = /^\s*-\s+([RUK]\d+)\s+·\s+(.+?)(?:\s+·\s|$)/u.exec(line)
    if (!m) continue
    out.set(m[1], /✅/u.test(m[2]) ? `✅ ${m[2]}` : m[2])
  }
  return out
}
/** 요청함 줄에 집은 카드 상태를 덮는다(집은 줄이 있으면 그게 Board 카드 상태 — 요청함 표 상태 칸보다 우선). */
export const PICKED_NOTE = '집은 카드.md' // 요청함 노트와 같은 폴더
// 단 요청함 줄이 이미 ✅ 면 끝이 이긴다 — 집은 줄 「→ T-10bq」 가 남아 끝난 R69·R87·R88 이 「하는 중」으로 떴다(11-17 검수)
export const withPicked = (rows, picked) => rows.map((r) => (picked.has(r.id) && !/^\s*✅/u.test(r.state ?? '') ? { ...r, state: picked.get(r.id) } : r))

function gitBranches(repoDir) {
  if (!repoDir || !existsSync(repoDir)) return []
  const git = (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf-8' }).trim()
  try {
    const refs = git('for-each-ref', '--format=%(refname:short)\t%(committerdate:iso-strict)\t%(contents:subject)', 'refs/heads/1.2v-preview*')
      .split('\n').filter(Boolean).map((l) => l.split('\t'))
    const trunk = refs.find(([n]) => n === '1.2v-preview')
    if (!trunk) return []
    return refs.map(([name, at, subject]) => {
      if (name === trunk[0]) return { suffix: null, at, ahead: 0, merged: false }
      let merged = true
      try { git('merge-base', '--is-ancestor', name, trunk[0]) } catch { merged = false }
      return { suffix: name.slice(trunk[0].length + 1), at, subject, ahead: +git('rev-list', '--count', `${trunk[0]}..${name}`), merged }
    })
  } catch { return [] }
}

/** 줄기·가지 최근 커밋 N개와 부모 관계 — 세로 커밋 그래프용. 해시는 짧은 것만(긴 16진은 담백 검사에 걸린다). 새것→옛것. */
export const GRAPH_LIMIT = 60
export const FILES_MAX = 30
/** 커밋 하나의 바뀐 파일 경로 — 공개 글 검사를 거친 것만 FILES_MAX 개까지, 넘친 개수는 filesMore. 경로가 없으면 칸을 싣지 않는다. */
export function commitFiles(paths) {
  const ok = paths.filter((f) => f && f.length <= 200 && isPlainPath(f) && isPlainText(f.replace(/\//g, '-')))
  if (!ok.length) return {}
  return { files: ok.slice(0, FILES_MAX), ...(ok.length > FILES_MAX ? { filesMore: ok.length - FILES_MAX } : {}) }
}
export function gitGraph(repoDir, limit = GRAPH_LIMIT) {
  if (!repoDir || !existsSync(repoDir)) return []
  try {
    const out = execFileSync('git', ['-C', repoDir, '-c', 'core.quotepath=false', 'log', '--branches=1.2v-preview*', '--date-order', '-n', String(limit), '--abbrev=8', '--decorate=short', '--name-only',
      '--format=%x01%h%x09%p%x09%cI%x09%D%x09%s'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return out.split('\x01').filter((r) => r.trim()).map((rec) => {
      const [head, ...paths] = rec.split('\n')
      const [sha, parents, at, deco, ...subj] = head.split('\t')
      const names = deco.split(', ').map((d) => d.replace(/^HEAD -> /, '').trim()).filter((d) => d && d !== 'HEAD' && !d.startsWith('tag: ') && !d.includes('/'))
      const sub = subj.join(' ')
      return { sha, parents: parents.split(' ').filter(Boolean), at, names, subject: isPlainText(sub) ? sub.slice(0, 80) : '', ...commitFiles(paths.map((x) => x.trim())) }
    })
  } catch { return [] }
}

export const USAGE_STALE_MS = 30 * 60e3
/** 설정 슬롯 폴더 이름(`.claude`·`.claude-b`…) → 계정. 한도 파일 안에는 계정 칸이 없다(실측: updated·limits·source 뿐) — 어느 슬롯 파일인가로만 가른다.
 * 기본: `.claude` 는 기관, 나머지 슬롯은 개인. 로컬 설정 `usageAccounts` 로 덮어쓴다. */
export const DEFAULT_USAGE_ACCOUNT = (slot) => (slot === '.claude' ? 'org' : 'personal')
export const slotOf = (f) => String(f).split(/[\\/]/).find((seg) => /^\.claude(-[\w-]+)?$/.test(seg)) ?? '.claude'

/** 한도 — 슬롯(`.claude`·`.claude-*`)마다 파일을 읽어 계정별로 가른다. 한 계정에 슬롯이 여럿이면 mtime 최신 것. ts 는 「싣는 시각」이 아니라 파일 안 잰 시각(updated)·없으면 파일 mtime. 30분 넘게 낡았으면 stale: true(SQL 은 모르는 칸을 버린다). */
function readUsage(usagePath, nowIso, home, usageAccounts = {}) {
  const best = {}
  for (const f of claudeVariants(usagePath, { home })) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf-8'))
      const l = j.limits ?? {}
      const at = (v) => (typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : nowIso)
      if (typeof l.five_hour?.pct !== 'number' || typeof l.seven_day?.pct !== 'number') continue
      const ms = typeof j.updated === 'number' ? (j.updated < 1e12 ? j.updated * 1000 : j.updated) : statSync(f).mtimeMs
      const slot = slotOf(f)
      const account = usageAccounts[slot] === 'org' || usageAccounts[slot] === 'personal' ? usageAccounts[slot] : DEFAULT_USAGE_ACCOUNT(slot)
      if (best[account] && best[account].ms >= ms) continue
      // tok_per_min: 한도 파일엔 토큰이 없다 → 0(화면은 0 이면 「토큰 속도」 줄을 감추고 한도 %의 기울기로 속도를 말한다)
      const row = { account, ts: new Date(ms).toISOString(), pct_5h: l.five_hour.pct, pct_7d: l.seven_day.pct,
        reset_5h_at: at(l.five_hour.resets_at), reset_7d_at: at(l.seven_day.resets_at), tok_per_min: 0 }
      best[account] = { ms, row: Date.parse(nowIso) - ms > USAGE_STALE_MS ? { ...row, stale: true } : row }
    } catch { /* 깨진 슬롯 파일은 건너뛴다 */ }
  }
  return ['org', 'personal'].filter((a) => best[a]).map((a) => best[a].row)
}

// 문지기 훅(볼트 배포/hooks/board-gate.js)이 적는 「지금 도는 에이전트·세션」 → 각각 state(work|idle|off)를 매겨 돌려준다.
// 일함 work · 쉼 idle(세션은 살아 있는데 턴 끝 · 20분 안) · 퇴근 off(ended · 쉼이 20분 넘음 · 조용한 세션 20분 · 에이전트 2시간 넘게 ended 없음).
// 문턱 근거: 세션은 프롬프트 뒤 20분 조용하면 닫힌 것으로 본다(Stop·SessionEnd 가 안 온 기기 대비) · 에이전트는 started 뒤 2시간 넘게 ended 가 없으면 세션째 죽은 것(PostToolUse 가 안 온다).
// 퇴근한 것은 지우지 않고 마지막 활동 날(KST)이 지나기 전까지 싣는다(자정에 뺀다) — 그림이 숙소에 흐리게 모은다.
export const SESSION_QUIET_MS = 20 * 60e3
export const AGENT_STALE_MS = 2 * 3600e3
// 기록 파일 신호: 이 안에 쓰였으면 살아 있다(세션 SESSION_QUIET_MS 와 같은 20분) · 문지기 시각보다 이만큼 넘게 뒤여야 「그 뒤 새 움직임」으로 친다(Stop·SessionEnd 직후 마무리 쓰기 흡수).
export const ACTIVE_SLACK_MS = 30e3
// 퇴근 소음: 오늘(KST) 안이어도 마지막 활동이 3시간 넘은 퇴근은 싣지 않는다 — 문지기 주석의 「3시간 넘으면 끊긴 것」과 같은 척도, 화면엔 최근 퇴근만 숙소에 남긴다.
export const OFF_KEEP_MS = 3 * 3600e3
const kstDay = (ms) => Math.floor((ms + 9 * 3600e3) / 86400e3)
/** 퇴근을 싣는 기한 — 마지막 활동한 날 KST 자정까지(다음 날 0시부터 뺀다). */
export const keepOff = (last, now) => kstDay(last) === kstDay(now) && now - last <= OFF_KEEP_MS
// 문지기 파일은 프로필 폴더(.claude · .claude-*)마다 따로 쓰이고 세션·에이전트는 서로 다른 프로필에서 돈다 → 있는 것을 전부 합친다(키 충돌은 mtime 새 파일이 이김).
/** 다른 기기 거울 — 레인 폴더의 `현황판 관리/캐릭터/<기기>.json`(문지기 board-gate.js mirror). 폴더가 없거나 파일이 깨졌으면 조용히 빈손(fail-open). */
export const MIRROR_SUB = ['현황판 관리', '캐릭터']
function readMirrors(laneRoot) {
  const out = []
  if (!laneRoot) return out
  try {
    const dir = join(laneRoot, ...MIRROR_SUB)
    for (const n of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      try { out.push({ device: n.replace(/\.json$/, ''), actors: JSON.parse(readFileSync(join(dir, n), 'utf-8')).actors ?? {} }) } catch { /* 깨진 파일 하나는 건너뜀 */ }
    }
  } catch { /* 폴더 없음 */ }
  return out
}
function readGate(gatePath, now, tokens = {}, home, activity = {}, laneRoot) {
  const files = claudeVariants(gatePath, { home })
  const mirrors = readMirrors(laneRoot)
  if (!files.length && !mirrors.length) return []
  try {
    const merged = {}
    for (const m of mirrors) for (const [k, a] of Object.entries(m.actors)) if (a && typeof a === 'object') merged[k] = { ...a, device: m.device } // 거울이 바탕 — 같은 키는 아래 자기 기기 기록이 덮는다
    for (const f of files) { try { for (const [k, a] of Object.entries(JSON.parse(readFileSync(f, 'utf-8')).actors ?? {})) merged[k] = { device: merged[k]?.device, ...a } } catch { /* 깨진 파일 하나는 건너뜀 */ } }
    const seen = new Set() // 키는 달라도 같은 id(거울 ↔ 자기 기록)는 한 번만
    return Object.entries(merged)
      .map(([key, a]) => ({ ...a, tok: tokens[key] }))
      .filter((a) => typeof a.started === 'number' && /^a-[0-9a-f]{8}$/.test(a.id) && !seen.has(a.id) && seen.add(a.id))
      .map((a) => {
        const isSession = a.kind === 'session'
        const quiet = isSession ? SESSION_QUIET_MS : AGENT_STALE_MS
        const resting = typeof a.idle === 'number' && a.idle >= a.started
        let last = Math.max(a.started, typeof a.ended === 'number' ? a.ended : 0, resting ? a.idle : 0)
        const seen = activity[a.id] // 기록 파일 마지막 움직임(없으면 undefined)
        const fresh = (isSession || !a.ended) && typeof seen === 'number' && now - seen < SESSION_QUIET_MS && seen > last + ACTIVE_SLACK_MS // 문지기가 아는 마지막 일보다 뒤에, 최근에 쓰였다
        let state = 'work'
        if (fresh) { last = seen; return { ...a, ended: null, idle: undefined, state, last } } // 낱말 없는 이어 말하기·끝났다 다시 열린 세션도 일함
        if (!isSession && !a.ended && typeof seen === 'number' && now - seen >= SESSION_QUIET_MS) { state = 'off'; last = seen } // 에이전트 기록이 20분 조용 = 죽음(PostToolUse 못 옴)
        else if (a.ended) state = 'off'
        else if (resting) { state = now - a.idle >= SESSION_QUIET_MS ? 'off' : 'idle'; if (state === 'off') last = a.idle + SESSION_QUIET_MS }
        else if (now - a.started >= quiet) { state = 'off'; last = a.started + quiet } // 문턱을 넘은 때부터 퇴근
        return { ...a, state, last }
      })
      .filter((a) => a.state !== 'off' || keepOff(a.last, now))
  } catch { return [] }
}
const isBlockedState = (state) => /^\s*[⛔⏸🙋]/u.test(state)
/** 막힘 캐릭터를 세울 줄인가 — ⏸·🙋 거나, ⛔ 를 풀어도(→ 넘긴 번호 · 고칠 것 없음) 여전히 막힘인 것(R102④). */
const isStuck = (state, stateOf) => isBlockedState(state) && (/^\s*[⏸🙋]/u.test(state) || columnOfLinked(state, stateOf).reason === 'blocked')

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
    ...(here('./sink.mjs') ? [m('m-publish', '직접 싣기', 'm-data')] : []),
    m('m-gate', '문지기 훅', 'm-data'), // 볼트 쪽이라 여기선 존재 확인 못 함
  ]
}

const SITE = 'https://2026-gne-dev-task-force-team.github.io/school-shiftgrid-scheduler/'
const PREVIEW = 'https://2026-gne-dev-task-force-team.github.io/school-shiftgrid-scheduler/v1.2/'
/** 화면 호스팅 판정 — res: { status, build } 또는 null(실패). head: 줄기 짧은 해시. */
export function serviceState(res, head) {
  if (!res || res.status !== 200) return 'down'
  const b = String(res.build ?? '')
  return head && b && (b.startsWith(head) || head.startsWith(b)) ? 'ok' : 'build' // 짧은 해시 길이가 기기마다 달 수 있다
}
/** v1(루트)·v2(/v2/) 사이트 판정 — index: index.html 응답 { status } 또는 null, ver: version.json 응답 { status, build } 또는 null.
 *  index 가 안 열리면 down. version.json 이 200 이면 head(줄기 짧은 해시)와 견줘 ok/build. 404 등 build 를 못 읽으면 낡음 모름 → ok(down 아님). */
export function siteState(index, ver, head) {
  if (!index || index.status !== 200) return 'down'
  if (!ver || ver.status !== 200 || !ver.build) return 'ok'
  return serviceState(ver, head)
}
const SINK_STALE_MS = 30 * 60e3 // 보고꾼은 2분마다 돈다 — 30분 넘게 기록이 안 갱신되면 멈춘 것으로 본다
/** 자료 싣기 판정 — 직전 싣기 기록 { at, result: 'ok'|'fail'|'nocred', status } (없으면 null). 이름에 결과를 적는다(경로·값 없음). */
export function sinkService(rec, now = new Date()) {
  const base = '자료 싣기'
  const at = rec && Number.isFinite(Date.parse(rec.at)) ? new Date(rec.at) : null
  if (!rec || !at) return { name: `${base} · 기록 없음`, state: 'plan', checked_at: now.toISOString() }
  const checked_at = at.toISOString()
  if (rec.result === 'nocred') return { name: `${base} · 자격 없음`, state: 'plan', checked_at }
  const code = Number.isInteger(rec.status) ? ` ${rec.status}` : ''
  if (rec.result === 'fail') return { name: `${base} · 실패${code ? ` · 응답${code}` : ''}`, state: 'down', checked_at }
  if (rec.result === 'ok' && now.getTime() - at.getTime() > SINK_STALE_MS) return { name: `${base} · 멈춤 · 응답${code}`, state: 'down', checked_at }
  return rec.result === 'ok' ? { name: `${base} · 성공 · 응답${code}`, state: 'ok', checked_at } : { name: `${base} · 기록 없음`, state: 'plan', checked_at }
}
/** 싣개가 남긴 로컬 상태 파일을 읽는다 — 없거나 깨졌으면 null. */
export function readSinkState(path) {
  try { return path ? JSON.parse(readFileSync(path, 'utf-8')) : null } catch { return null }
}
/** 공개 창구 + 직전 싣기 기록(로컬 파일)으로 Service[] — 어떤 오류도 던지지 않는다. */
export async function checkServices(repoDir, now = new Date(), sinkStatePath = '', fetchFn = fetch) {
  const checked_at = now.toISOString()
  // 기관망이 github.io 인증서를 중간에서 다시 서명한다 — node 기본 CA 로는 SELF_SIGNED_CERT_IN_CHAIN 이라 OS 인증서 저장소도 믿는다(curl·브라우저와 같게)
  if (fetchFn === fetch) try { tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]) } catch { /* 옛 node */ }
  const get = async (url, asJson = true) => {
    try {
      const r = await fetchFn(url, { signal: AbortSignal.timeout(5000) })
      return { status: r.status, body: asJson && r.ok ? await r.json() : null }
    } catch { return null }
  }
  const shortOf = (ref) => { try { return execFileSync('git', ['-C', repoDir, 'rev-parse', '--short', ref], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  const head = shortOf('1.2v-preview')
  // v1(루트)·v2(/v2/) — index.html 로 살아있나, version.json 이 있으면 줄기(origin/v1·origin/main)와 견줘 낡음까지
  const site = async (path, ref) => {
    const t = now.getTime()
    const [index, v] = await Promise.all([get(`${SITE}${path}?t=${t}`, false), get(`${SITE}${path}version.json?t=${t}`)])
    return siteState(index, v && { status: v.status, build: v.body?.build }, shortOf(ref))
  }
  const [v1, v2] = await Promise.all([site('', 'origin/v1'), site('v2/', 'origin/main')])
  const ver = await get(`${PREVIEW}version.json?t=${now.getTime()}`)
  // url 은 비운다 — 담백 검사가 「/」 를 거르고(공개 판), 화면도 url 을 안 쓴다
  const s = (id, name, state, at = checked_at) => ({ id, name, state, url: '', task_id: null, checked_at: at })
  const sync = sinkService(readSinkState(sinkStatePath), now)
  return [
    s('s-host', '화면 호스팅', serviceState(ver && { status: ver.status, build: ver.body?.build }, head)),
    s('s-host-v1', '화면 호스팅 v1', v1),
    s('s-host-v2', '화면 호스팅 v2', v2),
    s('s-sync', sync.name, sync.state, sync.checked_at),
    s('s-reporter', '보고꾼', 'ok'),
  ]
}

// 분류 → 캐릭터(직업·팀·역할 = actor.ts ROLES 낱말). 직업 칸 = job · 이름(name)은 맨 끝에서 캐릭터 id 로 정한다(R98 · 직업 낱말로 이름을 만들지 않는다). 코드 판의 직업은 「코드 짜기」(「자료 나르기」는 정말 자료만 나르는 판 몫). 지휘 분류는 따로 캐릭터를 안 만들고 지휘가 맡는다.
const ACTOR = { 화면: ['화면 다듬기', '화면팀', '화면', 'make', 175, 'teal', 'brush'], 코드: ['코드 짜기', '코드팀', '코드', 'make', 160, 'teal', 'box'],
  설계: ['설계', '설계팀', '설계', 'make', 190, 'teal', 'ruler'], 검사: ['시험', '시험팀', '시험', 'qa', 275, 'violet', 'check'], 지휘: ['지휘', '지휘', '지휘', 'hq', 40, 'amber', 'flag'] }
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)

// 표마다 기본키(대부분 id · usage 는 account+ts)가 겹치면 싣기 SQL 이 통째로 400 이 된다 — 뒤 줄 id 에 `~2` 꼬리를 붙여 둘 다 살린다.
// 꼬리를 못 붙이는 표(키가 숫자·복합: sprints·usage)는 첫 줄만 남긴다. 다른 표가 그 id 를 가리키면 첫 줄로 이어진다(원래 id 가 첫 줄 것이라서).
const KEYS = { usage: ['account', 'ts'], sprints: ['id'] }
export function dedupeKeys(data, onWarn = () => {}) {
  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue
    const key = KEYS[table] ?? ['id']
    const tail = key.length === 1 && typeof rows.find((r) => r?.[key[0]] != null)?.[key[0]] === 'string'
    const seen = new Set(rows.map((r) => key.map((k) => r?.[k]).join('\u0000')))
    const used = new Set()
    data[table] = rows.flatMap((r) => {
      const k = key.map((c) => r?.[c]).join('\u0000')
      if (!used.has(k)) { used.add(k); return [r] }
      if (!tail) { onWarn(table, `키 중복 ${k.replace('\u0000', '/')} — 뒤 줄 버림`); return [] }
      let n = 2
      while (seen.has(`${r[key[0]]}~${n}`)) n++
      const id = `${r[key[0]]}~${n}`
      seen.add(id); used.add(id)
      onWarn(table, `id 중복 ${r[key[0]]} — 뒤 줄을 ${id} 로 살림`)
      return [{ ...r, [key[0]]: id }]
    })
  }
  return data
}


/** 설명 글에서 「완료 정의:」 뒤를 떼어 { body, done } 으로 — 칸 전문을 담백 거름(publicText)에 건다(자르지 않는다). 둘 다 없으면 칸을 안 둔다. */
export function splitDetail(text) {
  const m = /완료 ?정의\s*[:：]/.exec(text ?? '')
  const [a, b] = m ? [text.slice(0, m.index), text.slice(m.index + m[0].length)] : [text ?? '', '']
  const body = publicText(a, codeWord), done = publicText(b, codeWord)
  return { ...(body ? { body } : {}), ...(done ? { done } : {}) }
}
/** 쥔님 원문 칸 → 따옴표(*"…"*)를 걷고 거른 글. */
export function publicAsk(s) {
  return publicText((s ?? '').replace(/^\s*\*?"|"\*?\s*$/g, '').replace(/\*"|"\*/g, ''), codeWord)
}
/** 요청함 「종류」 칸 → 유형(kind). 모르는 낱말은 일(work). */
export const kindOfType = (t) => (/고침|결함|버그|bug|🐞/i.test(t ?? '') ? 'bug' : /설계|cr|📐/i.test(t ?? '') ? 'cr' : /검수|검사|review|👀|🔍/i.test(t ?? '') ? 'review' : 'work')
const verbOf = (l) => {
  const mark = `${l.pan} ${l.result}`
  return /^\s*❌/.test(l.result) ? '다시' : /✅|머지/.test(l.pan) || /^\s*✅/.test(l.result) ? '끝' : /⏸|⛔|막힘/.test(mark) ? '막힘' : '시작'
}
const HIST_LABEL = { 시작: '착수', 끝: '끝', 막힘: '막힘', 다시: '다시' }
const mentions = (text, re) => [...new Set(String(text ?? '').match(re) ?? [])]
const RID = /\bR\d+\b/g
/** 서로 이어진 태스크 번호(R↔T · R↔R · T↔R)를 양쪽에 넣는다. 없는 번호·제 번호는 버린다. */
export function linkTasks(tasks, edges) {
  const ids = new Set(tasks.map((t) => t.id))
  const m = new Map()
  const add = (a, b) => { if (a !== b && ids.has(a) && ids.has(b)) { (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a) } }
  for (const [a, b] of edges) add(a, b)
  for (const t of tasks) if (m.has(t.id)) t.links = [...m.get(t.id)]
  return tasks
}

/** 원천 → BoardData. onDrop(표, 까닭) 은 담백 검사로 버린 줄마다 부른다. 끝에 전체를 한 번 더 훑어 걸리면 예외. */
export function build({ lanePath, requestPath, requestMd, repoDir, usagePath, gatePath, tokens, laneRoot, now = new Date(), md, services = [], onDrop = () => {}, onWarn = () => {}, onInfo = () => {}, home, activity = {}, redactNames = [], usageAccounts = {}, pickedPath, pickedMd }) {
  setRedactNames(redactNames)
  const { sprints: raw, log, closes, laneClosed } = parseLane(md ?? readFileSync(lanePath, 'utf-8'), onWarn)
  const nowIso = now.toISOString()
  const year = new Date(now.getTime() + 9 * 3600e3).getUTCFullYear()
  const day = log[0]?.at.split(' ')[0] // 맨 위가 최신 — 스프린트 제목 시각엔 날짜가 없어 이 날로 본다
  const logAt = log.map((r) => ({ ...r, ts: kstIso(r.at, year), ids: r.pan.match(TID) ?? [] })).filter((r) => r.ts).reverse() // 옛→새
  // 레인 폴더는 먼저 읽는다 — 「⛔ … → T-번호」 를 다른 레인 표 번호로도 풀어야 해서(R102④)
  const lanesRaw = readLanes(laneRoot, onWarn, onInfo)
  const rawState = new Map()
  for (const r of [...raw.flatMap((s) => s.rows), ...lanesRaw.flatMap((l) => l.rows)]) if (!rawState.has(r.id)) rawState.set(r.id, r.state)
  const stateOf = (id) => rawState.get(id)
  // 레인 노트가 LANE_FRESH_MS 넘게 안 바뀌었으면 사람이 없다 — 표가 🔄·⛔ 라도 캐릭터는 안 세운다(R102①). 지금 판 노트는 파일로 읽을 때만 잰다.
  const isFresh = (ms) => !ms || now.getTime() - ms <= LANE_FRESH_MS
  const l1Fresh = !lanePath || !existsSync(lanePath) || isFresh(statSync(lanePath).mtimeMs)

  const tasks = []
  const edges = [] // 번호끼리 이은 줄(R↔T)
  const sprints = []
  const taskIds = new Set() // 레인 표 번호 재사용 — 스프린트 task_ids 도 같은 새 id 를 가리키게 여기서 먼저 꼬리를 붙인다
  const nowMs = now.getTime()
  const past = (iso) => !!iso && Date.parse(iso) <= nowMs
  let prevDay = null
  for (const s of raw) {
    // 날짜(U18③): 머리 시각엔 날짜가 없다 — 제 일감 로그 줄 중 가장 이른 날 · 없으면 제 닫음 줄 날 · 앞 스프린트 날 · 진행 로그 맨 위 날. 지금보다 미래인 줄은 안 쓴다.
    const ownHits = logAt.filter((l) => past(l.ts) && s.rows.some((r) => l.ids.includes(r.id)))
    const sDay = ownHits[0]?.at.split(' ')[0] ?? (closes.has(s.id) ? closes.get(s.id).split(' ')[0] : null) ?? prevDay ?? day
    prevDay = sDay
    const head = kstIso(s.began, year, sDay)
    const began = past(head) ? head : ownHits[0]?.ts ?? nowIso
    const mine = []
    for (const r of s.rows) {
      const title = publicTitle(r.what)
      if (!title) { onDrop('tasks', r.id); continue }
      const hits = logAt.filter((l) => l.ids.includes(r.id))
      const col = columnOfLinked(r.state, stateOf)
      const category = categoryOf(r.team)
      let tid = r.id
      for (let n = 2; taskIds.has(tid); n++) tid = `${r.id}~${n}`
      if (tid !== r.id) onWarn('tasks', `id 중복 ${r.id} — 뒤 줄을 ${tid} 로 살림`)
      taskIds.add(tid)
      tasks.push({ id: tid, title, app: '1.2v', category, kind: category === '검사' ? 'review' : 'work', target: targetOf({ id: r.id, title, category: r.team, lane: '현황판 만들기' }), team: ACTOR[category][1], sprint: s.id,
        est_min: parseInt(r.est, 10) || 0, started_at: hits[0]?.ts ?? began, lane_id: 'l1', ...col,
        actor_id: col.column !== 'work' || !l1Fresh ? null : category === '지휘' ? 'a-lead' : `a-${r.id}`, updated_at: hits.at(-1)?.ts ?? began, ...splitDetail(r.what),
        ...(hits.length ? { history: hits.map((l) => ({ ts: l.ts, text: HIST_LABEL[verbOf(l)] })).filter((e, i, a) => e.text !== a[i - 1]?.text).slice(-20) } : {}) })
      for (const rid of mentions(`${r.what} ${r.state}`, RID)) edges.push([tid, rid])
      tasks[tasks.length - 1] = bodyFromLog(tasks.at(-1), hits, codeWord) // 표 설명이 거름에 비면 진행 로그 결과 칸으로 채운다
      mine.push(tasks.at(-1))
    }
    const allDone = mine.length > 0 && mine.every((t) => t.column === 'done')
    // 닫힘: 머리 끝 시각 · 머리 🏁 · 진행 로그 「🏁 스프린트 N 닫음」 · 레인 「지금」 🏁(마지막 절). ⏸·⬜ 가 남아도 닫는다 — 남은 수는 missed 에 「이월 N개」.
    const ms = (iso) => new Date(iso).getTime()
    let endedIso = s.endedAt ? kstIso(s.endedAt, year, sDay ?? new Date(now.getTime() + 9 * 3600e3).toISOString().slice(5, 10)) : null
    if (endedIso && ms(endedIso) < ms(began)) endedIso = began // 끝 시각이 시작보다 이르면(자정 넘김) 시작으로 — 날짜는 머리에 없다
    if (!past(endedIso)) endedIso = null // 미래 끝 = 날짜 짐작이 틀린 값 — 버리고 다음 근거로(U18③)
    const closedByMark = s.closed || closes.has(s.id) || (laneClosed && s === raw.at(-1))
    const closeAt = closes.has(s.id) ? kstIso(closes.get(s.id), year) : null
    const lastOwn = mine.map((t) => t.updated_at).concat(began).filter(past).sort().at(-1) ?? began
    const closeIso = endedIso ?? (past(closeAt) && ms(closeAt) >= ms(began) ? closeAt : null) ?? (closedByMark || s.endedAt ? lastOwn : null)
    const isClosed = allDone || !!closeIso
    const carry = isClosed ? mine.filter((t) => t.column !== 'done').length : 0
    sprints.push({ id: s.id, title: clean(s.title) || `스프린트 ${s.id}`, goal: publicGoal(s.goal) || clean(s.title), began,
      ended: closeIso ?? (allDone ? lastOwn : null), task_ids: mine.map((t) => t.id),
      est_min: mine.reduce((a, t) => a + t.est_min, 0), actual_min: 0, review: '', passed: isClosed ? true : null, // 규칙: 절 태스크가 전부 ✅ 이거나 닫힘 표시(끝 시각·🏁)가 있으면 통과, 아니면 진행 중(null)
       missed: carry ? `이월 ${carry}개` : '', next: '' })
    sprints.at(-1).review = sprintReview(mine)
  }
  // 다른 레인 폴더 → lane 한 줄 + 표 태스크(스프린트 0 — 운전 바퀴에 든 일감만 그 바퀴 스프린트 번호를 받는다 · U18②). 담당 캐릭터는 안 세운다.
  // 스프린트 셈(cur)이 바퀴 스프린트를 보려면 레인 카드가 먼저 있어야 해서 여기서 읽는다.
  const seen = new Set()
  const bare = laneTitleOf
  const bareCount = lanesRaw.reduce((m, l) => m.set(bare(l.name), (m.get(bare(l.name)) ?? 0) + 1), new Map())
  const bareSeen = new Map() // 걷은 이름이 겹치면 기기 낱말은 못 싣는다(담백 검사) — 뒤 것에 번호를 붙여 구별
  const laneBlocked = [] // 다른 레인 표에서 ⛔/⏸/🙋 인 일감
  const laneRows = lanesRaw.map((ln) => {
    const id = `l-${hash(ln.name).slice(0, 6)}`
    const fresh = isFresh(ln.mtime)
    const laneApps = appsOfLane(ln.name)
    const byRaw = new Map() // 표 번호 → 카드(로그 줄의 번호를 잇는다)
    const outsOf = new Map() // 표 줄 → 그 줄 카드 전부(두 판이면 둘)
    const mine = ln.rows.flatMap((r) => {
      const title = publicTitle(r.what)
      let tid = `${id}-${r.id}`
      if (!isPlain(tid) || seen.has(tid)) tid = `${id}-${hash(tid + seen.size)}`
      if (!title) { onDrop('tasks', tid); return [] }
      seen.add(tid)
      const col = columnOfLinked(r.state, stateOf)
      if (fresh && isStuck(r.state, stateOf)) laneBlocked.push({ id: tid, title, state: r.state })
      // 판: 줄 머리의 판 표시가 이기고, 없으면 레인 이름의 판 전부(「v1·v2 설계」 는 두 판에 다 — 둘째부터 id 꼬리 ~판)
      const apps = appOfRow(r.what) ? [appOfRow(r.what)] : laneApps
      const out = apps.map((app, i) => ({ id: i ? `${tid}~${app}` : tid, title, app, category: '코드', kind: 'work', target: targetOf({ id: r.id, title, lane: ln.name }), team: ACTOR['코드'][1], sprint: 0, est_min: 0, started_at: null, lane_id: id,
        ...col, actor_id: col.column === 'work' && fresh && !i ? `a-${tid}` : null, updated_at: nowIso, ...splitDetail(r.what) }))
      if (!byRaw.has(r.id)) byRaw.set(r.id, out[0])
      outsOf.set(r, out)
      return out
    })
    // 번호 → 카드: 표 번호가 같으면 그 줄, 아니면 「할 일」 칸에 그 낱말(B5·U18·R92)이 든 줄(옛 바퀴 꼴은 판 번호 대신 묶음 이름을 적었다)
    const cardsOf = (tok) => {
      const hit = ln.rows.filter((r) => r.id === tok)
      const rows = hit.length ? hit : ln.rows.filter((r) => new RegExp(`(?<![\\w-])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(r.what))
      return rows.flatMap((r) => outsOf.get(r) ?? [])
    }
    // 「지금」 줄이 🔨/🔄 이고 노트가 10분 안에 바뀌었으면 도는 레인(U18⑤)
    const running = /^[^\p{L}\p{N}]*[🔨🔄]/u.test(ln.now) && !!ln.mtime && now.getTime() - ln.mtime <= LANE_RUN_MS
    const state = (fresh && mine.some((t) => t.column === 'work')) || running ? 'work' : /^[^\p{L}\p{N}]*(🛑|⛔)/u.test(ln.now) ? 'blocked' : 'idle'
    return { lane: { id, title: ((k, n) => (bareCount.get(k) > 1 && n > 1 ? `${k} ${n}` : k))(bare(ln.name), bareSeen.set(bare(ln.name), (bareSeen.get(bare(ln.name)) ?? 0) + 1).get(bare(ln.name))), state, actor_id: null }, tasks: mine, ln, byRaw, cardsOf }
  })

  // 운전 바퀴 → 스프린트(U18②). 번호는 지금 판 스프린트 최대 다음부터 시각순. 일감 카드엔 그 바퀴 번호(뒤 바퀴가 이긴다).
  const wheels = laneRows.flatMap((lr) => parseWheels(lr.ln.md, year, now.getTime(), lr.ln.now).map((w) => ({ ...w, lr })))
    .sort((a, b) => a.began.localeCompare(b.began) || a.n - b.n)
  const l1Sprints = [...sprints]
  const l1Cur = [...l1Sprints].reverse().find((s) => !s.ended) ?? l1Sprints.at(-1) // 지금 판 표의 막힘 캐릭터는 지금 판 스프린트에서 찾는다
  let nextId = Math.max(0, ...sprints.map((s) => s.id)) + 1
  for (const w of wheels) {
    const id = nextId++
    const mine = [...new Set(w.ids.flatMap((tok) => w.lr.cardsOf(tok)))]
    for (const t of mine) t.sprint = id
    const title = clean(`바퀴 ${w.n}${w.ids.length ? ` (${w.ids.join('·')})` : ''}`) || `바퀴 ${w.n}`
    const carry = w.ended ? mine.filter((t) => t.column !== 'done').length : 0
    sprints.push({ id, title, goal: title, began: w.began, ended: w.ended, task_ids: mine.map((t) => t.id), est_min: 0, actual_min: 0,
      review: sprintReview(mine), passed: w.ended ? true : null, missed: carry ? `이월 ${carry}개` : '', next: '' })
  }

  sprintNext(sprints).forEach((n, i) => { sprints[i].next = n })
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cur = [...sprints].reverse().find((s) => !s.ended) ?? sprints.at(-1)
  const cardById = new Map([...tasks, ...laneRows.flatMap((l) => l.tasks)].map((t) => [t.id, t])) // 바퀴 스프린트의 일감은 레인 카드
  const curTasks = cur ? cur.task_ids.map((id) => cardById.get(id)).filter(Boolean) : []
  const done = curTasks.filter((t) => t.column === 'done').length
  const goals = cur ? [{ id: `g${cur.id}`, title: cur.title, progress: curTasks.length ? Math.round((done / curTasks.length) * 100) : 0,
    state: cur.ended ? 'shipped' : 'work', sprint: cur.id }] : []
  const runs = cur ? [{ id: `r${cur.id}`, started_at: cur.began, ended_at: cur.ended, sprint: cur.id, goal_id: `g${cur.id}` }] : []

  const branches = []
  for (const b of gitBranches(repoDir)) {
    if (!b.suffix) { branches.push({ id: 'b-trunk', title: '줄기', trunk: true, ahead: 0, state: 'live', actor_id: null, task_id: null, updated_at: b.at }); continue }
    const t = byId.get(`T-${b.suffix}`)
    if (!t) { // 레인 표에 일감이 없는 가지도 지금 있는 것은 싣는다(이름 낱말이 담백해야 — 아니면 뺀다)
      const title = clean(`가지 ${b.suffix}`)
      if (title && isPlain(b.suffix)) branches.push({ id: `b-${b.suffix}`, title: branchTitle(b.subject, codeWord) ?? title, trunk: false, ahead: b.ahead, state: b.merged ? 'merged' : 'live', actor_id: null, task_id: null, updated_at: b.at })
      continue
    }
    branches.push({ id: `b-${t.id}`, title: t.title, trunk: false, ahead: b.ahead, state: b.merged && t.column !== 'work' ? 'merged' : 'live', // 막 딴 판 가지(앞선 0)는 일감이 도는 동안 열린 가지
      actor_id: t.actor_id, task_id: t.id, updated_at: b.at })
  }

  // 커밋 그래프 — 줄기 행에 싣는다(서버 branches 에 graph 칸이 있어야 실린다 · 없으면 판이 가지 정보로 얼개를 만든다)
  const trunkRow = branches.find((b) => b.trunk)
  if (trunkRow) {
    const idOf = (name) => name === '1.2v-preview' ? 'b-trunk' : [`b-T-${name.slice(13)}`, `b-${name.slice(13)}`].find((id) => branches.some((b) => b.id === id)) ?? null
    trunkRow.graph = gitGraph(repoDir).map(({ names, ...c }) => ({ ...c, refs: names.filter((n) => isPlain(n)).map((n) => ({ name: n, branch_id: idOf(n) })) }))
  }

  const live = readGate(gatePath, now.getTime(), tokens, home, activity, laneRoot)
  const working = l1Fresh ? tasks.filter((t) => t.column === 'work') : [] // 노트가 묵었으면 🔄 줄은 카드로만 남고 캐릭터는 없다(R102①)
  const leadTask = working.find((t) => t.category === '지휘')
  const lead = { id: 'a-lead', parent_id: null, kind: 'lead', name: '지휘', hue: 40, eye: 'amber', prop: 'flag', dept: 'hq', team: '지휘', role: '지휘',
    // 지휘 세션 신호 = 문지기 actors 의 살아 있는 세션·에이전트(off 아님). 있으면 일감 유무로 work/idle, 없으면 off(본부 인원 0).
    // 선택 이유(R120): 살아 있는 지휘 세션이 없는데 고정 「지휘」·「쉼」 캐릭터를 세우면 「지금 누가 일하나」가 거짓이 된다 — 문지기를 못 읽은 경우도 같다(모르면 안 세운다).
    state: live.some((g) => g.state === 'work') ? 'work' : live.some((g) => g.state !== 'off') ? (working.length ? 'work' : 'idle') : 'off', task_id: leadTask?.id ?? null, branch_id: null, account: 'org', tok_per_min: 0, started_at: sprints[0]?.began ?? nowIso, ended_at: null }
  if (lead.state === 'off') lead.ended_at = lead.started_at // 퇴근 시각을 현재로 찍으면 시각만 달라도 스냅샷 해시가 바뀐다
  const actors = [lead, ...working.filter((t) => t.category !== '지휘').map((t) => {
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category]
    return { id: t.actor_id, parent_id: lead.id, kind: 'helper', name, hue, eye, prop, dept, team, role, state: 'work', task_id: t.id,
      branch_id: branches.some((b) => b.id === `b-${t.id}`) ? `b-${t.id}` : null, account: 'org', tok_per_min: 0, started_at: t.started_at ?? nowIso, ended_at: null }
  })]
  // 실제로 도는 에이전트: 판 표에 그 일감 캐릭터가 있으면 「지금 일함」으로, 없으면 새로 세운다(일감 모르면 일손).
  const spent = new Map() // 캐릭터 → 그 캐릭터가 맡은 에이전트들의 쓴 토큰 합·구간(같은 일감 에이전트가 여럿이면 한 캐릭터로 합친다)
  const credit = (actor, g) => {
    if (typeof g.tok !== 'number') return
    const e = spent.get(actor) ?? { total: 0, from: g.started, to: 0 }
    e.total += g.tok; e.from = Math.min(e.from, g.started); e.to = Math.max(e.to, g.state === 'off' ? g.last : now.getTime())
    spent.set(actor, e)
  }
  const withRace = (a, g) => { const r = raceOfDevice(g.device); if (r && !a.race) a.race = r } // 종족 = 그 캐릭터가 도는 기기(T-10ca) — 모르면 칸 없음(사람)
  for (const g of live) {
    if (g.kind === 'session') continue
    const t = byId.get(g.task ?? '')
    const at = new Date(g.started).toISOString()
    const mine = t && actors.find((a) => a.task_id === t.id && a.kind === 'helper')
    if (mine) { credit(mine, g); withRace(mine, g); if (g.state === 'work') { mine.state = 'work'; mine.started_at = at } continue } // 끝난 에이전트는 레인 표의 🔄 줄을 못 끈다(표가 말한다)
    const dup = actors.find((a) => a.id === (t ? `a-${t.id}` : g.id)) // 같은 일감 에이전트가 여럿(끝난 것+도는 것)이면 한 캐릭터로 — 도는 쪽이 이긴다
    if (dup) { credit(dup, g); withRace(dup, g); if (g.state === 'work' && t?.column !== 'done') dup.state = 'work'; continue }
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t && t.category !== '지휘' ? t.category : '코드']
    const fresh = { id: t ? `a-${t.id}` : g.id, parent_id: lead.id, kind: 'helper', name: t ? name : '일손', hue, eye, prop, dept, team, role,
      state: t?.column === 'done' ? 'off' : g.state, // 레인 표에서 ✅ 인 일감의 캐릭터는 퇴근
      task_id: t?.id ?? null, branch_id: t && branches.some((b) => b.id === `b-${t.id}`) ? `b-${t.id}` : null,
      account: 'org', tok_per_min: 0, started_at: at, ended_at: g.state === 'off' ? new Date(g.last).toISOString() : null }
    withRace(fresh, g); actors.push(fresh); credit(fresh, g)
  }
  // 토큰 = 누적(tok_total) · 분당(tok_per_min = 누적 ÷ 일한 분, 1분 미만은 1분으로). 기록을 못 이은 캐릭터는 두 칸 다 빠진다(화면 「—」).
  for (const [a, e] of spent) { a.tok_total = e.total; a.tok_per_min = Math.round(e.total / Math.max(1, (e.to - e.from) / 60000)) }

  // 문지기가 적은 `#시간표앱` 세션 자체 — 에이전트 없이도 캐릭터 하나(하는 일은 모르니 「대화 세션」)
  // 하는 일(덤 · U18): 그 세션이 띄운 에이전트(문지기 lead)의 일감이 든 레인 → 그 레인 「지금」 줄의 첫 번호 카드. 못 찾으면 비운다.
  const sessionTask = (sid) => {
    const raws = live.filter((a) => a.kind !== 'session' && a.lead === sid && a.task).map((a) => a.task)
    const lr = laneRows.find((l) => raws.some((x) => l.byRaw.has(x)))
    return lr ? wheelToks(lr.ln.now).map((tok) => lr.cardsOf(tok)[0]).find(Boolean)?.id ?? null : null
  }
  for (const g of live.filter((x) => x.kind === 'session'))
    actors.push({ id: g.id, parent_id: null, kind: 'helper', name: '대화 세션', hue: 40, eye: 'amber', prop: '', dept: 'hq', team: '세션', role: '세션',
      state: g.state, task_id: sessionTask(g.id), branch_id: null, account: 'org', tok_per_min: 0, started_at: new Date(g.started).toISOString(),
      ended_at: g.state === 'off' ? new Date(g.last).toISOString() : null, ...(raceOfDevice(g.device) ? { race: raceOfDevice(g.device) } : {}) })
  // 감독관 = 레인 폴더 `감독/레인 감독.md`(순찰이 5분마다 덮어씀). 노트가 있을 때만 — 일함(mtime 10분 안) · 쉼, 한 줄 = `## 요약` 줄.
  const sup = readSupervisor(laneRoot, now)
  if (sup) actors.push({ id: 'a-supervisor', parent_id: lead.id, kind: 'helper', name: '감독관', hue: 40, eye: 'teal', prop: '', dept: 'hq', team: sup.line, role: '감독',
    state: sup.state, task_id: null, branch_id: null, account: 'org', tok_per_min: 0, started_at: nowIso, ended_at: null })
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
      const verb = verbOf(l)
      add(verb === '다시' ? 'task.reject' : 'task.move', 'task', t.id, `${name} ${verb}`, '')
    }
    if (l === lastPin) add('goal.progress', 'actor', lead.id, '방향 바뀜', '📌')
  }

  // 요청함 R 줄 → 카드. 지휘 일감·스프린트 진행률 셈이 끝난 뒤에 붙인다(그 셈에 안 섞인다). id 는 R번호라 T 태스크와 안 겹친다.
  const rmd = requestMd ?? (requestPath && existsSync(requestPath) ? readFileSync(requestPath, 'utf-8') : '')
  // 「집은 카드」(R84) — 요청함 옆 노트. 운전·검수 세션은 요청함 상태 칸 대신 여기에 덧붙인다 → 같은 번호의 마지막 줄이 카드 상태.
  const pickedFile = pickedPath ?? (requestPath ? join(dirname(requestPath), PICKED_NOTE) : '')
  const picked = parsePicked(pickedMd ?? (pickedFile && existsSync(pickedFile) ? readFileSync(pickedFile, 'utf-8') : ''))
  const requests = withPicked(parseRequests(rmd), picked)
  // 「→ T-번호」 는 지금 판 표에 없으면 다른 레인 표 번호로도 찾는다
  const linkById = new Map([...[...rawState.keys()].map((id) => [id, columnOfLinked(stateOf(id), stateOf)]), ...byId])
  const reqTasks = requests.map((r) => {
    const { col, link, sprint } = requestColumn(r.state, linkById)
    const title = requestTitle(r.what, r.id)
    const ask = publicAsk(r.ask), askedAt = kstIso(r.at, year)
    for (const x of mentions(`${r.what} ${r.state}`, TID)) edges.push([r.id, x])
    for (const x of mentions(`${r.what} ${r.state}`, RID)) edges.push([r.id, x])
    const history = [...(askedAt ? [{ ts: askedAt, text: '접수' }] : []), ...(link ? (byId.get(link)?.history ?? []) : [])]
    return { id: r.id, app: '1.2v', title: link ? `${title} (→ ${link})` : title, category: '지휘', kind: kindOfType(r.type), target: targetOf({ id: r.id, title, type: r.type, lane: '현황판 만들기' }), team: ACTOR['지휘'][1], sprint: sprint ?? cur?.id ?? 0,
      est_min: 0, started_at: null, lane_id: 'l1', ...col, actor_id: null, updated_at: nowIso, ...(ask ? { ask } : {}), ...(askedAt ? { askedAt } : {}), ...(/^\s*\*?"/.test(r.ask ?? '') ? { direct: true } : {}), ...splitDetail(r.what),
      ...(history.length ? { history } : {}) }
  })

  // 다른 레인의 🔄 태스크 → 번호로 부르는 캐릭터(세션·기기·사람 이름 없이). 레인 표엔 맡은 이가 없어 여기서 세운다. 노트가 묵은 레인은 actor_id 가 없어 안 세운다.
  for (const t of laneRows.flatMap((l) => l.tasks).filter((x) => x.column === 'work' && x.actor_id)) {
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category]
    actors.push({ id: t.actor_id, parent_id: lead.id, kind: 'helper', name, hue, eye, prop, dept, team, role, state: 'work',
      task_id: t.id, branch_id: null, account: 'org', tok_per_min: 0, started_at: nowIso, ended_at: null })
  }

  // 막힘: 맡은 태스크가 레인 표에서 ⛔/⏸/🙋 — 지금 판 표의 줄 + 다른 레인 표의 줄을 번호로 부르는 캐릭터(도는 에이전트가 이미 맡았으면 일함이 이긴다)
  // ⏸(시각·쥔님 대기)은 막힘(⛔)이 아니라 대기(U18⑥) — 캐릭터 상태 wait
  const waitOrBlocked = (state) => (/^\s*⏸/u.test(state) ? 'wait' : 'blocked')
  const stuck = [...(l1Fresh ? raw.find((x) => x.id === l1Cur?.id)?.rows ?? [] : []).filter((r) => isStuck(r.state, stateOf) && byId.has(r.id)).map((r) => ({ ...byId.get(r.id), stuckAs: waitOrBlocked(r.state) })),
    ...laneBlocked.map((b) => ({ id: b.id, category: '코드', stuckAs: waitOrBlocked(b.state) }))]

  // 다른 레인의 로그 절(R102②) — 표 꼴 · `- HH:MM` 줄 꼴 다. 줄에 그 레인 표 번호 · 지금 판 번호 · R번호가 있으면 「{제목} 끝/시작/막힘/다시」, 없으면 「{레인} 기록」(원문은 안 싣는다).
  const reqById = new Map(reqTasks.map((t) => [t.id, t]))
  const LOG_ID = new RegExp(`${ID}|\\b[RK]\\d+\\b`, 'g')
  const laneEvents = []
  for (const { lane, ln, byRaw } of laneRows) {
    parseLaneLog(ln.md, year).forEach((l, i) => {
      const ts = kstIso(l.at, year)
      if (!ts || Date.parse(ts) > now.getTime() + 5 * 60e3) return // 앞날 시각 = 날짜 짐작이 틀린 줄 — 버린다
      const t = mentions(`${l.pan} ${l.result}`, LOG_ID).map((x) => byRaw.get(x) ?? byId.get(x) ?? reqById.get(x)).find(Boolean)
      const verb = verbOf(l)
      const text = t ? `${t.title} ${verb}` : `${clean(lane.title) || '운전 레인'} 기록` // 「<기기> 운전」 이름은 레인 칸에만 싣는다
      if (!clean(text)) { onDrop('events', l.at); return }
      laneEvents.push({ id: `e-${hash(`${ln.name}|${l.at}|${i}`)}`, ts, kind: t ? (verb === '다시' ? 'task.reject' : 'task.move') : 'lane.log', subject_type: t ? 'task' : 'lane', subject_id: t ? t.id : lane.id, actor_id: lead.id, text })
    })
  }
  // 모든 레인을 한 줄로 — 최신순(같은 시각이면 지금 판 줄이 앞)
  const allEvents = [...events.reverse(), ...laneEvents].sort((a, b) => b.ts.localeCompare(a.ts))
  for (const t of stuck) {
    if (actors.some((a) => a.task_id === t.id)) continue
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category === '지휘' ? '코드' : t.category]
    actors.push({ id: `a-${t.id}`, parent_id: lead.id, kind: 'helper', name, hue, eye, prop, dept, team, role, state: t.stuckAs,
      task_id: t.id, branch_id: null, account: 'org', tok_per_min: 0, started_at: nowIso, ended_at: null })
  }

  // 이름 = 캐릭터 id 에서 정한 고정 사람 이름(R98) · 직업(job) = 위에서 name 자리에 둔 직업 낱말. 같은 시각엔 겹치지 않게 비켜 간다.
  const taken = new Set()
  for (const a of actors) { a.job ??= a.name; a.name = pickName(a.id, taken); taken.add(a.name) }

  const data = {
    actors, tasks: [...tasks, ...reqTasks, ...laneRows.flatMap((l) => l.tasks)], lanes: [{ id: 'l1', title: '현황판 만들기', state: 'work', actor_id: lead.id }, ...laneRows.map((l) => l.lane)], branches,
    services, modules: appModules(requests, readModules()),
    goals, events: allEvents.slice(0, 50), usage: readUsage(usagePath, nowIso, home, usageAccounts), runs, sprints,
  }
  linkTasks(data.tasks, edges)
  bodyFromLinks(data.tasks)
  dedupeKeys(data, onWarn)
  const dirty = findDirty(data)
  if (dirty) throw new Error(`담백 검사 실패: ${dirty}`)
  return data
}
