import { describe, expect, it } from 'vitest'
import { colOf, isOver, minutesIn } from './layer4-logic.ts'
import type { Task } from '../types.ts'

const T = (o: Partial<Task>): Task => ({ id: 'x', title: 't', category: '코드', kind: 'work', team: 'a', sprint: 1, est_min: 20,
  started_at: '2026-01-01T10:00:00Z', lane_id: 'l', column: 'work', reason: 'new', actor_id: null, updated_at: '', ...o })
const at = (min: number) => Date.parse('2026-01-01T10:00:00Z') + min * 60000

describe('열 배치', () => {
  it('checking 은 확인 중 칸', () => expect(colOf(T({ column: 'wait', reason: 'checking' }))).toBe('check'))
  it('나머지 wait 은 기다림', () => expect(colOf(T({ column: 'wait', reason: 'blocked' }))).toBe('wait'))
  it('work · done 은 그대로', () => { expect(colOf(T({}))).toBe('work'); expect(colOf(T({ column: 'done' }))).toBe('done') })
})
describe('짐작 초과', () => {
  it('짐작 이하는 아님', () => expect(isOver(T({}), at(20))).toBe(false))
  it('짐작을 넘기면 참', () => { expect(isOver(T({}), at(21))).toBe(true); expect(minutesIn(T({}), at(21))).toBe(21) })
  it('끝난 일·시작 전은 아님', () => {
    expect(isOver(T({ column: 'done' }), at(99))).toBe(false)
    expect(isOver(T({ started_at: null }), at(99))).toBe(false)
  })
})
