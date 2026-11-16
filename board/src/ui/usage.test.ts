// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Usage } from '../types.ts'
import { speedLine, usagePanel } from './usage.ts'

const u = (account: Usage['account'], ts: string, p5: number, tok = 0): Usage => ({ account, ts, pct_5h: p5, pct_7d: 1, reset_5h_at: ts, reset_7d_at: ts, tok_per_min: tok })

describe('한도와 속도 반반', () => {
  it('기관만 있으면 왼쪽 기관 · 오른쪽 개인은 「기록 없음」 자리만', () => {
    const el = usagePanel([u('org', '2026-11-16T01:00:00Z', 40)])
    const [l, r] = Array.from(el.children) as HTMLElement[]
    expect(l.dataset.acc).toBe('org')
    expect(l.querySelectorAll('.meter').length).toBe(2)
    expect(r.dataset.acc).toBe('personal')
    expect(r.textContent).toContain('기록 없음')
    expect(r.querySelector('.meter')).toBeNull()
  })
  it('둘 다 있으면 둘 다 미터를 그린다 · 둘 다 없으면 둘 다 기록 없음', () => {
    const both = usagePanel([u('org', '2026-11-16T01:00:00Z', 40), u('personal', '2026-11-16T01:00:00Z', 10)])
    expect(both.querySelectorAll('.meter').length).toBe(4)
    expect(usagePanel([]).querySelectorAll('.empty').length).toBe(2)
  })
})

describe('속도 줄', () => {
  const a = u('org', 't1', 1, 0), b = u('org', 't2', 2, 0)
  it('토큰 속도가 0(한도 파일엔 토큰이 없음)이면 줄을 감춘다 — 「분당 0 ↘」 거짓 방지', () => {
    expect(speedLine(b, a)).toBe('')
  })
  it('값이 있으면 보이고, 두 줄 다 값이 있을 때만 추세', () => {
    expect(speedLine({ ...b, tok_per_min: 500 }, a)).toBe('지금 분당 500 토큰')
    expect(speedLine({ ...b, tok_per_min: 500 }, { ...a, tok_per_min: 300 })).toContain('빨라지는')
    expect(speedLine({ ...b, tok_per_min: 100 }, { ...a, tok_per_min: 300 })).toContain('느려지는')
  })
  it('한도 % 기울기: 최근 두 줄 기준 남은 시간', () => {
    const el = usagePanel([u('org', '2026-11-16T01:00:00Z', 40), u('org', '2026-11-16T02:00:00Z', 50)])
    expect(el.querySelector('.meter small')?.textContent).toContain('이 속도면')
  })
})
