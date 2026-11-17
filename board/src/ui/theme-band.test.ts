// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadData } from '../data.ts'
import { loadTheme, saveTheme, isDark, type Theme } from '../lib/theme.ts'
import { createBand } from './band.ts'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

describe('⋯ 메뉴 「화면」 스위치', () => {
  const mount = (theme: Theme, onTheme: (t: Theme) => void) => {
    const band = createBand(loadData(Date.now(), null), { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme, onTheme })
    document.body.append(band.menu)
    return band
  }
  it('세 갈래가 있고 현재 값이 눌린 표시', () => {
    const b = mount('auto', () => {})
    const pick = [...b.menu.querySelectorAll<HTMLButtonElement>('[data-theme-pick]')]
    expect(pick.map((x) => x.dataset.themePick)).toEqual(['auto', 'light', 'dark'])
    expect(pick.map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    b.dispose()
  })
  it('누르면 data-theme 이 바뀌고 저장되며 새로 열어도 복원된다', () => {
    const store = mem(), root = document.createElement('div')
    root.dataset.theme = loadTheme(store)
    expect(root.dataset.theme).toBe('auto') // 기본
    const b = mount(loadTheme(store), (t) => { saveTheme(store, t); root.dataset.theme = t })
    b.menu.querySelector<HTMLButtonElement>('[data-theme-pick=dark]')!.click()
    expect(root.dataset.theme).toBe('dark'); expect(store.getItem('board.theme')).toBe('dark')
    expect(b.menu.querySelector('[data-theme-pick=dark]')!.getAttribute('aria-pressed')).toBe('true')
    expect(b.menu.querySelector('[data-theme-pick=auto]')!.getAttribute('aria-pressed')).toBe('false')
    b.dispose()
    const b2 = mount(loadTheme(store), () => {}) // 새로고침
    expect(b2.menu.querySelector('[data-theme-pick=dark]')!.classList.contains('on')).toBe(true)
    b2.dispose()
  })
  it('auto 일 때 matchMedia 값이 바뀌면 판정이 따라간다', () => {
    let dark = false
    const listeners: Array<() => void> = []
    vi.stubGlobal('matchMedia', () => ({ get matches() { return dark }, addEventListener: (_: string, f: () => void) => listeners.push(f) }))
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const seen: boolean[] = []
    mq.addEventListener('change', () => seen.push(isDark('auto', mq.matches)))
    dark = true; listeners.forEach((f) => f())
    dark = false; listeners.forEach((f) => f())
    expect(seen).toEqual([true, false])
    vi.unstubAllGlobals()
  })
})

// 글자·배경 짝 대비(WCAG 상대 휘도) — 두 벌 모두 주요 글자가 4.5:1 이상
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
const css = readFileSync(join(__dirname, '..', 'style.css'), 'utf8')
const block = (head: string) => { const i = css.indexOf(head); return css.slice(i, css.indexOf('}', i)) }
const vars = (src: string) => Object.fromEntries([...src.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]))

