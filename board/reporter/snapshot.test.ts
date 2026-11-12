import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { appOfLane, build, splitDetail, linkTasks, dedupeKeys, columnOf, parseRequests, publicGoal, publicTitle, requestTitle, serviceState, sinkService } from './snapshot.mjs'
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
    expect(d.actors.map((a: { id: string }) => a.id)).toEqual(['a-lead', 'a-T-1b', 'a-T-2a']) // ⛔ 인 T-2a 는 막힘 캐릭터
    expect(d.actors.find((a: { id: string }) => a.id === 'a-T-2a')).toMatchObject({ state: 'blocked', task_id: 'T-2a' })
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
    expect(who).toEqual([['a-lead', '지휘 T-2p', 'work'], ['a-T-2a', '자료팀 T-2a', 'work'], ['a-T-2b', '화면팀 T-2b', 'work']])
    expect(work.actors[0].task_id).toBe('T-2p')
    const rest = build({ now: at, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |', '') })
    expect(rest.actors.map((a: Actor) => [a.id, a.state])).toEqual([['a-lead', 'idle']])
  })

  it('문지기가 적은 도는 에이전트를 캐릭터로 · 끝난 것·낡은 것·✅ 일감·닫힌 세션은 work 가 아니다', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const t0 = at.getTime()
    writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: {
      u1: { id: 'a-11111111', task: 'T-2a', started: t0 - 60e3, ended: null }, // 도는 중이지만 레인 표에서 ✅
      u2: { id: 'a-22222222', task: null, started: t0 - 60e3, ended: null }, // 도는 에이전트
      u3: { id: 'a-33333333', task: null, started: t0 - 120e3, ended: t0 }, // 끝남
      u4: { id: 'a-44444444', task: null, started: t0 - 2.5 * 3600e3, ended: null }, // 2시간 넘게 안 끝남 = 세션째 죽음
      u5: { id: 'a-66666666', task: null, started: t0 - 21 * 3600e3, ended: t0 - 20 * 3600e3 }, // 어제 끝남 = 싣지 않음
      's-x': { id: 'a-55555555', kind: 'session', role: '세션', started: t0 - 60e3, ended: null }, // 갓 말 건 세션
      's-y': { id: 'a-77777777', kind: 'session', role: '세션', started: t0 - 120e3, idle: t0 - 60e3, ended: null }, // 턴이 끝난 세션
      's-z': { id: 'a-88888888', kind: 'session', role: '세션', started: t0 - 30 * 60e3, ended: null }, // 20분 조용
      's-w': { id: 'a-99999999', kind: 'session', role: '세션', started: t0 - 300e3, ended: t0 - 60e3 }, // 닫힌 세션
    } }))
    const d = build({ now: at, gatePath, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |', '') })
    const row = (a: Actor) => [a.id, a.name, a.state, a.task_id]
    expect(d.actors.map(row)).toEqual([
      ['a-lead', '지휘', 'work', null], ['a-T-2a', '자료 나르기', 'off', 'T-2a'], ['a-22222222', '일손', 'work', null], ['a-33333333', '일손', 'off', null],
      ['a-44444444', '일손', 'off', null], ['a-55555555', '대화 세션', 'work', null], ['a-77777777', '대화 세션', 'idle', null],
      ['a-88888888', '대화 세션', 'off', null], ['a-99999999', '대화 세션', 'off', null]])
    expect(actorLabel(d.actors.find((a: Actor) => a.id === 'a-55555555'), d.actors)).toBe('대화 1') // 같은 이름표가 여럿이면 번호
  })

  it('상태 다섯: 일함 · 쉼 · 퇴근(마지막 활동 시각 실음) · 막힘 · 쉼이 오래가면 퇴근', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const t0 = at.getTime() // 14:00 KST
    writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: {
      a: { id: 'a-aaaaaaaa', kind: 'session', started: t0 - 60e3, ended: null }, // 일함
      b: { id: 'a-bbbbbbbb', kind: 'session', started: t0 - 600e3, idle: t0 - 300e3, ended: null }, // 쉼(5분)
      c: { id: 'a-cccccccc', kind: 'session', started: t0 - 3 * 3600e3, idle: t0 - 40 * 60e3, ended: null }, // 쉼 40분 = 퇴근
      d: { id: 'a-dddddddd', kind: 'session', started: t0 - 3600e3, ended: t0 - 1800e3 }, // 끝남 = 퇴근
    } }))
    const d = build({ now: at, gatePath, md: lane('| T-2a | 막힌 일 | 코드 | 5 | ⏸ 기다림 |\n| T-2b | 물음 | 화면 | 5 | 🙋 |', '') })
    const st = Object.fromEntries(d.actors.map((a: Actor) => [a.id, a.state]))
    expect(st).toMatchObject({ 'a-aaaaaaaa': 'work', 'a-bbbbbbbb': 'idle', 'a-cccccccc': 'off', 'a-dddddddd': 'off', 'a-T-2a': 'blocked', 'a-T-2b': 'blocked' })
    expect(d.actors.find((a: Actor) => a.id === 'a-dddddddd')?.ended_at).toBe(new Date(t0 - 1800e3).toISOString())
    expect(d.actors.find((a: Actor) => a.id === 'a-cccccccc')?.ended_at).toBe(new Date(t0 - 40 * 60e3 + 20 * 60e3).toISOString())
  })

  it('퇴근은 그날 자정(KST)까지 싣고 다음 날 뺀다', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const ended = new Date('2026-11-12T14:30:00Z').getTime() // 11-12 23:30 KST
    writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: { a: { id: 'a-aaaaaaaa', kind: 'session', started: ended - 600e3, ended } } }))
    const ids = (now: string) => build({ now: new Date(now), gatePath, md: lane('', '') }).actors.map((a: Actor) => a.id)
    expect(ids('2026-11-12T14:50:00Z')).toContain('a-aaaaaaaa') // 23:50 KST — 같은 날
    expect(ids('2026-11-12T15:10:00Z')).not.toContain('a-aaaaaaaa') // 00:10 KST — 다음 날
    expect(ids('2026-11-12T20:00:00Z')).not.toContain('a-aaaaaaaa')
  })

  it('에이전트 하나 띄웠다 끝낸 뒤 스냅샷에서 work 아님', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const t0 = at.getTime()
    const put = (a: object) => writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: { u1: a } }))
    put({ id: 'a-11111111', task: null, started: t0 - 60e3, ended: null })
    expect(build({ now: at, gatePath, md: lane('', '') }).actors.filter((a: Actor) => a.state === 'work').map((a: Actor) => a.id)).toEqual(['a-lead', 'a-11111111'])
    put({ id: 'a-11111111', task: null, started: t0 - 60e3, ended: t0 })
    expect(build({ now: at, gatePath, md: lane('', '') }).actors.filter((a: Actor) => a.state === 'work')).toEqual([])
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
    expect(under('h-board')).toEqual(expect.arrayContaining(['Overview', 'Branch', 'Lanes', 'Board', 'Blueprint', 'Sprint', 'Inbox', 'Guide', '보고꾼', '직접 싣기', '문지기 훅']))
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

  it('자료 싣기 판정: 직전 싣기 기록으로 성공·실패·자격 없음·멈춤·기록 없음', () => {
    const now = new Date('2026-11-12T05:00:00Z')
    const at = (min: number) => new Date(now.getTime() - min * 60e3).toISOString()
    expect(sinkService({ at: at(1), result: 'ok', status: 200 }, now)).toMatchObject({ state: 'ok', name: '자료 싣기 · 성공 · 응답 200', checked_at: at(1) })
    expect(sinkService({ at: at(1), result: 'fail', status: 400 }, now)).toMatchObject({ state: 'down', name: '자료 싣기 · 실패 · 응답 400' })
    expect(sinkService({ at: at(1), result: 'fail', status: null }, now)).toMatchObject({ state: 'down', name: '자료 싣기 · 실패' })
    expect(sinkService({ at: at(1), result: 'nocred', status: null }, now)).toMatchObject({ state: 'plan', name: '자료 싣기 · 자격 없음' })
    expect(sinkService({ at: at(45), result: 'ok', status: 200 }, now)).toMatchObject({ state: 'down', name: '자료 싣기 · 멈춤 · 응답 200' })
    expect(sinkService(null, now)).toMatchObject({ state: 'plan', name: '자료 싣기 · 기록 없음' })
    expect(sinkService({ at: 'x', result: 'ok' }, now).state).toBe('plan')
  })

  it('자료 싣기 칸은 담백 검사를 통과한다(경로·값 없음)', () => {
    const now = new Date('2026-11-12T05:00:00Z')
    for (const rec of [{ at: now.toISOString(), result: 'ok', status: 200 }, { at: now.toISOString(), result: 'nocred', status: null }, null]) {
      expect(findDirty(sinkService(rec, now))).toBeNull()
    }
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

  it('R 줄마다 카드 하나 · 제목은 처방의 굵은 글 · 원문은 ask 칸으로 따로 실린다', () => {
    expect(parseRequests(REQ).map((x: { id: string }) => x.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
    expect(r.R1.title).toBe('탭 이름을 쉽게 바꾼다 (→ T-2a)')
    expect(r.R2.title).toBe('처음 보는 사람이 읽게 (→ T-9z)')
    expect(r.R3.title.length).toBeLessThanOrEqual(40)
    expect(r.R3.title.endsWith('…')).toBe(true)
    expect(r.R6.title).toBe('요청 R6') // 경로가 걸려 비면 번호 제목
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
  mk('표만 있음', '레인 표만 있음.md', '| 판 | 무엇 | 상태 |\n|---|---|---|\n| 구현 | 설명 줄 | ⬜ |\n') // 번호 칸이 없는 표 — 못 읽음(경고)
  const warns: string[] = []
  const infos: string[] = []
  const d = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ✅ |', ''), laneRoot: root, onWarn: (n: string) => warns.push(n), onInfo: (n: string) => infos.push(n) })
  const mine = (title: string) => d.tasks.filter((t: { lane_id: string }) => t.lane_id === d.lanes.find((l: { title: string }) => l.title === title)?.id)

  it('lane 은 지금 판 + 폴더 둘(닫힘·요청함 제외) · 태스크 수 · 경고', () => {
    expect(d.lanes.map((l: { title: string }) => l.title)).toEqual(['현황판 만들기', '가 레인', '나 레인', '표 없음', '표만 있음'])
    expect(mine('가 레인').length).toBe(2) // 경로만 있는 줄은 담백 검사로 빠진다
    expect(mine('나 레인').map((t: { id: string }) => t.id)).toHaveLength(1)
    expect(d.tasks.some((t: { title: string }) => /닫힌|요청 일/.test(t.title))).toBe(false)
    expect(infos).toEqual(['표 없음']) // 표 자체가 없으면 정보일 뿐
    expect(warns).toEqual(['표만 있음']) // 표는 있는데 못 읽으면 경고
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

describe('판 구분 app 칸 (T-9g)', () => {
  it('레인 이름에 적힌 판 낱말만 읽고, 아니면 1.2v', () => {
    expect(appOfLane('시간표 v2')).toBe('v2')
    expect(appOfLane('시간표 V1 맥')).toBe('v1')
    expect(appOfLane('1.2v 구현')).toBe('1.2v')
    expect(appOfLane('코드 맥')).toBe('1.2v')
    expect(appOfLane('rev2x')).toBe('1.2v') // 낱말 안쪽은 안 읽는다
    expect(appOfLane(undefined)).toBe('1.2v')
  })
})

describe('기본키 중복 막이 (T-9j U5)', () => {
  it('레인 표에 같은 id 두 줄 → id 유일 · 경고 1 · 행 수 보존', () => {
    const md = MD.replace('| T-2a | 막대 · 서랍', '| T-1a | 막대 · 서랍')
    const warns: string[] = []
    const base = build({ md: MD, now: new Date('2026-11-12T03:00:00Z') })
    const d = build({ md, now: new Date('2026-11-12T03:00:00Z'), onWarn: (t: string, w: string) => warns.push(`${t}:${w}`) })
    const ids = d.tasks.map((t: { id: string }) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('T-1a~2')
    expect(d.tasks.length).toBe(base.tasks.length)
    expect(warns.filter((w) => w.startsWith('tasks:'))).toHaveLength(1)
    expect(d.sprints[1].task_ids).toEqual(['T-1a~2'])
  })
  it('dedupeKeys — 표마다 각자 키로 처리', () => {
    const warns: string[] = []
    const d = dedupeKeys({ tasks: [{ id: 'x' }, { id: 'x' }, { id: 'x~2' }], usage: [{ account: 'a', ts: 1 }, { account: 'a', ts: 1 }, { account: 'b', ts: 1 }], sprints: [{ id: 1 }, { id: 1 }], lanes: [{ id: 'l' }] }, (t: string, w: string) => warns.push(t + w))
    expect(d.tasks.map((t: { id: string }) => t.id)).toEqual(['x', 'x~3', 'x~2'])
    expect(d.usage).toHaveLength(2)
    expect(d.sprints).toHaveLength(1)
    expect(d.lanes).toHaveLength(1)
    expect(warns).toHaveLength(3)
  })
})

describe('T-9u 읽기 고침', () => {
  const lane8 = (head: string) => `## 스프린트 7 — 앞 (10:00~11:00)\n\n| 태스크 | 무엇 | 팀 | est_min | 상태 |\n|---|---|---|---|---|\n| T-7a | 가 | 코드 | 5 | ✅ |\n\n## ${head}\n\n| 태스크 | 무엇 | 팀 | est_min | 상태 |\n|---|---|---|---|---|\n| T-8a | 나 | 코드 | 5 | 🔄 |\n`
  it('U9① 스프린트 머리 괄호 꼬리를 받는다 · 못 읽으면 경고', () => {
    const d = build({ now: at, md: lane8('스프린트 8 — 다음 (18:26~ 맥)') })
    expect(d.sprints.map((s: { id: number }) => s.id)).toEqual([7, 8])
    expect(d.goals[0].sprint).toBe(8)
    const w: string[] = []
    build({ now: at, md: lane8('스프린트 9 — 깨진 머리'), onWarn: (t: string) => w.push(t) })
    expect(w).toEqual(['스프린트'])
  })
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  const put = (rel: string, body: unknown, ageMin: number) => { const f = join(home, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(body)); const t = new Date(at.getTime() - ageMin * 60e3); utimesSync(f, t, t) }
  const lim = (p: number, updated?: number) => ({ ...(updated ? { updated } : {}), limits: { five_hour: { pct: p, resets_at: 1794500000 }, seven_day: { pct: 1, resets_at: 1794600000 } } })
  it('U9③ 한도는 .claude-b 처럼 mtime 최신 형제를 고르고, 시각은 파일 잰 시각 · 낡으면 stale', () => {
    put('.claude/rate-limits.json', lim(10), 300)
    put('.claude-b/rate-limits.json', lim(77, at.getTime() - 5 * 60e3), 5)
    const u = build({ now: at, md: lane('', ''), home, usagePath: join(home, '.claude/rate-limits.json') }).usage[0]
    expect(u).toMatchObject({ pct_5h: 77, ts: new Date(at.getTime() - 5 * 60e3).toISOString() })
    expect(u.stale).toBeUndefined()
    put('.claude-b/rate-limits.json', lim(77, at.getTime() - 60 * 60e3), 60)
    expect(build({ now: at, md: lane('', ''), home, usagePath: join(home, '.claude/rate-limits.json') }).usage[0].stale).toBe(true)
  })
  const act = (id: string, kind?: string) => ({ id, ...(kind ? { kind, role: '세션' } : { lead: 'a-00000000', task: 'T-2a' }), started: at.getTime() - 60e3, ended: null })
  it('U9③ 문지기는 프로필 폴더들을 합친다', () => {
    put('.claude/board/actors.json', { actors: { x: act('a-11111111', 'session') } }, 5)
    put('.claude-b/board/actors.json', { actors: { y: act('a-22222222', 'session') } }, 1)
    const d = build({ now: at, md: lane('', ''), home, gatePath: join(home, '.claude/board/actors.json') })
    expect(d.actors.map((a: Actor) => a.id)).toEqual(expect.arrayContaining(['a-11111111', 'a-22222222']))
  })
  it('U8③ 지휘는 살아 있는 세션이 없으면 퇴근(off), 문지기를 못 읽으면 쉼', () => {
    const lead = (o: object) => build({ now: at, md: lane('', ''), ...o }).actors.find((a: Actor) => a.id === 'a-lead')
    expect(lead({}).state).toBe('idle')
    const h2 = mkdtempSync(join(tmpdir(), 'home2-'))
    mkdirSync(join(h2, '.claude/board'), { recursive: true })
    writeFileSync(join(h2, '.claude/board/actors.json'), JSON.stringify({ actors: { x: { ...act('a-33333333', 'session'), ended: at.getTime() - 1000 } } }))
    expect(lead({ home: h2, gatePath: join(h2, '.claude/board/actors.json') }).state).toBe('off')
  })
  it('T-9x U8 기록 파일 신호: 낱말 없는 이어 말하기 세션은 일함 · 죽은 에이전트는 퇴근 · 3시간 넘은 퇴근은 안 싣는다', () => {
    const t0 = at.getTime()
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    writeFileSync(gatePath, JSON.stringify({ actors: {
      s1: { id: 'a-aaaaaaaa', kind: 'session', started: t0 - 3600e3, ended: null }, // 한 시간 전 낱말 → 문지기만으론 퇴근
      s2: { id: 'a-bbbbbbbb', kind: 'session', started: t0 - 3600e3, idle: t0 - 1800e3, ended: t0 - 1700e3 }, // 닫혔다가 다시 열림
      s3: { id: 'a-cccccccc', kind: 'session', started: t0 - 4 * 3600e3, ended: t0 - 3.5 * 3600e3 }, // 같은 날이지만 3시간 넘은 퇴근
      u1: { id: 'a-dddddddd', task: null, started: t0 - 1800e3, ended: null }, // 도는 척하지만 기록이 조용
      u2: { id: 'a-eeeeeeee', task: null, started: t0 - 1800e3, ended: null }, // 기록이 방금까지 쓰임
    } }))
    const st = (activity: object) => Object.fromEntries(build({ now: at, gatePath, md: lane('', ''), activity }).actors.map((a: Actor) => [a.id, a.state]))
    expect(st({})).toMatchObject({ 'a-aaaaaaaa': 'off', 'a-bbbbbbbb': 'off', 'a-dddddddd': 'work' })
    expect(st({})).not.toHaveProperty('a-cccccccc')
    const act = { 'a-aaaaaaaa': t0 - 60e3, 'a-bbbbbbbb': t0 - 60e3, 'a-dddddddd': t0 - 25 * 60e3, 'a-eeeeeeee': t0 - 10e3 }
    expect(st(act)).toMatchObject({ 'a-aaaaaaaa': 'work', 'a-bbbbbbbb': 'work', 'a-dddddddd': 'off', 'a-eeeeeeee': 'work' })
    expect(st({ 'a-aaaaaaaa': t0 - 40 * 60e3 })['a-aaaaaaaa']).toBe('off')
  })
  it('U8② 번호 칸 없는 판 표 · 「11~」 자리표시는 일감이 아니다', async () => {
    // @ts-expect-error — mjs
    const { parseLaneNote } = await import('./snapshot.mjs')
    const md = '| 판 | 무엇 | 상태 |\n|---|---|---|\n| 구현 | 설명 | ⬜ |\n\n| 칸 | 판 | 무엇 | 상태 |\n|---|---|---|---|\n| 3 | 짓기 | 가 | ✅ |\n| 11~ | 구현 | 나 | ⛔ |\n'
    expect(parseLaneNote(md).rows.map((r: { id: string }) => r.id)).toEqual(['짓기'])
  })
  it('U9② 레인 표에 일감이 없는 가지도 싣는다', () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'pipe' })
    g('init', '-q', '-b', '1.2v-preview'); g('commit', '-q', '--allow-empty', '-m', 'x'); g('branch', '1.2v-preview-zz')
    const ids = build({ now: at, md: lane('', ''), repoDir: repo }).branches.map((b: { id: string }) => b.id)
    expect(ids).toEqual(['b-trunk', 'b-zz'])
  })
  it('R14 줄기 행에 커밋·부모 관계를 싣는다(짧은 해시 · 가지 이름표)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'pipe' })
    g('init', '-q', '-b', '1.2v-preview'); g('commit', '-q', '--allow-empty', '-m', 'first')
    g('checkout', '-q', '-b', '1.2v-preview-zz'); g('commit', '-q', '--allow-empty', '-m', 'on branch')
    const tr = build({ now: at, md: lane('', ''), repoDir: repo }).branches.find((b: { trunk: boolean }) => b.trunk)
    expect(tr.graph).toHaveLength(2)
    expect(tr.graph[0]).toMatchObject({ subject: 'on branch', refs: [{ name: '1.2v-preview-zz', branch_id: 'b-zz' }] })
    expect(tr.graph[0].parents).toEqual([tr.graph[1].sha])
    expect(tr.graph[0].sha).toHaveLength(8)
  })
})

describe('감독관 캐릭터 (T-9zb)', () => {
  const NOW = new Date('2026-11-12T13:30:00Z')
  const note = '---\ntitle: 레인 감독\n---\n\n## 요약\n\n⚠️ 1 · ❌ 2 · 순찰 시각 22:30\n\n## ❌\n\n없음\n'
  const world = (ageMin: number | null) => {
    const root = mkdtempSync(join(tmpdir(), 'sup-'))
    if (ageMin != null) {
      mkdirSync(join(root, '감독'))
      const f = join(root, '감독', '레인 감독.md')
      writeFileSync(f, note)
      const t = new Date(NOW.getTime() - ageMin * 60e3)
      utimesSync(f, t, t)
    }
    return build({ now: NOW, md: lane('| T-2a | 가 | 코드 | 5 | ✅ |', ''), laneRoot: root }).actors.find((a: { role: string }) => a.role === '감독')
  }
  it('노트 mtime 10분 안이면 일함 · 한 줄은 요약 줄', () => {
    expect(world(3)).toMatchObject({ name: '감독관', role: '감독', state: 'work', team: '⚠️ 1 · ❌ 2 · 순찰 시각 22:30' })
  })
  it('오래되면 쉼', () => expect(world(30)).toMatchObject({ state: 'idle' }))
  it('노트가 없으면 안 싣는다', () => expect(world(null)).toBeUndefined())
})

describe('보고꾼 — 카드 상세 칸(R71)', () => {
  const long = '긴 설명 문장이 계속 이어진다. '.repeat(60) // 약 900자
  const REQ = `| # | 받은 시각 | 쥔님 원문 | 태스크로 풀면 | 종류 | 상태 |
|---|---|---|---|---|---|
| R1 | 11-12 14:23 | *"카드가 자세하지 않다. 홍길동 선생님이 말했다. 경로는 D:\\x\\y 에서 봤다. 내용을 알고 싶다"* | **상세를 만든다** ${long} 완료 정의: 상세에 원문이 보인다. 빈 칸은 숨는다 | 고침 | → T-2a |
| R2 | 11-12 14:30 | *"둘째"* | 다른 일 R1 과 닮았다 | 앱 | 📥 대기 |
`
  const d = build({ now: new Date('2026-11-12T08:00:00Z'), md: lane('| T-2a | 상세 시트 만들기 | 코드 | 5 | 🔄 |', '| 11-12 14:40 | T-2a 시작 | | |'), requestMd: REQ })
  const t = (id: string) => d.tasks.find((x: { id: string }) => x.id === id)

  it('500자 넘는 칸이 안 잘린다 · 완료 조건은 따로', () => {
    expect(t('R1').body.length).toBeGreaterThan(500)
    expect(t('R1').body.endsWith('이어진다.')).toBe(true)
    expect(t('R1').done).toBe('상세에 원문이 보인다.\n빈 칸은 숨는다')
    expect(t('R1').body).not.toMatch(/완료 정의/)
    expect(splitDetail('그냥 설명')).toEqual({ body: '그냥 설명' })
    expect(splitDetail('')).toEqual({})
  })

  it('원래 요청 · 받은 시각 · 이력', () => {
    expect(t('R1').askedAt).toBe('2026-11-12T14:23:00+09:00')
    expect(t('R1').kind).toBe('bug')
    expect(t('R1').history.map((e: { text: string }) => e.text)).toEqual(['접수', '착수']) // 접수 + 이어진 T 의 로그
    expect(t('T-2a').history.map((e: { text: string }) => e.text)).toEqual(['착수'])
  })

  it('실명·경로가 든 문장은 걸러지고 나머지는 남는다', () => {
    expect(t('R1').ask).toBe('카드가 자세하지 않다.\n내용을 알고 싶다')
    expect(JSON.stringify(d)).not.toMatch(/홍길동|D:/)
    expect(findDirty(d)).toBeNull()
  })

  it('설정 실명 목록(redactNames)은 꼴 규칙에 안 걸리는 이름도 거른다 · 칸이 없으면 꼴 규칙만', () => {
    const md = REQ.replace('경로는', '가나다가 말했다. 경로는')
    const ask = (names?: string[]) => build({ now: new Date('2026-11-12T08:00:00Z'), md: lane('| T-2a | 가 | 코드 | 5 | 🔄 |', ''), requestMd: md, ...(names ? { redactNames: names } : {}) }).tasks.find((x: { id: string }) => x.id === 'R1').ask
    expect(ask()).toContain('가나다가 말했다.')
    expect(ask(['가나다'])).toBe('카드가 자세하지 않다.\n내용을 알고 싶다')
    expect(ask()).toContain('가나다가 말했다.') // 다음 build 에 앞 설정이 새지 않는다
  })

  it('R↔T 연결이 양쪽에서 보인다(R↔R 도)', () => {
    expect(t('R1').links.sort()).toEqual(['R2', 'T-2a'])
    expect(t('T-2a').links).toEqual(['R1'])
    expect(t('R2').links).toEqual(['R1'])
    const x = linkTasks([{ id: 'R9' }, { id: 'T-1' }], [['R9', 'T-1'], ['R9', 'T-없음'], ['R9', 'R9']])
    expect(x).toEqual([{ id: 'R9', links: ['T-1'] }, { id: 'T-1', links: ['R9'] }])
  })
})

describe('태스크 꼬리표 target (T-9zf R73)', () => {
  const REQ = `| # | 받은 시각 | 쥔님 원문 | 태스크로 풀면 | 종류 | 상태 |
|---|---|---|---|---|---|
| R1 | 11-12 14:23 | *"가"* | **보고꾼이 카드를 읽게 한다** | 🐞 (장치) | 📥 대기 |
| R2 | 11-12 14:24 | *"나"* | **말머리가 아무것도 없는 처방 문장** | 🔨 | 📥 대기 |
`
  const d = build({ now: at, md: lane('| T-2a | 앱 P24 정책 | 코드 | 5 | ✅ |\n| T-2b | 품질 | 검사 | 5 | 🔨 |', ''), requestMd: REQ })
  const by = Object.fromEntries(d.tasks.map((t: { id: string }) => [t.id, t]))
  it('T 줄 · R 줄 모두 target 이 붙고, 못 뽑으면 미분류', () => {
    expect(by['T-2a'].target).toBe('1.2v 앱')
    expect(by['T-2b'].target).toBe('검수')
    expect(by.R1.target).toBe('장치')
    expect(by.R1.kind).toBe('bug') // 🐞 도 유형으로 읽는다
    expect(by.R2.target).toBe('현황판') // 요청함은 현황판 요청함 — 레인 이름 단서
  })
})
