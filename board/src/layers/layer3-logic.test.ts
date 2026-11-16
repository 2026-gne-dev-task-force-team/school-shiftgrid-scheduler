import { expect, it } from 'vitest'
import type { Task } from '../types.ts'
import { changedChips, chipState, laneChips, NO_TITLE, rowDetails, rowTitle } from './layer3-logic.ts'

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
it('줄 제목 — 있으면 그대로 · 비면 (설명 없음)', () => {
  expect(rowTitle(T('a', { title: ' 제목 ' }))).toEqual({ text: '제목', empty: false })
  expect(rowTitle(T('a', { title: '  ' }))).toEqual({ text: NO_TITLE, empty: true })
})
it('세부 — 값 있는 칸만, 상태는 항상', () => {
  expect(rowDetails(T('a'))).toEqual([['상태', '대기']])
  const r = rowDetails(T('a', { body: 'B', ask: 'Q', done: 'D', column: 'work' }))
  expect(r.map((x) => x[0])).toEqual(['무엇', '왜(요청)', '완료 정의', '상태'])
  expect(r[3][1]).toBe('하는 중')
})
