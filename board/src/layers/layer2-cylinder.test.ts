import { describe, expect, it } from 'vitest'
import { branchFaces, cylinderPose, faceStep, frontIndex, rotTo, wrapDeg } from './layer2-cylinder.ts'
import { crowd } from './layer2-branches.ts'
import branches from '../../fixtures/branches.json'
import type { Branch } from '../types.ts'

const bs = branches as Branch[]
const graph = bs.find((b) => b.trunk)!.graph!

describe('branchFaces — 가지 면 나누기(R94)', () => {
  const { faces, trunk } = branchFaces(graph, bs)
  it('줄기 말고 가지마다 면 하나', () => expect(faces.map((f) => f.id).sort()).toEqual(bs.filter((b) => !b.trunk).map((b) => b.id).sort()))
  it('면마다 위가 최신(시각 내림차순)', () => {
    for (const f of [...faces.map((x) => x.commits), trunk]) {
      const at = f.map((c) => c.at)
      expect(at).toEqual([...at].sort().reverse())
    }
  })
  it('커밋 줄마다 메시지 칸이 있다', () => {
    for (const c of [...faces.flatMap((f) => f.commits), ...trunk]) expect(typeof c.subject).toBe('string')
  })
  it('커밋은 한 자리에만 — 면·줄기 합이 전체와 같다', () => {
    const all = [...faces.flatMap((f) => f.commits), ...trunk].map((c) => c.sha)
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(graph.length)
  })
  it('열린 가지는 갈라진 자리(줄기 커밋)를 안다', () => {
    const b2 = faces.find((f) => f.id === 'b2')!
    expect(b2.commits.map((c) => c.sha)).toEqual(['c9a1f003', 'c8b2e002'])
    expect(b2.fork).toBe('c7d3d001')
  })
  it('면 순서는 가지 끝이 최신인 것부터', () => expect(faces[0]!.id).toBe('b2'))
})

describe('원통 회전 — 앞/뒤 크기·밝기', () => {
  it('면 사이 각도가 균등하다(28개 = 360/28)', () => {
    expect(faceStep(28)).toBeCloseTo(360 / 28)
    const d = Array.from({ length: 28 }, (_, i) => cylinderPose(i, 28, 0).deg)
    const gaps = d.map((x, i) => wrapDeg(d[(i + 1) % 28]! - x))
    for (const g of gaps) expect(g).toBeCloseTo(360 / 28)
  })
  it('정면은 크고 밝고, 뒤는 작고 어둡다', () => {
    const f = cylinderPose(0, 8, 0), side = cylinderPose(2, 8, 0), back = cylinderPose(4, 8, 0)
    expect(f).toMatchObject({ front: true, depth: 1, scale: 1, light: 1, x: 0 })
    expect(back.scale).toBeLessThan(side.scale); expect(side.scale).toBeLessThan(f.scale)
    expect(back.light).toBeLessThan(side.light); expect(side.light).toBeLessThan(f.light)
    expect(back.z).toBeLessThan(f.z)
    expect(back.front).toBe(false)
  })
  it('왼쪽·오른쪽 대칭', () => {
    const l = cylinderPose(1, 6, 0), r = cylinderPose(5, 6, 0)
    expect(l.x).toBeCloseTo(-r.x); expect(l.scale).toBeCloseTo(r.scale)
  })
  it('돌리면 다른 면이 정면', () => {
    expect(frontIndex(0, 5)).toBe(0)
    expect(frontIndex(72, 5)).toBe(1)
    expect(frontIndex(-72, 5)).toBe(4)
    expect(cylinderPose(1, 5, 72).front).toBe(true)
  })
  it('칩 눌러 돌리기는 짧은 쪽으로', () => {
    expect(rotTo(0, 4, 5)).toBeCloseTo(-72)
    expect(rotTo(720, 1, 5)).toBeCloseTo(792)
    expect(frontIndex(rotTo(1000, 3, 7), 7)).toBe(3)
  })
})

describe('crowd — 한 칸 캐릭터 겹침 0(R94 ③)', () => {
  it('둘까지 나란히, 나머지는 수', () => expect(crowd([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2], more: 3 }))
  it('적으면 다 보인다', () => expect(crowd([1])).toEqual({ shown: [1], more: 0 }))
})
