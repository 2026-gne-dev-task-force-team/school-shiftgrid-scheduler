import { describe, it, expect, beforeEach } from 'vitest'
import { adoptBundle, setBundlePersist, getBundle, setBundle } from './store.ts'

const MIN = { bundleVersion: 1, parts: {}, versions: {} }

describe('adoptBundle', () => {
  const saved: unknown[] = []
  beforeEach(() => { saved.length = 0; setBundle(null); setBundlePersist((b) => { saved.push(b) }) })
  it('번들이면 넣고 저장 길로도 보낸다', async () => {
    expect((await adoptBundle(JSON.stringify(MIN))).ok).toBe(true)
    expect(getBundle()).toEqual(MIN); expect(saved).toEqual([MIN])
  })
  it('v1·깨진 파일은 안 바꾸고 저장도 안 한다', async () => {
    expect((await adoptBundle({ meta: {} })).ok).toBe(false)
    expect((await adoptBundle('{"a":')).ok).toBe(false)
    expect(getBundle()).toBeNull(); expect(saved).toEqual([])
  })
  it('저장이 던져도 넣기는 유지 · 실패를 돌려준다', async () => {
    setBundlePersist(() => { throw new Error('x') })
    expect((await adoptBundle(MIN)).ok).toBe(false); expect(getBundle()).toEqual(MIN)
  })
})
