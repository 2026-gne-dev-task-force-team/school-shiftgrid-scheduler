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
  it('감독 소품 scope 는 lens 와 다른 모양', () => {
    expect(propOf({ prop: '', role: '감독' })).toBe('scope')
    expect(characterSvg({ ...A, prop: 'scope' })).not.toBe(characterSvg({ ...A, prop: 'lens' }))
    expect(characterSvg({ ...A, prop: 'scope' })).not.toBe(characterSvg(A))
  })
  it('이름(역할 이름 규칙)은 aria-label 로, 이스케이프', () => {
    expect(characterSvg({ ...A, role: '<a"b>', team: '' })).toContain('aria-label="&#60;a&#34;b&#62;"')
    expect(characterSvg(A)).toContain('aria-label="지휘"') // 자연 낱말 이름은 역할로
  })
  it('상태마다 꼴이 다르다: 쉼 Z · 막힘 ! · 퇴근 흐림 표지 · 일함은 표지 없음', () => {
    const v = (state: Actor['state']) => characterSvg({ ...A, state })
    expect(v('idle')).toContain('chr-z'); expect(v('idle')).not.toContain('chr-bang')
    expect(v('blocked')).toContain('chr-bang'); expect(v('blocked')).not.toContain('chr-z')
    expect(v('work')).not.toMatch(/chr-z|chr-bang/); expect(v('off')).toContain('data-state="off"')
    expect(v('off')).not.toBe(v('work')); expect(v('wait')).toContain('data-state="wait"')
    expect(v('wait')).not.toMatch(/chr-z|chr-bang/)
    expect(v('off')).toBe(v('done').replace('data-state="done"', 'data-state="off"')) // 옛 done = 퇴근 꼴
  })
})

describe('상태별 수', () => {
  it('일함·쉼·대기·막힘·퇴근을 따로 센다(옛 done 은 퇴근)', async () => {
    const { stateCounts } = await import('../lib/actor.ts')
    const s = ['work', 'work', 'idle', 'blocked', 'off', 'done'].map((state) => ({ state }))
    expect(stateCounts(s)).toEqual([['work', 2], ['idle', 1], ['wait', 0], ['blocked', 1], ['off', 2]])
  })
})
