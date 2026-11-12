import { describe, expect, it, vi } from 'vitest'
import { createBundlePlatform, createMemoryDocStore } from './bundle-platform'
import type { Doc } from './legacy/types/doc'

const doc = { meta: { name: '가' } } as unknown as Doc
const METHODS = ['openDoc', 'saveDoc', 'saveDocAs', 'autosave', 'loadAutosave', 'exportFile', 'importFile', 'print', 'recentFiles']

describe('bundle-platform', () => {
  it('v1 이 쓰는 9메서드가 다 있다', () => {
    const p = createBundlePlatform()
    for (const m of METHODS) expect(typeof (p as unknown as Record<string, unknown>)[m]).toBe('function')
  })
  it('autosave 는 저장이 아니라 dirty 표시로 간다', async () => {
    const store = createMemoryDocStore()
    const flush = vi.spyOn(store, 'flush')
    const p = createBundlePlatform(store)
    await p.autosave(doc)
    expect(store.dirty).toBe(true)
    expect(flush).not.toHaveBeenCalled()
    expect(await p.loadAutosave()).toBeNull()
  })
  it('saveDoc 은 모아 둔 것을 보내 dirty 를 끈다', async () => {
    const store = createMemoryDocStore()
    const p = createBundlePlatform(store)
    await p.autosave(doc)
    await p.saveDoc(doc)
    expect(store.dirty).toBe(false)
  })
  it('recentFiles 는 빈 목록', async () => {
    expect(await createBundlePlatform().recentFiles()).toEqual([])
  })
})
