import { describe, expect, it } from 'vitest'
// @ts-expect-error mjs
import { raceOfDevice } from './race.mjs'
import { raceText } from '../src/ui/character.ts'

describe('기기 → 종족', () => {
  it('짝 넷', () => {
    expect(raceOfDevice('맥')).toBe('elf')
    expect(raceOfDevice('업무PC')).toBe('dwarf')
    expect(raceOfDevice('씽크패드')).toBe('orc')
    expect(raceOfDevice('NAS')).toBe('ghost')
  })
  it('그 밖·없음 = 값 없음(사람)', () => {
    expect(raceOfDevice('노트북')).toBeUndefined()
    expect(raceOfDevice(undefined)).toBeUndefined()
  })
  it('화면 글: 넷이 서로 다르고 모르면 빈 글', () => {
    const t = ['elf', 'dwarf', 'orc', 'ghost'].map((race) => raceText({ race }))
    expect(new Set(t).size).toBe(4)
    expect(raceText({ race: 'orc' })).toBe('씽크패드 · 오크')
    expect(raceText({})).toBe('')
  })
})
