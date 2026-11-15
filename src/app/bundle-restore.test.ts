import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = new Map<string, unknown>()
let boom = false
vi.mock('./host.ts', () => ({
  appHost: { store: {
    get: async (k: string, fb: unknown) => { if (boom) throw new Error('x'); return mem.has(k) ? mem.get(k) : fb },
    set: async (k: string, v: unknown) => { mem.set(k, v); return true },
  } },
}))
import { restoreBundle, importBundle } from './bundle.ts'
import { getBundle, setBundle } from '../../shared/bundle/store.ts'

const MIN = { bundleVersion: 1, parts: {}, versions: {} }

describe('restoreBundle', () => {
  beforeEach(() => { mem.clear(); boom = false; setBundle(null) })
  it('저장소가 비면 null', async () => { expect(await restoreBundle()).toBe(false); expect(getBundle()).toBeNull() })
  it('깨진 값이면 null · 안 죽는다', async () => { mem.set('bundle', { garbage: 1 }); expect(await restoreBundle()).toBe(false); expect(getBundle()).toBeNull() })
  it('저장소가 던져도 안 죽는다', async () => { boom = true; expect(await restoreBundle()).toBe(false) })
  it('번들이 있으면 기동 뒤 그 번들', async () => {
    mem.set('bundle', MIN)
    expect(await restoreBundle()).toBe(true)
    expect(getBundle()).toEqual(MIN)
  })
  it('importBundle 은 넣고 저장한다 · 번들 아니면 저장 안 함', async () => {
    expect((await importBundle({ x: 1 })).ok).toBe(false); expect(mem.has('bundle')).toBe(false)
    expect((await importBundle(MIN)).ok).toBe(true); expect(mem.get('bundle')).toBe(getBundle())
  })
})
