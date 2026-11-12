import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { build, columnOf, publicGoal, publicTitle, runState, serviceState } from './snapshot.mjs'
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
    } }))
    const d = build({ now: at, gatePath, md: lane('| T-2a | 보고꾼 | 코드 | 5 | ✅ |', '') })
    expect(d.actors.map((a: Actor) => [a.id, a.name, a.state, a.task_id])).toEqual([
      ['a-lead', '지휘', 'work', null], ['a-T-2a', '자료 나르기', 'work', 'T-2a'], ['a-22222222', '일손', 'work', null]])
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
    expect(publicGoal('쥔님 14:42 *"요청할건 실제 데이터가 먼저다"*')).toBe('') // 쥔님 말 원문은 공개 판에 안 싣는다
    expect(publicGoal('쥔님 *"D:\\x 에 있는 것 고쳐라"*')).toBe('')
    expect(build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', '') }).sprints[1].goal).toBe('지금')
  })
})

describe('보고꾼 — 서비스·모듈', () => {
  const d = build({ now: at, md: lane('| T-2a | 가 | 코드 | 5 | ⬜ |', '') })

  it('모듈: 화면·자료 묶음 아래 실제 탭과 자료 부품', () => {
    const name = (id: string | null) => d.modules.find((m: { id: string }) => m.id === id)?.name
    const under = (p: string) => d.modules.filter((m: { parent: string | null }) => m.parent === p).map((m: { name: string }) => m.name)
    expect(name('m-screen')).toBe('화면')
    expect(under('m-screen')).toEqual(expect.arrayContaining(['한눈', '가지', '레인', '작업장', '집', '스프린트', '접수함', '안내']))
    expect(under('m-data')).toEqual(['보고꾼', '나르기', '문지기 훅'])
    expect(d.modules.every((m: { state: string; task_id: unknown }) => m.state === 'built' && m.task_id === null)).toBe(true)
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
