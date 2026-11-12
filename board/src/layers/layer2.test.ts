import { describe, expect, it } from 'vitest'
import { hitTest, project, type Seg } from './layer2-logic.ts'

const S = (o: Partial<Seg>): Seg => ({ id: 'a', x1: 100, x2: 300, y: 50, cos: 1, ...o })
describe('누르기 판정', () => {
  it('앞면 가지는 잡힌다', () => expect(hitTest([S({})], 200, 52)).toBe('a'))
  it('뒷면(cos<0) 가지는 안 잡힌다', () => expect(hitTest([S({ cos: -0.8 })], 200, 50)).toBeNull())
  it('cos=0 옆면도 안 잡힌다', () => expect(hitTest([S({ cos: 0 })], 200, 50)).toBeNull())
  it('범위 밖은 안 잡힌다', () => { expect(hitTest([S({})], 50, 50)).toBeNull(); expect(hitTest([S({})], 200, 120)).toBeNull() })
  it('과녁은 위아래 24px 이상(기본) · 폰은 tol 을 키워 44px', () => {
    expect(hitTest([S({})], 200, 50 + 12)).toBe('a'); expect(hitTest([S({})], 200, 50 - 12)).toBe('a'); expect(hitTest([S({})], 200, 50 + 13)).toBeNull()
    expect(hitTest([S({})], 200, 50 + 22, 22)).toBe('a'); expect(hitTest([S({})], 200, 50 + 23, 22)).toBeNull()
  })
  it('뒤로 기울어도(cos 작아도) 앞면이면 같은 과녁', () => expect(hitTest([S({ cos: 0.2 })], 200, 50 + 12)).toBe('a'))
  it('겹치면 더 앞 가지', () => expect(hitTest([S({ id: 'b', cos: 0.4 }), S({ id: 'c', cos: 0.9 })], 200, 50)).toBe('c'))
})
describe('투영', () => {
  it('rot=0 이면 첫 가지가 정면', () => { const p = project(['a', 'b', 'c'], 0, 100); expect(p[0]!.cos).toBe(1); expect(p[0]!.y).toBe(0) })
})
