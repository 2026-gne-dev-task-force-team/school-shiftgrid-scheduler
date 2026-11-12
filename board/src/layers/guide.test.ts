import { expect, it } from 'vitest'
import { sourceNote } from './guide.ts'

it('안내 문구는 자료 출처를 따른다', () => {
  expect(sourceNote('server')).toContain('Live')
  expect(sourceNote('mock')).toContain('Mock')
})
