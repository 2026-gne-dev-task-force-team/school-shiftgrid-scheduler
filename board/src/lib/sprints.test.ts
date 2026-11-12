import { describe, expect, it } from 'vitest'
import { rawFixtures } from '../data.ts'
import type { BoardData } from '../types.ts'
import { reviewLabel, sprintProgress, sprintsNewestFirst, currentSprint } from './sprints.ts'

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
