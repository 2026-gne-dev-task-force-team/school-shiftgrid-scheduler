// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { loadData } from '../data.ts'
import { EDITIONS, currentEdition } from '../lib/editions.ts'
import { createBand } from './band.ts'

describe('판 칩', () => {
  it('주소로 지금 판을 가른다 — 루트는 v1, 하위 경로가 먼저', () => {
    expect(currentEdition('/school-shiftgrid-scheduler/')).toBe('v1')
    expect(currentEdition('/school-shiftgrid-scheduler/v1.2/index.html')).toBe('v12')
    expect(currentEdition('/school-shiftgrid-scheduler/v1.2/')).toBe('v12')
    expect(currentEdition('/school-shiftgrid-scheduler/preview/index.html')).toBe('v12') // 넘겨주기 전 옛 주소
    expect(EDITIONS.find((e) => e.id === 'v12')?.path).toBe('/school-shiftgrid-scheduler/v1.2/')
    expect(currentEdition('/school-shiftgrid-scheduler/v2/x')).toBe('v2')
    expect(currentEdition('/')).toBe('v1')
  })
  it('칩 셋 · 링크는 설정 주소 · 지금 판만 눌린 모양', () => {
    const b = createBand(loadData(Date.now(), null), { onApply() {}, onFeedback() {}, onPurge() {}, calm: false, onCalm() {}, theme: 'auto', onTheme() {} })
    const a = [...b.editions.querySelectorAll<HTMLAnchorElement>('a')]
    expect(a.map((x) => x.getAttribute('href'))).toEqual(EDITIONS.map((e) => e.path))
    expect(a.map((x) => x.classList.contains('on'))).toEqual([true, false, false])
    b.dispose()
  })
})
