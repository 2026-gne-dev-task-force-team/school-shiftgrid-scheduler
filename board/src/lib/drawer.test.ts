import { describe, expect, it } from 'vitest'
import { closesOnKey, escTarget, loadOpen, saveOpen } from './drawer.ts'

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
    expect(escTarget('Escape', true, true)).toBe('menu')
    expect(escTarget('Escape', false, true)).toBe('drawer')
    expect(escTarget('Escape', false, false)).toBe(null)
    expect(escTarget('a', true, true)).toBe(null)
  })
  it('Esc 는 열려 있을 때만 닫는다', () => {
    expect(closesOnKey('Escape', true)).toBe(true)
    expect(closesOnKey('Escape', false)).toBe(false)
    expect(closesOnKey('a', true)).toBe(false)
  })
})
