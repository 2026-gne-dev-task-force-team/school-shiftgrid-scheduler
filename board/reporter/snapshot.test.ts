import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { build, columnOf, parseRequests, publicGoal, publicTitle, requestTitle, runState, serviceState } from './snapshot.mjs'
// @ts-expect-error — 위와 같음
import { findDirty, isPlain } from './plain.mjs'
import { actorLabel } from '../src/lib/actor.ts'
import type { Actor } from '../src/types.ts'

const MD = `# 레인
## 스프린트 1 — 뼈대 (10:55~)
- **목표**: 쥔님 10:50 *"빨리"* · 화면 뼈대를 세운다(\`board/\`)

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 뼈대 — \`board/\` 입구 | 화면 sonnet | 25 | ✅ \`a80d832\` |
| T-1b | 2층 원통(canvas) | 품질 sonnet 1 | 10 | 🔄 |
| T-1c | D:\\x 경로만 | 메인 | 5 | ⬜ |
| 👀 | 쥔님 검수 | 쥔님 | — | ⬜ |

## 스프린트 2 — 막대 (11:47~)
- **목표**: 막대를 단다

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-2a | 막대 · 서랍 | 코드 opus | 20 | ⛔ 대기 |

## 진행 로그 (맨 위가 최신)
| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
| 11-12 11:00 | T-1a 뼈대 | ✅ 머지 · 맥에서 opus | 비고 |
| 11-12 10:58 | 📌 방향 | 쥔님 메일 a@b.kr | |
`

describe('보고꾼', () => {
  const dropped: string[] = []
  const d = build({ md: MD, now: new Date('2026-11-12T03:00:00Z'), onDrop: (t: string, id: string) => dropped.push(`${t}:${id}`) })

  it('스프린트·태스크 수와 칸 매핑', () => {
    expect(d.sprints.map((s: { id: number }) => s.id)).toEqual([1, 2])
    expect(d.tasks.map((t: { id: string }) => t.id)).toEqual(['T-1a', 'T-1b', 'T-2a']) // T-1c 는 담백 검사로, 👀 는 id 꼴이 아니라 빠짐
    expect(dropped).toEqual(['tasks:T-1c'])
    const by = Object.fromEntries(d.tasks.map((t: { id: string }) => [t.id, t]))
    expect(by['T-1a']).toMatchObject({ title: '뼈대', category: '화면', column: 'done', started_at: '2026-11-12T11:00:00+09:00' })
    expect(by['T-1b']).toMatchObject({ title: '2층 원통', category: '검사', column: 'work', actor_id: 'a-T-1b' })
    expect(by['T-2a']).toMatchObject({ title: '막대', category: '코드', column: 'wait', reason: 'blocked' })
    expect(d.sprints[0]).toMatchObject({ began: '2026-11-12T10:55:00+09:00', ended: null, est_min: 35, goal: '화면 뼈대를 세운다' })
    expect(d.goals[0]).toMatchObject({ sprint: 2, progress: 0 })
    expect(d.actors.map((a: { id: string }) => a.id)).toEqual(['a-lead', 'a-T-1b'])
  })

  it('스프린트 결과 — 태스크가 전부 ✅ 면 통과, 아니면 null(진행 중)', () => {
    const one = (st: string) => build({ md: `## 스프린트 1 — 가 (10:00~)

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 뼈대 | 코드 | 5 | ${st} |
`, now: new Date('2026-11-12T03:00:00Z') }).sprints[0].passed
    expect(one('✅')).toBe(true)
    expect(one('🔄')).toBeNull()
  })

  it('사건은 담백 틀 글만 싣는다', () => {
    expect(d.events.map((e: { text: string }) => e.text)).toEqual(['뼈대 끝', '방향 바뀜'])
    expect(findDirty(d)).toBeNull()
  })

  it('담백 검사가 경로·이메일·모델·기기를 거른다', () => {
    for (const bad of ['D:\\gne', 'board/src', 'a@b.kr', 'opus 판', '업무 PC 에서', 'sk-abc', '[[노트]]']) expect(isPlain(bad)).toBe(false)
    for (const ok of ['task-board 정리', '14:36 끝', '2층 원통']) expect(isPlain(ok)).toBe(true)
    expect(findDirty({ a: [{ b: 'x sonnet' }] })).toBe('.a.0.b')
  })

  it('제목·상태 낱개', () => {
    expect(publicTitle('QA 상 결함 넷(원통 이름표) · 다음')).toBe('QA 상 결함 넷')
    expect(columnOf('✅ 끝').column).toBe('done')
    expect(columnOf('⬜').column).toBe('wait')
  })
})

