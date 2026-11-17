// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { BP_EDGES, BP_MODULES, BP_OVERVIEW, DESIGN_MODULES } from '../data/blueprint-modules.ts'
import { codeHits, crewByModule, labelRect, layoutGraph, linkModules, stateOf } from './layer5-graph.ts'
import { layer5 } from './layer5-blueprint.ts'
import type { Actor, BoardData, Module } from '../types.ts'

// R91 — 설계도 탭을 「앱 구조 설계도」로: 휠 = 스크롤 · 화살표마다 이름표 · 설명 빈 칸 0 · 설계 ① 모듈과 1:1.

const M = (id: string, name: string, parent: string | null, state: Module['state'], note: string | null = null, task_id: string | null = null): Module => ({ id, name, parent, state, task_id, note })
const dataMods = [
  M('h-shared', 'shared 공용', null, 'build'), M('m-p2', 'P2 덩어리 판별', 'h-shared', 'built'), M('m-p13a', 'P13a 1,820 맞추기', 'h-shared', 'plan'),
  M('h-link', 'server-link 서버 연결', null, 'plan'), M('m-p5', 'P5 로컬 사본', 'h-link', 'plan', null, 't3'), M('m-x', '이름 없는 방', 'h-link', 'build'),
  M('h-zz', '엉뚱한 집', null, 'plan'),
]
const A = (id: string, task_id: string | null): Actor => ({
  id, parent_id: null, kind: 'helper', name: '화면 ' + id, hue: 0, eye: 'amber', prop: '', dept: 'make', team: '화면팀', role: '화면', state: 'work',
  task_id, branch_id: null, account: 'org', tok_per_min: 0, started_at: '', ended_at: null,
})
const tasks = [{ id: 't3', title: '로컬 사본' }, { id: 't9', title: 'P19 특별실 예약' }, { id: 'tq', title: '모르는 일' }]
const render = () => {
  const host = document.createElement('div')
  const data = { actors: [A('a', 't3'), A('b', 't9'), A('c', 'tq')], tasks, modules: dataMods, lanes: [], events: [] } as unknown as BoardData
  layer5.render(host, { data, openDetail: () => {}, tip: () => {} })
  return host
}

describe('설계 ① 모듈과 1:1', () => {
  it('이름 목록이 같다(빠짐·덧붙임·겹침 0)', () => {
    const ids = BP_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...DESIGN_MODULES].sort())
  })
  it('화살표 두 끝은 다 있는 모듈 · 이름표가 비지 않음 · 겹친 화살표 0', () => {
    const ids = new Set(BP_MODULES.map((m) => m.id))
    for (const e of BP_EDGES) { expect(ids.has(e.from) && ids.has(e.to), `${e.from}>${e.to}`).toBe(true); expect(e.label.trim().length).toBeGreaterThan(1) }
    expect(new Set(BP_EDGES.map((e) => `${e.from}>${e.to}`)).size).toBe(BP_EDGES.length)
  })
  it('모든 모듈이 화살표 하나 이상에 닿는다(외딴 상자 0)', () => {
    for (const m of BP_MODULES) expect(BP_EDGES.some((e) => e.from === m.id || e.to === m.id), m.id).toBe(true)
  })
})

describe('설명 빈 칸 0', () => {
  it('글 칸 다섯 · 목록 칸 셋이 다 차 있다', () => {
    for (const m of BP_MODULES) {
      for (const k of ['title', 'kind'] as const) expect(m[k].trim().length, `${m.id}.${k}`).toBeGreaterThanOrEqual(2)
      for (const k of ['does', 'inputs', 'outputs'] as const) expect(m[k].trim().length, `${m.id}.${k}`).toBeGreaterThan(10)
      for (const k of ['files', 'tasks', 'sections'] as const) { expect(m[k].length, `${m.id}.${k}`).toBeGreaterThan(0); for (const x of m[k]) expect(x.trim(), `${m.id}.${k}`).not.toBe('') }
    }
  })
  it('개요 3~5줄', () => { expect(BP_OVERVIEW.length).toBeGreaterThanOrEqual(3); expect(BP_OVERVIEW.length).toBeLessThanOrEqual(5) })
  it('그린 설명 칸에 빈 dd 0 · 모듈 수만큼', () => {
    const host = render()
    const ds = host.querySelectorAll('.bp-desc')
    expect(ds.length).toBe(BP_MODULES.length)
    const dds = [...host.querySelectorAll('.bp-desc dd')]
    expect(dds.length).toBe(BP_MODULES.length * 8)
    expect(dds.filter((d) => !d.textContent?.trim())).toEqual([])
  })
})

