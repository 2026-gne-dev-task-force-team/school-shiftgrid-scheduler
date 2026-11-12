import { describe, expect, it } from 'vitest'
import { hitTest, labelIds, project, type Seg } from './layer2-logic.ts'

const S = (o: Partial<Seg>): Seg => ({ id: 'a', x1: 100, x2: 300, y: 50, cos: 1, ...o })
describe('누르기 판정', () => {
  it('앞면 가지는 잡힌다', () => expect(hitTest([S({})], 200, 52)).toBe('a'))
  it('뒷면(cos<0) 가지는 안 잡힌다', () => expect(hitTest([S({ cos: -0.8 })], 200, 50)).toBeNull())
  it('cos=0 옆면도 안 잡힌다', () => expect(hitTest([S({ cos: 0 })], 200, 50)).toBeNull())
  it('범위 밖은 안 잡힌다', () => { expect(hitTest([S({})], 50, 50)).toBeNull(); expect(hitTest([S({})], 200, 120)).toBeNull() })
  it('겹치면 더 앞 가지', () => expect(hitTest([S({ id: 'b', cos: 0.4 }), S({ id: 'c', cos: 0.9 })], 200, 50)).toBe('c'))
})
describe('투영 · 라벨', () => {
  it('rot=0 이면 첫 가지가 정면', () => { const p = project(['a', 'b', 'c'], 0, 100); expect(p[0]!.cos).toBe(1); expect(p[0]!.y).toBe(0) })
  it('라벨은 앞면 가지 중 앞쪽 max 개', () => {
    const p = project(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 0, 100)
    const l = labelIds(p, 2)
    expect(l.size).toBe(2); expect(l.has('a')).toBe(true)
    for (const q of p) if (q.cos <= 0) expect(l.has(q.id)).toBe(false)
  })
})
