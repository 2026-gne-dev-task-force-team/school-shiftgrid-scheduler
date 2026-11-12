// 보고꾼 — 레인 노트 · git 가지 · 사용량 파일 → 공개해도 되는 스냅숏(BoardData 꼴, types.ts).
// 네트워크 없음. 원천은 읽기만. 자유 글은 넣지 않고 담백 틀로 조립한다.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { clean, findDirty, isPlain } from './plain.mjs'

const TID = /T-\d+[a-z]+/g

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
  const t = w.trim().replace(/^([A-Za-z0-9_.-]+)\/$/, '$1')
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
/** 목표 줄 → 공개 부분. 남는 한글이 거의 없으면(인용뿐) 인용 안 글을 담백 검사해 쓴다 — 걸리면 빈 값. */
export function publicGoal(goal) {
  const t = tidy(strip(goal))
  if ((t.match(/[가-힣]/g) ?? []).length >= 4) return clean(t.slice(0, 200))
  const quoted = tidy([...goal.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(' · '))
  return (quoted.match(/[가-힣]/g) ?? []).length < 4 ? '' : clean(quoted.slice(0, 200))
}

const TEAM = [[/메인|지휘/, '지휘'], [/화면/, '화면'], [/품질|검사|시험|맨눈/, '검사'], [/설계/, '설계']]
export const categoryOf = (team) => TEAM.find(([r]) => r.test(team))?.[1] ?? '코드'
export function columnOf(state) {
  if (/^\s*✅/.test(state)) return { column: 'done', reason: 'done' }
  if (/^\s*🔄/.test(state)) return { column: 'work', reason: 'new' }
  if (/^\s*⛔/.test(state)) return { column: 'wait', reason: 'blocked', block_kind: 'outside' }
  return { column: 'wait', reason: 'new' }
}

/** 레인 노트 → 스프린트·태스크 줄(원문 칸) · 진행 로그 줄. */
export function parseLane(md) {
  const sprints = []
  const log = []
  let cur = null
  let inLog = false
  for (const line of md.split(/\r?\n/)) {
    const h = /^## (.*)$/.exec(line)
    if (h) {
      const s = /^스프린트 (\d+) — (.*?)\s*\((\d{1,2}:\d{2})~?\)\s*$/.exec(h[1])
      cur = s ? { id: +s[1], title: s[2], began: s[3], goal: '', rows: [] } : null
      if (cur) sprints.push(cur)
      inLog = h[1].startsWith('진행 로그')
      continue
    }
    if (cur) {
      const g = /^- \*\*목표\*\*:\s*(.*)$/.exec(line)
      if (g) cur.goal = g[1]
      const c = line.startsWith('|') ? cells(line) : null
      if (c && c.length >= 5 && /^T-\d+[a-z]+$/.test(c[0])) cur.rows.push({ id: c[0], what: c[1], team: c[2], est: c[3], state: c[4] })
      const late = /^(T-\d+[a-z]+) ✅/.exec(line) // 표 밖 「T-5c ✅ …」 덧줄
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

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf-8'))
// 분류 → 캐릭터(이름·팀·역할 = actor.ts ROLES 낱말). 코드 판은 지금 자료·보고를 만드니 「자료 나르기」. 지휘 분류는 따로 캐릭터를 안 만들고 지휘가 맡는다.
const ACTOR = { 화면: ['화면 다듬기', '화면팀', '화면', 'make', 175, 'teal', 'brush'], 코드: ['자료 나르기', '자료팀', '자료', 'make', 160, 'teal', 'box'],
  설계: ['설계', '설계팀', '설계', 'make', 190, 'teal', 'ruler'], 검사: ['시험', '시험팀', '시험', 'qa', 275, 'violet', 'check'], 지휘: ['지휘', '지휘', '지휘', 'hq', 40, 'amber', 'flag'] }
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)

/** 원천 → BoardData. onDrop(표, 까닭) 은 담백 검사로 버린 줄마다 부른다. 끝에 전체를 한 번 더 훑어 걸리면 예외. */
export function build({ lanePath, repoDir, usagePath, now = new Date(), md, onDrop = () => {} }) {
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
      est_min: mine.reduce((a, t) => a + t.est_min, 0), actual_min: 0, review: '', passed: null, missed: '', next: '' })
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
    branches.push({ id: `b-${t.id}`, title: t.title, trunk: false, ahead: b.ahead, state: b.merged ? 'merged' : 'live',
      actor_id: t.actor_id, task_id: t.id, updated_at: b.at })
  }

  const working = tasks.filter((t) => t.column === 'work')
  const leadTask = working.find((t) => t.category === '지휘')
  const lead = { id: 'a-lead', parent_id: null, kind: 'lead', name: '지휘', hue: 40, eye: 'amber', prop: 'flag', dept: 'hq', team: '지휘', role: '지휘',
    state: working.length ? 'work' : 'idle', task_id: leadTask?.id ?? null, branch_id: null, account: 'org', tok_per_min: 0, started_at: sprints[0]?.began ?? nowIso, ended_at: null }
  const actors = [lead, ...working.filter((t) => t.category !== '지휘').map((t) => {
    const [name, team, role, dept, hue, eye, prop] = ACTOR[t.category]
    return { id: t.actor_id, parent_id: lead.id, kind: 'helper', name, hue, eye, prop, dept, team, role, state: 'work', task_id: t.id,
      branch_id: branches.some((b) => b.id === `b-${t.id}`) ? `b-${t.id}` : null, account: 'org', tok_per_min: 0, started_at: t.started_at ?? nowIso, ended_at: null }
  })]

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

  // shortcut: 서비스·모듈은 아직 실원천이 없어 fixtures 를 싣는다(가짜 일감 연결은 끊음) — 원천이 생기면 바꾼다
  const data = {
    actors, tasks, lanes: [{ id: 'l1', title: '현황판 만들기', state: 'work', actor_id: lead.id }], branches,
    services: fixture('services').map((s) => ({ ...s, task_id: null, checked_at: nowIso })),
    modules: fixture('modules').map((m) => ({ ...m, task_id: null })),
    goals, events: events.reverse().slice(0, 50), usage: readUsage(usagePath, nowIso), runs, sprints,
  }
  const dirty = findDirty(data)
  if (dirty) throw new Error(`담백 검사 실패: ${dirty}`)
  return data
}
