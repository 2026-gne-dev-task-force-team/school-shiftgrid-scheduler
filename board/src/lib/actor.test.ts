import { expect, it } from 'vitest'
import { cardNo } from './actor.ts'

it('cardNo — 레인 카드 속 id 는 사람이 읽는 표 번호만 보인다', () => {
  expect(cardNo('l-e75ded-T-N1')).toBe('T-N1') // NAS 레인 태스크
  expect(cardNo('l-31aee5-T-10fi')).toBe('T-10fi')
  expect(cardNo('l-e75ded-R4')).toBe('R4')
})
it('cardNo — 한 표에 두 번 나와 해시로 민 중복 카드는 번호가 없다(빈 값)', () => {
  expect(cardNo('l-e75ded-86976f7e')).toBe('')
  expect(cardNo('l-e75ded-b045a076')).toBe('')
})
it('cardNo — 레인 카드가 아닌 번호(R55·T-1a)는 그대로', () => {
  expect(cardNo('R55')).toBe('R55')
  expect(cardNo('T-1a')).toBe('T-1a')
  expect(cardNo('g5')).toBe('g5')
})
