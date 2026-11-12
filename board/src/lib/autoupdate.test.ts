// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { AUTO_KEY, isTyping, loadAuto, saveAuto, shouldAutoApply } from './autoupdate.ts'
import { OUR_PREFIXES } from './purge.ts'
import { createBand } from '../ui/band.ts'
import { loadData } from '../data.ts'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }
const v = { build: 'b2', at: '', note: '' }
const base = { on: true, local: 'b1', latest: v, seen: '', typing: false }

describe('T-8v 새 판 자동 바꾸기', () => {
  it('꺼짐이면 버튼만(자동 안 함), 켜짐+새 판이면 바꾼다', () => {
    expect(shouldAutoApply({ ...base, on: false })).toBe(false)
    expect(shouldAutoApply(base)).toBe(true)
  })
  it('새 판이 없으면 안 한다', () => {
    expect(shouldAutoApply({ ...base, latest: null })).toBe(false)
    expect(shouldAutoApply({ ...base, local: 'b2' })).toBe(false)
  })
  it('같은 판으로 두 번 안 바꾼다(본 판 기록)', () => {
    expect(shouldAutoApply({ ...base, seen: 'b2' })).toBe(false)
    expect(shouldAutoApply({ ...base, seen: 'b2', latest: { ...v, build: 'b3' } })).toBe(true)
  })
  it('입력 중엔 미루고 끝나면 한다', () => {
    expect(shouldAutoApply({ ...base, typing: true })).toBe(false)
    expect(shouldAutoApply({ ...base, typing: false })).toBe(true)
  })
  it('입력 포커스 판정: 글칸·글상자는 입력 중, 체크박스·버튼·없음은 아님', () => {
    const mk = (tag: string, type?: string) => { const e = document.createElement(tag); if (type) (e as HTMLInputElement).type = type; return e }
    expect(isTyping(mk('input', 'text'))).toBe(true)
    expect(isTyping(mk('textarea'))).toBe(true)
    expect(isTyping(mk('input', 'checkbox'))).toBe(false)
    expect(isTyping(mk('button'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
  it('기본 꺼짐 · 기억 · 우리 이름표(비우기 대상)', () => {
    const s = mem()
    expect(loadAuto(s)).toBe(false)
    saveAuto(s, true); expect(loadAuto(s)).toBe(true)
    saveAuto(s, false); expect(loadAuto(s)).toBe(false)
    expect(OUR_PREFIXES.some((p) => AUTO_KEY.startsWith(p))).toBe(true)
  })
  it('막대 체크박스: 현재 값이 보이고 누르면 알린다', () => {
    const seen: boolean[] = []
    const b = createBand(loadData(Date.now(), null), { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme: 'auto', onTheme() {}, auto: true, onAuto: (on) => seen.push(on) })
    const box = b.auto.querySelector('input')!
    expect(box.checked).toBe(true)
    box.checked = false; box.dispatchEvent(new Event('change'))
    expect(seen).toEqual([false])
    b.dispose()
  })
})