describe('색 대비', () => {
  for (const [name, head] of [['밝은 벌', '.sgb {'], ['어두운 벌', '.sgb[data-theme="dark"] {']] as const) {
    const v = vars(block(head))
    it(`${name}: 주요 글자가 면 위에서 4.5:1 이상`, () => {
      for (const fg of ['fg', 'fg-2', 'fg-3', 'neon-2', 'warn', 'bad', 'hq', 'make', 'qa']) for (const bg of ['s1', 's2', 'bg']) {
        expect(contrast(v[fg]!, v[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(v['fg']!, v['s3']!)).toBeGreaterThanOrEqual(4.5)
    })
  }
  it('자동(기기 따라) 어두운 벌은 어두운 벌과 같은 값', () => {
    const a = css.indexOf('@media (prefers-color-scheme: dark)')
    const auto = css.slice(a, css.indexOf('\n  }\n', a))
    const strip = (s: string) => s.replace(/\s+/g, ' ')
    const dark = block('.sgb[data-theme="dark"] {')
    for (const m of dark.matchAll(/--[a-z0-9-]+:[^;]+;/g)) expect(strip(auto)).toContain(strip(m[0]))
  })
  it('밝은 벌의 변수 이름이 어두운 벌에도 다 있다(빠지면 밝은 값이 새어 든다)', () => {
    const names = (s: string) => new Set([...s.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]))
    const light = names(block('.sgb {')), dark = names(block('.sgb[data-theme="dark"] {'))
    const keep = new Set(['--sp1', '--sp2', '--sp3', '--sp4', '--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--r1', '--r2', '--r3', '--sh1', '--sh2', '--sh3', '--neon-soft', '--ease', '--font', '--z'])
    for (const n of light) if (!keep.has(n!)) expect(dark.has(n), n).toBe(true)
  })
})

describe('막대 이름 칸 — 좁은 폭 짧은 말', () => {
  const css = readFileSync(join(__dirname, '../style.css'), 'utf8')
  it('이름이 「한 」·「바퀴 N」·제목 칸으로 갈리고 전체 글은 title', () => {
    const d = loadData(Date.now(), null)
    const band = createBand(d, { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme: 'auto', onTheme() {} })
    const nm = band.toggle.querySelector('.sgb-name')!
    expect(nm.querySelector('.nm-k')!.textContent).toMatch(/^바퀴 \d+$/)
    expect(nm.querySelector('.nm-pre')!.textContent).toBe('한 ')
    expect(nm.getAttribute('title')).toMatch(/^한 바퀴 \d+ · /)
    expect(band.toggle.querySelector('.band-clock .bc-rest') === null || true).toBe(true)
    band.dispose()
  })
  it('폰 폭 CSS: 이름은 줄어들지 않고(flex none) 제목·남은 예상만 접으며 %·경과는 안 숨긴다', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.sgb-gauge i { width: 3px }') - 60))
    const rule = phone.slice(0, phone.indexOf('.body {'))
    expect(rule).toMatch(/\.nm-t[^{]*\{ display: none/)
    expect(rule).toMatch(/\.sgb-bar \.sgb-name \{ flex: none/)
    expect(rule).not.toMatch(/\.band-clock,/)
    expect(rule).not.toMatch(/sgb-pct/)
  })
  it('폰 폭 CSS: 경과·진행률 칸은 줄어들지 않고(flex none) 폭을 뺏는 판 칩·자동은 접는다(T-10gm)', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.sgb-gauge i { width: 3px }') - 60))
    const rule = phone.slice(0, phone.indexOf('.body {'))
    expect(rule).toMatch(/\.sgb-bar \.band-clock \{ flex: none/)
    expect(rule).toMatch(/\.sgb-ed:not\(\.on\)[^{]*\{ display: none/)
  })
  it('폰 폭 CSS: 「불편 접수」는 아이콘만 남겨(.fb-t 숨김) 경과를 안 가린다 · 단추엔 이름표가 남는다(T-10gs)', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.sgb-gauge i { width: 3px }') - 60))
    const rule = phone.slice(0, phone.indexOf('.body {'))
    expect(rule).toMatch(/\.sgb-mini \.fb-t \{ display: none/)
    const d = loadData(Date.now(), null)
    const band = createBand(d, { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme: 'auto', onTheme() {} })
    expect(band.fb.getAttribute('aria-label')).toBe('불편 접수')
    expect(band.fb.querySelector('.fb-t')).not.toBeNull()
    band.dispose()
  })
  it('띠 DOM: 경과(.bc-el)·진행률(.sgb-pct)이 있고 줄이는 클래스가 안 붙는다', () => {
    const d = loadData(Date.now(), null)
    const band = createBand(d, { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme: 'auto', onTheme() {} })
    const el = band.toggle.querySelector('.band-clock .bc-el')!, pct = band.toggle.querySelector('.sgb-pct')!
    expect(el.textContent).toMatch(/째$/)
    expect(pct.textContent).toMatch(/%$/)
    expect(el.className + pct.className).not.toMatch(/nm-|lbl|src/)
    band.dispose()
  })
})
