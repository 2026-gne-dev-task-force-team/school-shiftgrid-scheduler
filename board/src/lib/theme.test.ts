import { describe, expect, it } from 'vitest'
import { THEME_KEY, isDark, loadTheme, parseTheme, saveTheme } from './theme.ts'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m }
}

describe('화면 밝기 기억', () => {
  it('처음엔 기기 따라(auto)', () => { expect(loadTheme(mem())).toBe('auto') })
  it('고른 값을 board. 접두사 키로 저장하고 되살린다', () => {
    const s = mem()
    saveTheme(s, 'dark'); expect(s.raw.get(THEME_KEY)).toBe('dark'); expect(THEME_KEY.startsWith('board.')).toBe(true)
    expect(loadTheme(s)).toBe('dark')
    saveTheme(s, 'light'); expect(loadTheme(s)).toBe('light')
    saveTheme(s, 'auto'); expect(loadTheme(s)).toBe('auto')
  })
  it('엉뚱한 저장값은 auto', () => {
    expect(parseTheme('purple')).toBe('auto'); expect(parseTheme(null)).toBe('auto'); expect(parseTheme('')).toBe('auto')
  })
  it('auto 는 기기 설정(matchMedia)을 따르고 고정값은 따르지 않는다', () => {
    expect(isDark('auto', true)).toBe(true); expect(isDark('auto', false)).toBe(false)
    expect(isDark('light', true)).toBe(false); expect(isDark('dark', false)).toBe(true)
  })
})
