import { describe, expect, it } from 'vitest'
import { bodyColor, characterSvg, eyeColor, propOf } from './character.ts'
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
    expect(v).toContain('shape-rendering="crispEdges"'); expect(v).toContain(bodyColor(A)); expect(v).not.toMatch(/<(path|circle|ellipse)/)
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
    expect(characterSvg({ ...A, role: '<a"b>' })).toContain('&#60;a&#34;b&#62;"')
    expect(characterSvg({ ...A, job: '지휘' })).toContain('aria-label="모래 · 지휘"') // 「이름 · 직업」
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

describe('R69 구별', () => {
  it('몸통 색조가 이름마다 갈래지고 같은 이름은 같다', () => {
    const names = ['모래', '솔', '별', '달', '강', '숲', '돌', '샘']
    expect(new Set(names.map((name) => bodyColor({ name }))).size).toBeGreaterThan(1)
    expect(bodyColor({ name: '솔' })).toBe(bodyColor({ name: '솔' }))
    const n = names.find((x) => bodyColor({ name: x }) !== bodyColor(A))!
    expect(characterSvg({ ...A, name: n })).not.toBe(characterSvg(A))
  })
  it('역할 여덟이 다 다른 SVG', () => {
    const rs = ['지휘', '살림', '설계', '화면', '자료', '시험', '맨눈', '감독']
    expect(new Set(rs.map((role) => characterSvg({ ...A, prop: '', role }))).size).toBe(8)
  })
})

describe('R74 종족', () => {
  it('종족 넷은 서로·사람과 다르고, 없거나 모르는 값은 사람과 같다', () => {
    const v = (race?: string) => characterSvg({ ...A, race })
    expect(new Set(['elf', 'dwarf', 'orc', 'ghost', undefined].map(v)).size).toBe(5)
    expect(v('???')).toBe(v(undefined)); expect(v('human')).toBe(v())
  })
  it('소품만 얹는다 — 역할 소품은 그대로 함께 보이고 크기도 안 키운다', () => {
    const base = characterSvg({ ...A, role: '지휘' })
    for (const race of ['elf', 'dwarf', 'orc', 'ghost']) {
      const s = characterSvg({ ...A, role: '지휘', race })
      expect(s).toContain('fill="#E5484D"')
      expect(s.length - base.length).toBeLessThan(260)
    }
  })
  it('쓰러짐(한도 초과) — 눈 X · 방향 표시 · 표지(Z·!) 없음 · 평소엔 흔적이 없다', () => {
    const plain = characterSvg(A, 'chip', null), down = characterSvg({ ...A, state: 'idle' }, 'chip', 3)
    expect(plain).not.toContain('chr-x'); expect(plain).not.toContain('data-ko')
    expect(down).toContain('class="chr chr-x"'); expect(down).toContain('data-ko="3"'); expect(down).toContain('#6b1f2a')
    expect(down).not.toContain('chr-z'); expect(characterSvg({ ...A, state: 'blocked' }, 'chip', 0)).not.toContain('chr-bang')
    expect(down).toContain('쓰러짐'); expect(down).toContain('data-state="idle"') // 상태는 그대로 남아 CSS 흐림 규칙 등이 가른다
    // 기본값은 모듈 스위치(setKo) 를 따른다
    expect(characterSvg(A)).toBe(plain)
  })
})

describe('상태별 수', () => {
  it('일함·쉼·대기·막힘·퇴근을 따로 센다(옛 done 은 퇴근)', async () => {
    const { stateCounts } = await import('../lib/actor.ts')
    const s = ['work', 'work', 'idle', 'blocked', 'off', 'done'].map((state) => ({ state }))
    expect(stateCounts(s)).toEqual([['work', 2], ['idle', 1], ['wait', 0], ['blocked', 1], ['off', 2]])
  })
})
