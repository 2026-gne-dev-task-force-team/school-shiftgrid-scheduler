// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { tagChipSpecs, tagChips } from './tag-chips.ts'

describe('카드 꼬리표 칩 둘', () => {
  it('대상 · 유형 칩을 그린다', () => {
    const els = tagChips({ kind: 'bug', target: '장치' })
    expect(els.map((e) => e.textContent)).toEqual(['장치', '결함'])
    expect(els[0].className).toContain('tag-target')
    expect(els[1].className).toContain('tag-kind')
  })
  it('미분류는 흐리게', () => expect(tagChips({ kind: 'work', target: '미분류' })[0].className).toContain('muted'))
  it('target 이 없는 옛 자료는 유형 칩만', () => expect(tagChipSpecs({ kind: 'cr' }).map((c) => c.text)).toEqual(['설계']))
})
