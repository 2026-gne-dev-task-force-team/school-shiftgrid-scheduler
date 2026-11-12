import { describe, expect, it } from 'vitest'
import { assignLanes, clampLeft, edgeLimit, graphSpans, type Span } from './graph.ts'
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

describe('clampLeft', () => {
  it('안에 들어오면 그대로', () => expect(clampLeft(100, 390, 40)).toBe(100))
  it('오른쪽으로 넘치면 안으로 당긴다', () => expect(clampLeft(380, 390, 40)).toBe(348))
  it('왼쪽 여백 2px 아래로는 안 간다', () => expect(clampLeft(-5, 390, 40)).toBe(2))
})

describe('edgeLimit — 줄기 끝 칩의 오른쪽 한계(R83)', () => {
  it('그래프가 보이는 폭보다 넓으면(가로 스크롤) 보이는 폭이 한계', () => {
    const lim = edgeLimit(520, 390) // 논리 폭 520 · 보이는 폭 390
    const left = clampLeft(520 - 20 - 90, lim, 80) // 줄기 끝 칩이 놓이려던 자리
    expect(left + 80).toBeLessThanOrEqual(390 - 2)
  })
  it('그래프가 더 좁으면 논리 폭이 한계', () => expect(edgeLimit(300, 390)).toBe(300))
})
