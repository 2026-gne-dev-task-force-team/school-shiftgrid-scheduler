import { describe, expect, it } from 'vitest'
import { layoutGraph, synthGraph } from './graph-layout.ts'
import type { Branch } from '../types.ts'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })
const lane = (l: ReturnType<typeof layoutGraph>, sha: string) => l.nodes.find((n) => n.sha === sha)!.lane

describe('layoutGraph', () => {
  it('일직선 기록은 한 레일 · 행은 위에서 아래', () => {
    const l = layoutGraph([c('c', 'b'), c('b', 'a'), c('a')])
    expect(l.lanes).toBe(1)
    expect(l.nodes.map((n) => n.row)).toEqual([0, 1, 2])
    expect(l.edges.every((e) => e.bend === 'none' && !e.open)).toBe(true)
  })
  it('가지는 다른 레일 · 갈린 점에서 부모 쪽으로 꺾인다', () => {
    const l = layoutGraph([c('f2', 'f1'), c('f1', 'm1'), c('t2', 'm1'), c('m1')], 't2')
    expect(lane(l, 't2')).toBe(0)
    expect(lane(l, 'f2')).toBe(1)
    expect(lane(l, 'f1')).toBe(1)
    expect(lane(l, 'm1')).toBe(0)
    const fork = l.edges.find((e) => e.from === 'f1')!
    expect(fork).toMatchObject({ bend: 'parent', fromLane: 1, toLane: 0, colorLane: 1 })
  })
  it('머지는 두 번째 부모로 자식 쪽에서 꺾이는 선을 낸다', () => {
    const l = layoutGraph([c('mg', 'a', 'x'), c('x', 'a'), c('a')])
    expect(lane(l, 'mg')).toBe(0)
    expect(lane(l, 'x')).toBe(1)
    expect(l.edges.find((e) => e.from === 'mg' && e.to === 'x')).toMatchObject({ bend: 'child', toLane: 1, colorLane: 1 })
    expect(l.lanes).toBe(2)
  })
  it('끝난 가지의 레일은 다음 가지가 다시 쓴다', () => {
    const l = layoutGraph([c('n1', 'm'), c('o2', 'o1'), c('o1', 'm'), c('m')], undefined)
    expect(l.lanes).toBeLessThanOrEqual(2)
  })
  it('부모가 목록 밖이면 열린 선', () => {
    const l = layoutGraph([c('b', 'a')])
    expect(l.edges[0]).toMatchObject({ open: true, toRow: 1 })
  })
  it('빈 목록', () => {
    expect(layoutGraph([])).toEqual({ nodes: [], edges: [], lanes: 1 })
  })
})

describe('synthGraph', () => {
  const br = (id: string, over: Partial<Branch> = {}): Branch => ({ id, title: id, trunk: false, ahead: 2, state: 'live', actor_id: null, task_id: null, updated_at: '2026-01-01T00:00:00Z', ...over })
  it('열린 가지만 앞선 수만큼 · 줄기 끝에서 갈라진다', () => {
    const g = synthGraph([br('t', { trunk: true, ahead: 0 }), br('x'), br('y', { state: 'merged' })])
    expect(g.map((x) => x.sha)).toEqual(['x~2', 'x~1', 'trunk~0'])
    expect(g[1]!.parents).toEqual(['trunk~0'])
    const l = layoutGraph(g, 'trunk~0')
    expect(l.nodes.find((n) => n.sha === 'x~2')!.lane).toBe(1)
  })
})
