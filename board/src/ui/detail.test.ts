// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDetail } from './detail.ts'

const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8')

describe('옆 상세 따라오기 (T-10cc)', () => {
  it('옆 칸 상세는 data-layout=side 로 그려진다(sticky 규칙의 걸림 자리)', () => {
    const d = createDetail()
    expect(d.el.dataset.layout).toBe('side')
    expect(d.el.classList.contains('detail')).toBe(true)
  })
  it('데스크톱 미디어 쿼리 안에서 sticky + align-self:start + 자체 스크롤이 걸린다', () => {
    const m = css.match(/@media \(min-width: 768px\) \{ \.detail\[data-layout=side\]:not\(\.full\) \{([^}]*)\}/)
    expect(m).not.toBeNull()
    const rule = m![1]!
    expect(rule).toContain('position: sticky')
    expect(rule).toContain('align-self: start')
    expect(rule).toMatch(/max-height: calc\(100dvh/)
    expect(rule).toContain('overflow-y: auto')
  })
})