const lane = (rows: string, log: string, extra = '') => `## 스프린트 1 — 앞 (10:00~)
- **목표**: 앞을 끝낸다

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 앞 일 | 화면 | 5 | ⬜ |

## 스프린트 2 — 지금 (11:00~)
- **목표**: 쥔님 11:00 *"실제 데이터가 먼저다"*

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
${rows}
${extra}
## 진행 로그 (맨 위가 최신)
| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
${log}
T-2c ✅ 로그 아래 덧줄은 안 센다
`
const at = new Date('2026-11-12T05:00:00Z')

describe('보고꾼 — 실자료 다듬기', () => {
  it('흐름: 태스크 줄만 · 📌 는 최근 하나 · 같은 글 연속은 하나', () => {
    const d = build({ now: at, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |\n| T-2b | 나르기 | 코드 | 5 | 🔄 |', [
      '| 11-12 11:50 | 📌 방향 | 새 말 | |', '| 11-12 11:40 | 메인 — 장치 | ✅ 정리 | |', '| 11-12 11:35 | ⏸ 멈춤 | 기다림 | |',
      '| 11-12 11:30 | T-2b 나르기 | 🔄 착수 | |', '| 11-12 11:25 | T-2a ✅ | 다시 적음 | |', '| 11-12 11:20 | T-2a ✅ | 머지 | |',
      '| 11-12 11:10 | 📌 방향 | 옛 말 | |'].join('\n')) })
    expect(d.events.map((e: { text: string }) => e.text)).toEqual(['방향 바뀜', '나르기 시작', '보고꾼 끝'])
  })

  it('캐릭터 이름은 하는 일 · 🔄 없으면 지휘 하나만 쉼 · 지휘 일감은 지휘가', () => {
    const work = build({ now: at, md: lane('| T-2a | 보고꾼 | 코드 opus | 5 | 🔄 |\n| T-2b | 판 | 화면 sonnet | 5 | 🔄 |\n| T-2p | 배포 | 지휘 | 5 | 🔄 |', '') })
    const who = work.actors.map((a: Actor) => [a.id, actorLabel(a, work.actors), a.state])
    expect(who).toEqual([['a-lead', '지휘', 'work'], ['a-T-2a', '자료 나르기', 'work'], ['a-T-2b', '화면 다듬기', 'work']])
    expect(work.actors[0].task_id).toBe('T-2p')
    const rest = build({ now: at, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |', '') })
    expect(rest.actors.map((a: Actor) => [a.id, a.state])).toEqual([['a-lead', 'idle']])
  })

  it('문지기가 적은 도는 에이전트를 캐릭터로 · 끝난 것·낡은 것은 빼고', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const t0 = at.getTime()
    writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: {
      u1: { id: 'a-11111111', task: 'T-2a', started: t0 - 60e3, ended: null },
      u2: { id: 'a-22222222', task: null, started: t0 - 60e3, ended: null },
      u3: { id: 'a-33333333', task: null, started: t0 - 60e3, ended: t0 },
      u4: { id: 'a-44444444', task: null, started: t0 - 4 * 3600e3, ended: null },
      's-x': { id: 'a-55555555', kind: 'session', role: '세션', started: t0 - 60e3, ended: null },
    } }))
    const d = build({ now: at, gatePath, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |', '') })
    expect(d.actors.map((a: Actor) => [a.id, a.name, a.state, a.task_id])).toEqual([
      ['a-lead', '지휘', 'work', null], ['a-T-2a', '자료 나르기', 'work', 'T-2a'], ['a-22222222', '일손', 'work', null], ['a-55555555', '대화 세션', 'work', null]])
    expect(actorLabel(d.actors[3], d.actors)).toBe('대화 세션')
  })

  it('진행률 = 지금 스프린트 표의 ✅ 수 / 전체 — 그 스프린트 안 덧줄만 센다', () => {
    const rows = '| T-2a | 가 | 코드 | 5 | ✅ `abc1234` |\n| T-2b | 나 | 코드 | 5 | ⬜ |\n| T-2c | 다 | 코드 | 5 | ⬜ |\n| T-2d | 라 | 코드 | 5 | 🔄 |'
    expect(build({ now: at, md: lane(rows, '') }).goals[0]).toMatchObject({ sprint: 2, progress: 25 })
    // 표 밖 「T-2b ✅」 덧줄은 센다 · 다른 스프린트 id(T-1a)·로그 아래 덧줄(T-2c)은 안 센다
    const d = build({ now: at, md: lane(rows, '', 'T-2b ✅ `def5678` 늦게 적음\nT-1a ✅ 남의 것\n') })
    expect(d.goals[0]).toMatchObject({ progress: 50 })
    expect(d.tasks.find((t: { id: string }) => t.id === 'T-1a').column).toBe('wait')
  })

  it('제목: 백틱 기호만 걷고, 경로·가지·파일·커밋 꼴만 뺀다 · 인용뿐인 목표는 인용 글', () => {
    expect(publicTitle('`board/` 를 끼우는 물건으로 — `mountBoard(host)`')).toBe('board 를 끼우는 물건으로')
    expect(publicTitle('`mountBoard` 로 얹기')).toBe('mountBoard 로 얹기')
    expect(publicTitle('`board/src/x.ts` 손질')).toBe('손질')
    expect(publicTitle('`1.2v-preview` 가지 정리')).toBe('가지 정리')
    expect(publicTitle('`board-schema.sql` 적용')).toBe('적용')
    expect(publicTitle('`a11fb51` 되돌리기')).toBe('되돌리기')
    expect(publicGoal('앱(`/preview/`)을 `/v2/` 와 갈라서 올린다')).toBe('앱을 v2 와 갈라서 올린다') // 백틱 안 낱말은 남는다(슬래시만 걷음)
    expect(publicGoal('쥔님 14:42 *"요청할건 실제 데이터가 먼저다"*')).toBe('') // 쥔님 말 원문은 공개 판에 안 싣는다
    expect(publicGoal('쥔님 *"D:\\x 에 있는 것 고쳐라"*')).toBe('')
    expect(build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', '') }).sprints[1].goal).toBe('지금')
  })
})

