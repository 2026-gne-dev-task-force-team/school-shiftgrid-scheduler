// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { h } from '../dom.ts'

it('번호 꼬리표는 제목 앞 고정폭 칸으로 렌더된다', () => {
  const card = h('div', null, h('code', { class: 'tid' }, 'T-7a'), h('b', null, '자료 나르기'))
  expect(card.firstElementChild?.className).toBe('tid')
  expect(card.textContent).toBe('T-7a자료 나르기')
})
