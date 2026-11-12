import { describe, expect, it, vi } from 'vitest'
import { replaceFlow } from './replace'
import type { ReplaceDeps } from './replace'
import type { Issue } from '../../../shared/check'
import type { Doc } from './legacy/types/doc'

const file = { doc: { meta: { name: '새' } } as unknown as Doc, path: 'a.json' }
const cur = { meta: { name: '지금' } } as unknown as Doc
const err: Issue = { id: 'x', severity: 'error', where: 'doc', message: '깨짐' }
const warn: Issue = { id: 'y', severity: 'warn', where: 'doc', message: '주의' }

function mk(over: Partial<ReplaceDeps> = {}, log: string[] = []): ReplaceDeps {
  return {
    pick: async () => file,
    check: () => [],
    reject: () => void log.push('reject'),
    confirm: async () => (log.push('confirm'), true),
    current: () => cur,
    backup: async () => void log.push('backup'),
    ...over,
  }
}

describe('replaceFlow 순서', () => {
  it('검사 실패면 확인이 안 뜬다', async () => {
    const log: string[] = []
    const r = await replaceFlow(mk({ check: () => [err] }, log))
    expect(r).toEqual({ result: 'rejected', file: null })
    expect(log).toEqual(['reject'])
  })
  it('확인을 취소하면 안 바뀌고 받기도 안 한다', async () => {
    const log: string[] = []
    const r = await replaceFlow(mk({ confirm: async () => (log.push('confirm'), false) }, log))
    expect(r.file).toBeNull()
    expect(log).toEqual(['confirm'])
  })
  it('확인하면 자동 받기가 바꾸기(file 돌려줌)보다 먼저다', async () => {
    const log: string[] = []
    const r = await replaceFlow(mk({}, log))
    expect(log).toEqual(['confirm', 'backup'])
    expect(r).toEqual({ result: 'replaced', file })
  })
  it('경고만 있으면 확인에 같이 보이고 진행된다', async () => {
    const confirm = vi.fn(async () => true)
    const r = await replaceFlow(mk({ check: () => [warn], confirm }))
    expect(confirm).toHaveBeenCalledWith([warn], file)
    expect(r.result).toBe('replaced')
  })
  it('받기가 실패하면 덮지 않는다', async () => {
    const r = await replaceFlow(mk({ backup: async () => { throw new Error('x') } }))
    expect(r).toEqual({ result: 'backup-failed', file: null })
  })
  it('파일 고르기 취소면 아무것도 안 한다', async () => {
    const log: string[] = []
    const r = await replaceFlow(mk({ pick: async () => null }, log))
    expect(r.result).toBe('no-file')
    expect(log).toEqual([])
  })
})
