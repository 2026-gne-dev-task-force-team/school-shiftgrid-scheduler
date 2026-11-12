import { describe, expect, it } from 'vitest'
import { assignLanes, graphSpans, type Span } from './graph.ts'
import { rawFixtures } from '../data.ts'
import type { Branch, BoardEvent } from '../types.ts'

const S = (id: string, from: number, to: number, open = false): Span => ({ id, from, to, open })
describe('줄 배정', () => {
  it('겹치는 두 가지는 다른 줄', () => {
    const m = assignLanes([S('a', 1, 5), S('b', 3, 7)])
    expect(m.get('a')).toBe(1); expect(m.get('b')).toBe(2)
  })
  it('합친 뒤엔 그 줄을 다시 쓴다', () => expect(assignLanes([S('a', 1, 3), S('b', 4, 6)]).get('b')).toBe(1))
  it('합친 칸에서 바로 따면 다른 줄(점이 겹치지 않게)', () => expect(assignLanes([S('a', 1, 3), S('b', 3, 6)]).get('b')).toBe(2))
  it('열린 가지 줄은 다시 안 쓴다', () => expect(assignLanes([S('a', 1, 2, true), S('b', 5, 6)]).get('b')).toBe(2))
  it('입력 순서와 무관하게 이른 가지부터', () => expect(assignLanes([S('b', 4, 6), S('a', 1, 3)]).get('a')).toBe(1))
})
describe('시간 칸', () => {
  it('목업: 생김 기록이 없으면 첫 기록 한 칸 앞 · 합친 가지는 한 칸 이상', () => {
    const { spans, cols } = graphSpans(rawFixtures.branches as Branch[], rawFixtures.events as BoardEvent[])
    expect(cols).toBeGreaterThan(0)
    for (const s of spans) { expect(s.from).toBeLessThanOrEqual(s.to); expect(s.from).toBeGreaterThanOrEqual(0) }
    const b4 = spans.find((s) => s.id === 'b4')!
    expect(b4.open).toBe(false); expect(b4.from).toBeLessThan(b4.to)
  })
})
