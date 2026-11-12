import { describe, expect, it } from 'vitest'
import { closesOnKey, escTarget, loadOpen, saveOpen, seedOpen } from './drawer.ts'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('서랍 열림 기억', () => {
  it('처음엔 닫혀 있고 저장한 값을 되살린다', () => {
    const s = mem()
    expect(loadOpen(s)).toBe(false)
    saveOpen(s, true); expect(loadOpen(s)).toBe(true)
    saveOpen(s, false); expect(loadOpen(s)).toBe(false)
  })
  it('Esc 는 메뉴가 열려 있으면 메뉴만 닫는다', () => {
    expect(escTarget('Escape', true, true, true)).toBe('menu')
    expect(escTarget('Escape', false, true, true)).toBe('detail')
    expect(escTarget('Escape', false, false, true)).toBe('drawer')
    expect(escTarget('Escape', false, false, false)).toBe(null)
    expect(escTarget('a', true, true, true)).toBe(null)
  })
  it('Esc 는 열려 있을 때만 닫는다', () => {
    expect(closesOnKey('Escape', true)).toBe(true)
    expect(closesOnKey('Escape', false)).toBe(false)
    expect(closesOnKey('a', true)).toBe(false)
  })
})

describe('첫 방문 서랍', () => {
  it('단독 실행(1.2v)은 열고 주입된 v1·v2 는 닫는다', () => {
    const a = mem(); seedOpen(a, false); expect(loadOpen(a)).toBe(true)
    const b = mem(); seedOpen(b, true); expect(loadOpen(b)).toBe(false)
  })
  it('저장값이 있으면 그 값을 지킨다', () => {
    const a = mem(); saveOpen(a, false); seedOpen(a, false); expect(loadOpen(a)).toBe(false)
    const b = mem(); saveOpen(b, true); seedOpen(b, true); expect(loadOpen(b)).toBe(true)
  })
})
