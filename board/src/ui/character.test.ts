import { describe, expect, it } from 'vitest'
import { characterSvg, eyeColor, propOf } from './character.ts'
import type { Actor } from '../types.ts'

const A = { name: '모래', eye: 'amber', prop: 'flag', dept: 'hq', role: '지휘', state: 'work' } satisfies Partial<Actor> as Pick<Actor, 'name' | 'eye' | 'prop' | 'dept' | 'role' | 'state'>

describe('캐릭터', () => {
  it('같은 입력 → 같은 SVG', () => expect(characterSvg(A)).toBe(characterSvg({ ...A })))
  it('눈 색이 바뀌면 SVG 가 바뀐다', () => {
    expect(characterSvg(A)).toContain('#F0A830')
    const t = characterSvg({ ...A, eye: 'teal' })
    expect(t).toContain('#2FBFAE'); expect(t).not.toBe(characterSvg(A))
  })
  it('도트 격자: 산호 몸통·rect 만·crispEdges', () => {
    const v = characterSvg(A)
    expect(v).toContain('shape-rendering="crispEdges"'); expect(v).toContain('#D97757'); expect(v).not.toMatch(/<(path|circle|ellipse)/)
  })
  it('머리띠 색 = 부서, 쉼이면 눈이 한 줄', () => {
    expect(characterSvg(A)).toContain('#E0B341'); expect(characterSvg({ ...A, dept: 'qa' })).toContain('#A37BE0')
    expect(characterSvg({ ...A, state: 'idle' })).not.toBe(characterSvg(A))
  })
  it('눈 색이 비면 이름 해시로 늘 같은 색', () => {
    expect(eyeColor({ name: '솔', eye: '' })).toBe(eyeColor({ name: '솔', eye: '' }))
    expect(eyeColor({ name: '솔', eye: '#123456' })).toBe('#123456')
  })
  it('소품: prop 우선, 없으면 역할', () => {
    expect(propOf({ prop: 'lens', role: '지휘' })).toBe('lens')
    expect(propOf({ prop: '', role: '설계' })).toBe('ruler')
    expect(characterSvg({ ...A, prop: 'lens' })).not.toBe(characterSvg(A))
  })
  it('이름(역할 이름 규칙)은 aria-label 로, 이스케이프', () => {
    expect(characterSvg({ ...A, name: '지휘<a"b>' })).toContain('aria-label="지휘&#60;a&#34;b&#62;"')
    expect(characterSvg(A)).toContain('aria-label="지휘"') // 자연 낱말 이름은 역할로
  })
})
