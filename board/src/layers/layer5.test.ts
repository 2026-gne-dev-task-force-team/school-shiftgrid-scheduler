import { describe, expect, it } from 'vitest'
import { clampZoom, groupHouses, lineOf, restoreTab, roomCount, splitCode } from './layer5-logic.ts'
import type { Module } from '../types.ts'

const M = (id: string, parent: string | null, state: Module['state']): Module => ({ id, name: id, parent, state, task_id: null })
const mods = [M('a', null, 'built'), M('a1', 'a', 'built'), M('a2', 'a', 'build'), M('b', null, 'plan'), M('b1', 'b', 'plan')]

describe('집 배치', () => {
  it('부모별로 묶는다', () => {
    const hs = groupHouses(mods)
    expect(hs.map((x) => x.root.id)).toEqual(['a', 'b'])
    expect(hs[0].rooms.map((r) => r.id)).toEqual(['a1', 'a2'])
  })
  it('방 없는 집은 자기 한 칸', () => expect(groupHouses([M('z', null, 'plan')])[0].rooms.map((r) => r.id)).toEqual(['z']))
  it('방 수·지은 수', () => expect(roomCount(groupHouses(mods))).toEqual({ total: 3, built: 1 }))
})
describe('선 종류', () => {
  it('상태별', () => { expect(lineOf('plan')).toBe('ghost'); expect(lineOf('build')).toBe('scaffold'); expect(lineOf('built')).toBe('solid') })
  it('확대 범위', () => { expect(clampZoom(9)).toBe(3); expect(clampZoom(0.1)).toBe(0.5) })
})
describe('탭 기억', () => {
  it('보던 탭 유지', () => expect(restoreTab(3, 6)).toBe(3))
  it('범위 밖·비정수는 0', () => { expect(restoreTab(9, 6)).toBe(0); expect(restoreTab(1.5, 6)).toBe(0); expect(restoreTab(-1, 6)).toBe(0) })
})
describe('이름 앞 코드', () => {
  it('코드는 꼬리표로, 뜻은 앞으로', () => {
    expect(splitCode('P10a iframe 입구')).toEqual({ code: 'P10a', text: 'iframe 입구' })
    expect(splitCode('P7 412 버튼 둘')).toEqual({ code: 'P7', text: '412 버튼 둘' })
  })
  it('코드가 없으면 그대로', () => expect(splitCode('자료 싣기')).toEqual({ code: '', text: '자료 싣기' }))
})

// R88: 칩 글자를 흐리게 하는 opacity 를 되살리지 않게 지킨다(.bp-room 규칙에 opacity 금지 · 세 상태에 기호)
describe('설계도 칩 가독성', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
  const rules = css.split('\n').filter((l) => l.includes('.bp-room'))
  it('opacity 없음', () => expect(rules.filter((l) => /opacity\s*:/.test(l))).toEqual([]))
  it('세 상태 기호', () => { for (const c of ['solid', 'ghost', 'scaffold']) expect(rules.some((l) => l.includes(`.bp-room.${c}::before`))).toBe(true) })
})
