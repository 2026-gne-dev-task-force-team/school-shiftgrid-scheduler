import { expect, it } from 'vitest'
import type { Task } from '../types.ts'
import { changedChips, chipState, laneChips } from './layer3-logic.ts'

const T = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, category: '', kind: 'work', team: '', sprint: 1, est_min: 5, started_at: null, lane_id: 'a', column: 'wait', reason: '', actor_id: null, updated_at: '', ...o }) as Task

it('상태 → 칩 상태', () => {
  expect(chipState(T('x', { column: 'work' }))).toBe('work')
  expect(chipState(T('x'))).toBe('wait')
  expect(chipState(T('x', { reason: 'blocked' }))).toBe('blocked')
})
it('끝난 일·다른 레인은 빠지고 막힘 → 하는 중 → 대기, 번호순', () => {
  const r = laneChips([T('c'), T('b', { column: 'work' }), T('a2'), T('z', { column: 'done' }), T('o', { lane_id: 'b' }), T('d', { reason: 'dep' })], 'a')
  expect(r.map((c) => c.id)).toEqual(['d', 'b', 'a2', 'c'])
})
it('바뀐 칩 — 첫 그림은 없음 · 새로 생김·상태 바뀜만', () => {
  const chips = laneChips([T('a'), T('b', { column: 'work' })], 'a')
  expect(changedChips(undefined, chips).size).toBe(0)
  const prev = new Map<string, 'blocked' | 'work' | 'wait'>([['a', 'wait'], ['b', 'wait']])
  expect([...changedChips(prev, chips)]).toEqual(['b'])
  expect([...changedChips(new Map(), chips)].sort()).toEqual(['a', 'b'])
})
