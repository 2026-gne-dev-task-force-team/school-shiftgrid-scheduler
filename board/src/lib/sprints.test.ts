import { describe, expect, it } from 'vitest'
import { rawFixtures } from '../data.ts'
import type { BoardData } from '../types.ts'
import { reviewLabel, sprintProgress, sprintsNewestFirst, currentSprint, sprintLabel, flightStatus, sprintLeft } from './sprints.ts'
import { LAYERS } from '../layers/registry.ts'
import { actorLabel, actorWhat, nameTag } from './actor.ts'

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

describe('캐릭터 이름표 = 역할 · 태스크 번호', () => {
  const base = d.actors[5] // 시험
  it('역할 낱말만 쓴다 — 자료의 name 은 무시', () => {
    expect(d.actors.map((a) => actorLabel(a, d.actors))).toEqual(d.actors.map((a) => nameTag(a)))
    expect(nameTag({ ...base, task_id: null, name: '이끼' })).toBe('시험팀')
    expect(nameTag({ ...base, task_id: null, name: '' })).toBe('시험팀')
    expect(nameTag({ ...base, task_id: null, name: '낯선 별명' })).toBe('시험팀')
  })
  it('태스크 번호가 붙고 레인 접두는 벗긴다', () => {
    expect(nameTag({ ...base, task_id: 'T-7z' })).toBe('시험팀 T-7z')
    expect(nameTag({ ...base, task_id: 'l-ab12cd-T-7z' })).toBe('시험팀 T-7z')
    expect(nameTag({ name: '지휘', role: '지휘', team: '지휘', task_id: null })).toBe('지휘')
  })
  it('감독관·대화는 team 이 문장이어도 role 로 정한다', () => {
    expect(nameTag({ name: '감독관', role: '감독', team: '시험 화면 막힘 2건' })).toBe('감독관')
    expect(nameTag({ name: '대화 세션', role: '세션', team: '세션' })).toBe('대화')
  })
  it('번호 없는 같은 이름표 둘이면 1·2', () => {
    const two = [{ ...base, id: 'x1', name: '', task_id: null }, { ...base, id: 'x2', name: '솔', task_id: null }]
    expect(two.map((a) => actorLabel(a, two))).toEqual(['시험팀 1', '시험팀 2'])
  })
  it('한 줄 설명 = 역할 설명 + 맡은 일감', () => {
    const t = d.tasks.find((x) => x.id === base.task_id)!
    expect(actorWhat(base, d.tasks)).toBe(`자동 시험을 돌려 고장을 찾는다 · 지금: ${t.id} ${t.title}`)
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
    expect(d.sprints.map(reviewLabel)).toEqual(['끝', '검수 통과', '진행 중'])
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

describe('sprintLeft', () => {
  it('지금 스프린트의 태스크만 센다 — 요청함 R 카드는 안 섞인다', () => {
    const mk = (id: string, column: 'wait' | 'done') => ({ id, column }) as never
    const sp = { id: 7, title: 't', goal: 'g', began: '2026-11-12T00:00:00Z', ended: null, task_ids: ['T-1', 'T-2'] } as never
    expect(sprintLeft({ sprints: [sp], tasks: [mk('T-1', 'done'), mk('T-2', 'wait'), mk('R1', 'wait'), mk('R2', 'wait')] })).toBe(1)
  })
})