describe('보고꾼 — 서비스·모듈', () => {
  const d = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', '') })

  it('모듈: 시간표 앱(1.2v) 집·방 + 맨 끝 현황판 집 하나', () => {
    const name = (id: string | null) => d.modules.find((m: { id: string }) => m.id === id)?.name
    const under = (p: string) => d.modules.filter((m: { parent: string | null }) => m.parent === p).map((m: { name: string }) => m.name)
    const roots = d.modules.filter((m: { parent: string | null }) => !m.parent).map((m: { id: string }) => m.id)
    expect(roots.at(-1)).toBe('h-board')
    expect(roots).toEqual(expect.arrayContaining(['h-shared', 'h-link', 'h-editor', 'h-sub', 'h-room', 'h-check']))
    expect(name('h-link')).toBe('server-link 서버 연결')
    expect(under('h-link')).toEqual(['P5 로컬 사본', 'P6 칸 PUT 큐', 'P7 412 버튼 둘', 'P8 조작 재생', 'P9 끊김 잠금·연결 상태'])
    expect(under('h-board')).toEqual(expect.arrayContaining(['Overview', 'Branch', 'Lanes', 'Board', 'Blueprint', 'Sprint', 'Inbox', 'Guide', '보고꾼', '나르기', '문지기 훅']))
    expect(d.modules.some((m: { id: string }) => m.id === 'm-screen' || m.id === 'm-data')).toBe(false) // 옛 자기 모듈 뿌리는 없다
    expect(d.modules.find((m: { id: string }) => m.id === 'm-p14')?.note).toBe('P14 · R56 · 설계 ① 통합 구조 16절 판 쪼개기 초안')
  })

  it('모듈 상태: 요청함 ✅ → Built · ◐🔄 → Building · 📥 → Plan', () => {
    const req = (id: string, st: string) => `| ${id} | 11-12 16:40 | *"x"* | **1.2v 구현 ${id} 처방 글자** | 앱 | ${st} |`
    const md = ['| # | 시각 | 원문 | 처방 | 종류 | 상태 |', '|---|---|---|---|---|---|', req('R43', '✅ T-7p1 7bf78e5'), req('R53', '🔄 T-8p2'), req('R56', '◐ T-7p7 앞 절반'), req('R57', '📥 대기')].join('\n')
    const m = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', ''), requestMd: md }).modules
    const st = (id: string) => m.find((x: { id: string }) => x.id === id)
    expect(st('m-p1').state).toBe('built')
    expect(st('m-p1').task_id).toBe('R43')
    expect(st('m-p12').state).toBe('build')
    expect(st('m-p14').state).toBe('build')
    expect(st('m-p5').state).toBe('plan')
    expect(st('m-p0').task_id).toBeNull() // 요청함 번호 없는 판은 계획
    expect(st('h-shared').state).toBe('build') // 집 = 방이 다 지어지면 Built · 하나라도 시작했으면 Building
  })

  it('서비스: 안 넘기면 빈 배열 · 넘기면 그대로', () => {
    expect(d.services).toEqual([])
    const services = [{ id: 's-reporter', name: '보고꾼', state: 'ok', url: '', task_id: null, checked_at: at.toISOString() }]
    expect(build({ now: at, services, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', '') }).services).toEqual(services)
  })

  it('화면 호스팅 판정: 같은 판 ok · 다른 판 build · 실패 down', () => {
    expect(serviceState({ status: 200, build: 'abc1234' }, 'abc1234')).toBe('ok')
    expect(serviceState({ status: 200, build: 'abc12345' }, 'abc1234')).toBe('ok')
    expect(serviceState({ status: 200, build: 'def5678' }, 'abc1234')).toBe('build')
    expect(serviceState(null, 'abc1234')).toBe('down')
    expect(serviceState({ status: 404 }, 'abc1234')).toBe('down')
  })

  it('자료 싣기 판정', () => {
    expect(runState({ status: 'completed', conclusion: 'success' })).toBe('ok')
    expect(runState({ status: 'in_progress', conclusion: null })).toBe('build')
    expect(runState({ status: 'queued', conclusion: null })).toBe('build')
    expect(runState({ status: 'completed', conclusion: 'failure' })).toBe('down')
    expect(runState(undefined)).toBe('down')
  })
})

describe('보고꾼 — 요청함 R 카드', () => {
  const REQ = `| # | 받은 시각 | 쥔님 원문 | 태스크로 풀면 | 종류 | 상태 |
|---|---|---|---|---|---|
| R1 | 11-12 14:23 | *"비밀스러운 쥔님 말"* | 🔴 **탭 이름을 쉽게 바꾼다** — 뒤 설명 | 고침 | → T-2a (8593146e 스프린트 2) |
| R2 | 11-12 14:25 | *"둘째"* | 처음 보는 사람이 읽게 · 뒷말 | 고침 | → T-9z (없는 일) |
| R3 | 11-12 14:26 | *"셋째"* | **아주 아주 긴 제목이 계속 이어져서 마흔 글자를 훌쩍 넘어가 버리는 경우의 처방 문장** | 고침 | 📥 대기 |
| R4 | 11-12 14:27 | *"넷째"* | **끝난 일** | 고침 | ✅ 15:56 배포 |
| R5 | 11-12 14:28 | *"다섯째"* | **하는 중** | 고침 | 🔨 진행 |
| R6 | 11-12 14:29 | *"여섯째"* | **D:\\x 경로 board/src** | 고침 | 📥 대기 |
`
  const d = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ✅ |', ''), requestMd: REQ })
  const r = Object.fromEntries(d.tasks.filter((t: { id: string }) => t.id.startsWith('R')).map((t: { id: string }) => [t.id, t]))

  it('R 줄마다 카드 하나 · 제목은 처방의 굵은 글 · 원문 인용은 안 실린다', () => {
    expect(parseRequests(REQ).map((x: { id: string }) => x.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
    expect(r.R1.title).toBe('탭 이름을 쉽게 바꾼다 (→ T-2a)')
    expect(r.R2.title).toBe('처음 보는 사람이 읽게 (→ T-9z)')
    expect(r.R3.title.length).toBeLessThanOrEqual(40)
    expect(r.R3.title.endsWith('…')).toBe(true)
    expect(r.R6.title).toBe('요청 R6') // 경로가 걸려 비면 번호 제목
    expect(JSON.stringify(d)).not.toMatch(/비밀스러운|둘째|셋째/)
    expect(findDirty(d)).toBeNull()
    expect(requestTitle('**탭**', 'R9')).toBe('탭')
    expect(requestTitle('**탭** 이름을 쉽게 바꾼다. 둘째 문장', 'R9')).toBe('탭 이름을 쉽게 바꾼다') // 굵은 글 8자 미만 → 첫 문장
    expect(requestTitle('**탭** `a/b.ts`. 다음 문장이 대신 쓰인다', 'R9')).toBe('다음 문장이 대신 쓰인다') // 첫 문장이 걸려 비면 다음 문장
  })

  it('상태 매핑: → T 는 그 태스크를 따르고(없으면 진행) · 대기·끝·진행', () => {
    expect(r.R1).toMatchObject({ column: 'done', sprint: 2 }) // 따라간 T-2a 의 스프린트
    expect(r.R2.column).toBe('work')
    expect([r.R3.column, r.R4.column, r.R5.column]).toEqual(['wait', 'done', 'work'])
  })

  it('요청 카드는 스프린트 진행률·태스크 id 와 안 섞인다', () => {
    expect(d.sprints.flatMap((s: { task_ids: string[] }) => s.task_ids)).toEqual(['T-1a', 'T-2a'])
    expect(new Set(d.tasks.map((t: { id: string }) => t.id)).size).toBe(d.tasks.length)
  })
})

describe('보고꾼 — 번호·칸 이름·상태·끝난 카드', () => {
  const md = `## 스프린트 6 — 설계 (15:30~)
| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-2n-6 | 인증 칸 | 설계 sonnet | 5 | ✅ |

## 스프린트 7 — 소화 (15:45~18:00)
| 태스크 | 요청 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|---|
| T-7h1 | R4 | 방 그리기 | 화면 sonnet | 8 | 🔨 |
| T-7a | R1 | 탭 낱말 | 코드 sonnet | 8 | 👀 검수 |
| T-7b | R2 | 막힌 일 | 코드 sonnet | 8 | ⛔ 대기 |
| T-7c | R3 | 끝난 일 | 코드 sonnet | 8 | ✅ |

## 진행 로그 (맨 위가 최신)
| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
| 11-12 15:50 | T-7c ✅ | 머지 | |
| 11-12 15:46 | T-7c | 🔄 착수 | |
`
  it('T-2n-6 · T-7h1 번호, 요청 칸이 낀 표도 칸 이름으로 읽는다', () => {
    const d = build({ now: new Date('2026-11-12T10:00:00Z'), md })
    const t = (id: string) => d.tasks.find((x: { id: string }) => x.id === id)
    expect(t('T-2n-6')).toMatchObject({ sprint: 6, title: '인증 칸', est_min: 5, column: 'done' })
    expect(t('T-7h1')).toMatchObject({ sprint: 7, title: '방 그리기', est_min: 8, team: '화면팀' })
  })
  it('상태 기호 → 칸', () => {
    expect(columnOf('🔨 중')).toMatchObject({ column: 'work' })
    expect(columnOf('👀 검수')).toMatchObject({ column: 'wait', reason: 'checking' })
    expect(columnOf('검수 대기')).toMatchObject({ reason: 'checking' })
    expect(columnOf('⛔ 막힘')).toMatchObject({ reason: 'blocked' })
  })
  it('끝난 카드는 끝 시각에서 경과가 멈춘다', async () => {
    const { minutesIn } = await import('../src/layers/layer4-logic.ts')
    const d = build({ now: new Date('2026-11-12T10:00:00Z'), md })
    const c = d.tasks.find((x: { id: string }) => x.id === 'T-7c')
    expect(minutesIn(c, Date.parse('2026-11-12T10:00:00Z'))).toBe(4)
  })
})

describe('보고꾼 — 레인 폴더 읽기', () => {
  const root = mkdtempSync(join(tmpdir(), 'lanes-'))
  const mk = (dir: string, file: string, body: string) => { mkdirSync(join(root, dir), { recursive: true }); writeFileSync(join(root, dir, file), body) }
  mk('가 레인', '레인 가 레인.md', '**지금**: 🛑 멈춤\n\n| 칸 | 판 | 무엇 | 상태 |\n|---|---|---|---|\n| 1 | 첫판 | 바닥 깔기 · 뒷말 | ✅ |\n| 2 | 둘판 | 벽 세우기 | 🔄 |\n| 3 | 셋판 | a/b/c 경로만 | ⬜ |\n')
  mk('나 레인', '레인 나 레인.md', '| 태스크 | 무엇 | 팀 | est_min | 상태 |\n|---|---|---|---|---|\n| T-1a | 지붕 얹기 | 코드 | 5 | ⬜ |\n')
  mk('닫힘', '레인 닫힘.md', '| 판 | 무엇 | 상태 |\n|---|---|---|\n| x | 닫힌 일 | ✅ |\n')
  mk('요청함', '레인 요청함.md', '| 판 | 무엇 | 상태 |\n|---|---|---|\n| x | 요청 일 | ✅ |\n')
  mk('표 없음', '레인 표 없음.md', '글만')
  const warns: string[] = []
  const d = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ✅ |', ''), laneRoot: root, onWarn: (n: string) => warns.push(n) })
  const mine = (title: string) => d.tasks.filter((t: { lane_id: string }) => t.lane_id === d.lanes.find((l: { title: string }) => l.title === title)?.id)

  it('lane 은 지금 판 + 폴더 둘(닫힘·요청함 제외) · 태스크 수 · 경고', () => {
    expect(d.lanes.map((l: { title: string }) => l.title)).toEqual(['현황판 만들기', '가 레인', '나 레인', '표 없음'])
    expect(mine('가 레인').length).toBe(2) // 경로만 있는 줄은 담백 검사로 빠진다
    expect(mine('나 레인').map((t: { id: string }) => t.id)).toHaveLength(1)
    expect(d.tasks.some((t: { title: string }) => /닫힌|요청 일/.test(t.title))).toBe(false)
    expect(warns).toEqual(['표 없음'])
    expect(d.lanes[1].state).toBe('work') // 🔄 가 있으면 멈춤 문구보다 우선
    expect(d.sprints.flatMap((s: { task_ids: string[] }) => s.task_ids)).toEqual(['T-1a', 'T-2a']) // 스프린트엔 안 섞인다
    expect(findDirty(d)).toBeNull()
  })

  it('기기 낱말을 걷으면 이름이 겹치는 레인은 번호로 구별한다', () => {
    const r2 = mkdtempSync(join(tmpdir(), 'lanes2-'))
    for (const n of ['검수', '맥 검수']) { mkdirSync(join(r2, n)); writeFileSync(join(r2, n, `레인 ${n}.md`), '| 판 | 무엇 | 상태 |\n|---|---|---|\n| 1 | 일 | ⬜ |\n') }
    const t = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ✅ |', ''), laneRoot: r2 }).lanes.map((l: { title: string }) => l.title)
    expect(t).toEqual(['현황판 만들기', '검수', '검수 2'])
  })

  it('다른 레인의 🔄 태스크에도 번호로 부르는 캐릭터가 붙는다', () => {
    const t = mine('가 레인').find((x: { column: string }) => x.column === 'work')
    const a = d.actors.find((x: { id: string }) => x.id === t.actor_id)
    expect(a).toMatchObject({ state: 'work', task_id: t.id, branch_id: null })
    expect(mine('가 레인').filter((x: { actor_id: string | null }) => x.actor_id)).toHaveLength(1) // ⬜ 에는 안 붙는다
  })
})
