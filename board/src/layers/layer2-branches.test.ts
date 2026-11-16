import { describe, expect, it } from 'vitest'
import { fitRefs } from './layer2-branches.ts'

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `가지이름표-${i}` }))

describe('fitRefs — 이름표 접기(R87)', () => {
  it('넓으면 전부 보인다', () => expect(fitRefs(mk(3), 900).hidden).toHaveLength(0))
  it('좁으면 접고 합이 맞다', () => {
    const r = fitRefs(mk(28), 390 - 80)
    expect(r.hidden.length).toBeGreaterThan(0)
    expect(r.shown.length + r.hidden.length).toBe(28)
  })
  it('아무리 좁아도 1개는 보인다', () => expect(fitRefs(mk(5), 10).shown).toHaveLength(1))
  it('빈 목록', () => expect(fitRefs([], 300)).toEqual({ shown: [], hidden: [] }))
})
