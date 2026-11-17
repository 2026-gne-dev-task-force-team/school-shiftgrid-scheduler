// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createStage } from './stage.ts'

const 층 = (desc: string) => ({ id: 'x', desc, render() {} }) as never

describe('설명 줄은 타자기 없이 첫 렌더에 전부 (R119)', () => {
  it('show 직후 바로 전체 글', () => {
    const s = createStage()
    s.show(층('가'.repeat(100)), {} as never)
    expect(s.el.querySelector('.tab-desc')!.textContent!.length).toBe(100)
  })
})
