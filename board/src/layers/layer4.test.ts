import { describe, expect, it } from 'vitest'
import { blockText, colOf, isOver, minutesIn } from './layer4-logic.ts'
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
describe('막힌 까닭 문장', () => {
  const all = [T({ id: 'p', title: '앞 일 제목' })]
  it('앞 일 기다림은 앞 일 제목을 넣어 조립한다', () => expect(blockText(T({ block_kind: 'dep', blocked_by: 'p' }), all)).toBe('앞 일 「앞 일 제목」이 끝나야 한다'))
  it('나머지 낱말도 틀로', () => {
    expect(blockText(T({ block_kind: 'decide' }), all)).toBe('결정을 기다린다')
    expect(blockText(T({ block_kind: 'check', blocked_by: 'p' }), all)).toBe('「앞 일 제목」 검사가 통과하지 못했다')
    expect(blockText(T({ block_kind: 'outside' }), all)).toBe('바깥 답을 기다린다')
  })
  it('낱말이 없으면 null', () => expect(blockText(T({}), all)).toBeNull())
})
