import { describe, expect, it } from 'vitest'
import { rawFixtures } from '../data.ts'
import type { BoardData } from '../types.ts'
import { reviewLabel, sprintProgress, sprintsNewestFirst, currentSprint, sprintLabel, flightStatus } from './sprints.ts'
import { LAYERS } from '../layers/registry.ts'
import { actorLabel, actorWhat } from './actor.ts'

describe('막대의 지금 스프린트', () => {
  it('막대 글은 목표(goals)가 아니라 열린 스프린트 3이다', () => {
    expect(sprintLabel(d)).toBe('Sprint 3 · 불편 접수함 · 진짜 자료 · 품질')
    expect(sprintLabel({ sprints: [], tasks: d.tasks })).toBe('작업현황판')
  })
  it('began 이 깨진 서버 줄이 섞여도 번호 큰 열린 줄', () => {
    const l = d.sprints.map((s) => ({ ...s, began: '', ended: s.id === 1 ? s.ended : null }))
    expect(sprintLabel({ sprints: l, tasks: d.tasks })).toMatch(/^Sprint 3 /)
  })
})

describe('캐릭터 이름 = 하는 일', () => {
  const base = d.actors[5] // 시험
  it('자연 낱말·빈 이름이면 역할에서 만든다', () => {
    expect(d.actors.map((a) => actorLabel(a, d.actors))).toEqual(['지휘', '살림지기', '화면 다듬기', '자료 나르기', '설계', '시험', '맨눈 점검'])
    expect(actorLabel({ ...base, name: '이끼' })).toBe('시험')
    expect(actorLabel({ ...base, name: '' })).toBe('시험')
  })
  it('같은 역할 둘이면 번호, 역할로 시작하는 이름은 그대로', () => {
    const two = [{ ...base, id: 'x1', name: '' }, { ...base, id: 'x2', name: '솔' }]
    expect(two.map((a) => actorLabel(a, two))).toEqual(['시험 1', '시험 2'])
    expect(actorLabel({ ...base, name: '시험·달력' }, two)).toBe('시험·달력')
  })
  it('한 줄 설명 = 역할 설명 + 맡은 일감', () => {
    const t = d.tasks.find((x) => x.id === base.task_id)!
    expect(actorWhat(base, d.tasks)).toBe(`자동 시험을 돌려 고장을 찾는다 · 지금: ${t.title}`)
  })
})

describe('탭 설명', () => {
  it('모든 탭에 설명이 있다', () => {
    expect(LAYERS.filter((l) => !l.desc).map((l) => l.id)).toEqual([])
  })
})

const d = rawFixtures as unknown as BoardData

describe('스프린트', () => {
  it('진행률은 든 태스크 중 끝난 비율이다', () => {
    const [s1, s2, s3] = [1, 2, 3].map((i) => d.sprints.find((s) => s.id === i)!)
    expect(sprintProgress(s1, d.tasks)).toEqual({ done: 8, total: 8, pct: 100 })
    expect(sprintProgress(s2, d.tasks).pct).toBe(100)
    expect(sprintProgress(s3, d.tasks)).toEqual({ done: 2, total: 5, pct: 40 })
    expect(sprintProgress({ ...s3, task_ids: [] }, d.tasks).pct).toBe(0)
  })
  it('최신이 위, 검수 칩 글', () => {
    expect(sprintsNewestFirst(d.sprints).map((s) => s.id)).toEqual([3, 2, 1])
    expect(d.sprints.map(reviewLabel)).toEqual(['검수 대기', '검수 통과', '검수 대기'])
  })
})

describe('지금 스프린트', () => {
  it('ended 없는 줄을 고르고 진행률을 계산한다', () => {
    const c = currentSprint(d)!
    expect(c.sprint.id).toBe(3)
    expect(c.pct).toBe(40)
  })
  it('최신이 끝났고 옛 줄이 열려 있으면 열린 줄', () => {
    const l = d.sprints.map((s) => (s.id === 3 ? { ...s, ended: '2026-11-13T00:00:00+09:00' } : s.id === 2 ? { ...s, ended: null } : s))
    expect(currentSprint({ sprints: l, tasks: d.tasks })!.sprint.id).toBe(2)
  })
  it('모두 끝났으면 최신, 없으면 null', () => {
    const all = d.sprints.map((s) => ({ ...s, ended: '2026-11-13T00:00:00+09:00' }))
    expect(currentSprint({ sprints: all, tasks: d.tasks })!.sprint.id).toBe(3)
    expect(currentSprint({ sprints: [], tasks: d.tasks })).toBeNull()
  })
})

describe('안내판 상태 말', () => {
  const s = d.sprints[0]!
  it('끝=ARRIVED · 진행=BOARDING · 시작 전=SCHEDULED', () => {
    const t = Date.parse(s.began)
    expect(flightStatus({ ...s, ended: '2026-11-13T00:00:00+09:00' }, t)).toBe('ARRIVED')
    expect(flightStatus({ ...s, ended: null }, t + 1)).toBe('BOARDING')
    expect(flightStatus({ ...s, ended: null }, t - 1)).toBe('SCHEDULED')
  })
})
