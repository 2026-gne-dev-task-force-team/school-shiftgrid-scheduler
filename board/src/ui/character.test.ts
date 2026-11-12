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
  it('눈 색이 비면 이름 해시로 늘 같은 색', () => {
    expect(eyeColor({ name: '솔', eye: '' })).toBe(eyeColor({ name: '솔', eye: '' }))
    expect(eyeColor({ name: '솔', eye: '#123456' })).toBe('#123456')
  })
  it('소품: prop 우선, 없으면 역할', () => {
    expect(propOf({ prop: 'lens', role: '지휘' })).toBe('lens')
    expect(propOf({ prop: '', role: '설계' })).toBe('ruler')
    expect(characterSvg({ ...A, prop: 'lens' })).not.toBe(characterSvg(A))
  })
  it('이름은 aria-label 로, 이스케이프', () => expect(characterSvg({ ...A, name: '<a"b>' })).toContain('aria-label="&#60;a&#34;b&#62;"'))
})