describe('층 배치 — 위 = 판, 아래 = 바닥', () => {
  const g = layoutGraph(BP_MODULES, BP_EDGES)
  const y = (id: string) => g.boxes.get(id)!.y
  it('shared/ 가 맨 아래, server-link 가 그 위, 판들이 맨 위', () => {
    expect(Math.max(...[...g.boxes.values()].map((b) => b.y))).toBe(y('shared/'))
    expect(y('server-link')).toBeLessThan(y('shared/'))
    for (const p of ['timetable-plans', 'ops-sub', 'ops-days', 'ops-room', 'ops-aux']) expect(y(p)).toBeLessThan(y('server-link'))
  })
  it('상자끼리 안 겹치고 그림 안에 든다', () => {
    const bs = [...g.boxes.values()]
    for (const b of bs) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(g.width); expect(b.y + b.h).toBeLessThanOrEqual(g.height) }
    for (const a of bs) for (const b of bs) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id}/${b.id}`).toBe(true)
  })
})

describe('이름표끼리 겹치지 않는다', () => {
  it('이름표 상자 쌍 겹침 0 · 상자와도 0', () => {
    const g = layoutGraph(BP_MODULES, BP_EDGES)
    const rs = g.edges.map((e) => ({ id: `${e.from}>${e.to}`, r: labelRect(e) }))
    const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(hit(rs[i].r, rs[j].r), `${rs[i].id} / ${rs[j].id}`).toBe(false)
    for (const a of rs) for (const b of g.boxes.values()) expect(hit(a.r, b), `${a.id} / ${b.id}`).toBe(false)
  })
})

describe('그림 — 화살표마다 이름표', () => {
  it('화살표 수 = 이름표 수 = 자료 수, 글이 같다', () => {
    const host = render()
    const paths = [...host.querySelectorAll('path.bp-edge')]
    const labels = [...host.querySelectorAll('.bp-elabel')]
    expect(paths.length).toBe(BP_EDGES.length)
    expect(labels.length).toBe(BP_EDGES.length)
    for (const e of BP_EDGES) {
      const l = labels.find((x) => x.getAttribute('data-from') === e.from && x.getAttribute('data-to') === e.to)
      expect(l?.textContent, `${e.from}>${e.to}`).toBe(e.label)
    }
  })
  it('상자를 누르면 그 설명이 펼쳐진다', () => {
    const host = render()
    const d = host.querySelector<HTMLDetailsElement>('.bp-desc[data-id="ops-room"]')!
    expect(d.open).toBe(false)
    host.querySelector<HTMLButtonElement>('.bp-node[data-id="ops-room"]')!.click()
    expect(d.open).toBe(true)
  })
})

describe('휠은 확대가 아니다(R91 ①)', () => {
  it('휠을 굴려도 배율 그대로 · 기본 스크롤을 막지 않음', () => {
    const host = render()
    const view = host.querySelector<HTMLElement>('.bp-view')!
    const graph = host.querySelector<HTMLElement>('.bp-graph')!
    for (const dy of [-120, 120, -480]) {
      const ev = new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true })
      graph.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(false)
    }
    expect(view.dataset.zoom).toBe('1')
    expect(graph.style.transform).toBe('')
  })
  it('+ / − 단추로만 바뀐다', () => {
    const host = render()
    const view = host.querySelector<HTMLElement>('.bp-view')!
    host.querySelector<HTMLButtonElement>('button[aria-label="확대"]')!.click()
    expect(view.dataset.zoom).toBe('1.25')
    host.querySelector<HTMLButtonElement>('button[aria-label="원래 크기"]')!.click()
    expect(view.dataset.zoom).toBe('1')
  })
})

describe('현황판 자료 → 설계 ① 모듈', () => {
  const link = linkModules(dataMods, BP_MODULES)
  it('판 번호 · 집 이름으로 맞추고, 번호 없는 방은 집을 따른다', () => {
    expect(link.get('h-shared')).toBe('shared/')
    expect(link.get('m-p13a')).toBe('shared/')
    expect(link.get('m-p5')).toBe('server-link')
    expect(link.get('m-x')).toBe('server-link')
    expect(link.has('h-zz')).toBe(false)
  })
  it('P1 이 P10a 를 먹지 않는다', () => { expect(codeHits('P10a', 'P1')).toBe(false); expect(codeHits('P13a', 'P13')).toBe(true) })
  it('상태 — 방 하나라도 손대면 짓는 중, 맞춘 것 없으면 계획', () => {
    expect(stateOf('shared/', dataMods, link)).toBe('build')
    expect(stateOf('server-link', dataMods, link)).toBe('build')
    expect(stateOf('ops-aux', dataMods, link)).toBe('plan')
  })
  it('캐릭터 — 자료 칸 · 일감 제목 판 번호로 붙고, 못 맞추면 모름', () => {
    const { by, lost } = crewByModule([A('a', 't3'), A('b', 't9'), A('c', 'tq')], dataMods, tasks, BP_MODULES, link)
    expect(by.get('server-link')?.map((x) => x.id)).toEqual(['a'])
    expect(by.get('ops-room')?.map((x) => x.id)).toEqual(['b'])
    expect(lost.map((x) => x.id)).toEqual(['c'])
  })
})
