import { describe, expect, it } from 'vitest'
import { rawFixtures } from '../data.ts'
import type { BoardData } from '../types.ts'
import { reviewLabel, sprintProgress, sprintsNewestFirst } from './sprints.ts'

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
