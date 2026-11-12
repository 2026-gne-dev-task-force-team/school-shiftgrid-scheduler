// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { attachActors, matchRoom } from './layer5-match.ts'
import { layer5 } from './layer5-blueprint.ts'
import type { Actor, BoardData, Module } from '../types.ts'

const M = (id: string, parent: string | null, note: string | null = null, task_id: string | null = null): Module => ({ id, name: id, parent, state: 'build', task_id, note })
const mods = [M('h', null), M('r1', 'h', 'P12 · R53'), M('r2', 'h', 'P13 · R54'), M('r3', 'h', null, 'tX')]
const tasks = [{ id: 'tX', title: '칸 연결' }, { id: 'T-8g', title: 'T-8g (R54) 붙이기' }, { id: 'zz', title: '엉뚱한 일' }]
const A = (id: string, task_id: string | null, state: Actor['state'] = 'work'): Actor => ({
  id, parent_id: null, kind: 'helper', name: '화면 ' + id, hue: 0, eye: 'amber', prop: '', dept: 'make', team: '화면팀', role: '화면', state,
  task_id, branch_id: null, account: 'org', tok_per_min: 0, started_at: '', ended_at: null,
})

describe('맞춤 함수', () => {
  it('칸의 task_id 로 맞음', () => expect(matchRoom({ task_id: 'tX' }, mods, tasks)).toBe('r3'))
  it('일감 제목의 요청 번호로 맞음', () => expect(matchRoom({ task_id: 'T-8g' }, mods, tasks)).toBe('r2'))
  it('못 맞춤', () => { expect(matchRoom({ task_id: 'zz' }, mods, tasks)).toBeNull(); expect(matchRoom({ task_id: null }, mods, tasks)).toBeNull() })
  it('일함·막힘만 붙고 못 맞춘 건 lost', () => {
    const r = attachActors([A('a', 'tX'), A('b', 'tX', 'blocked'), A('c', 'tX', 'idle'), A('d', 'tX', 'off'), A('e', 'zz')], mods, tasks)
    expect(r.byRoom.get('r3')?.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.lost.map((x) => x.id)).toEqual(['e'])
  })
})

describe('렌더', () => {
  it('칸 곁 캐릭터 수 + 모름 줄', () => {
    const host = document.createElement('div')
    const data = { actors: [A('a', 'tX'), A('b', 'T-8g'), A('e', 'zz')], tasks, modules: mods } as unknown as BoardData
    layer5.render(host, { data, openDetail: () => {}, tip: () => {} })
    expect(host.querySelectorAll('.bp-slot .bp-crew svg').length).toBe(2)
    expect(host.querySelectorAll('.bp-lost .bp-crew svg').length).toBe(1)
  })
})
