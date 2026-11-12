import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

type Env = Parameters<StaleRecover['recover']>[0]
interface StaleRecover { recover: (e: any) => Promise<boolean>; isEntryScript: (t: any) => boolean; KEY: string }

function load(): StaleRecover {
  const root: any = {}
  new Function('root', readFileSync(new URL('../../public/stale-recover.js', import.meta.url), 'utf8').replace(/\}\)\(typeof window[\s\S]*$/, '})(root)'))(root)
  return root.__staleRecover
}
function mkEnv(flag?: string) {
  const store = new Map<string, string>(flag ? [['sg-stale-recover', flag]] : [])
  const calls = { reload: 0, unreg: 0, del: 0 }
  const env: Env = {
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    sw: { getRegistrations: async () => [{ unregister: async () => void calls.unreg++ }] },
    caches: { keys: async () => ['a', 'b'], delete: async () => void calls.del++ },
    reload: () => void calls.reload++,
  }
  return { env, calls, store }
}

describe('stale-recover', () => {
  it('깃발이 없으면 SW 해제·캐시 삭제 후 정확히 한 번 새로고침', async () => {
    const { recover } = load()
    const { env, calls, store } = mkEnv()
    expect(await recover(env)).toBe(true)
    expect(calls).toEqual({ reload: 1, unreg: 1, del: 2 })
    expect(store.get('sg-stale-recover')).toBe('1')
    expect(await recover(env)).toBe(false)
    expect(calls.reload).toBe(1)
  })
  it('깃발이 있으면 아무것도 안 한다', async () => {
    const { recover } = load()
    const { env, calls } = mkEnv('1')
    expect(await recover(env)).toBe(false)
    expect(calls).toEqual({ reload: 0, unreg: 0, del: 0 })
  })
  it('assets 의 module script 만 진입 스크립트로 본다', () => {
    const { isEntryScript } = load()
    expect(isEntryScript({ tagName: 'SCRIPT', type: 'module', src: 'https://x/v1.2/assets/main-A.js' })).toBe(true)
    expect(isEntryScript({ tagName: 'IMG', src: 'https://x/assets/a.png' })).toBe(false)
    expect(isEntryScript({ tagName: 'SCRIPT', type: '', src: 'https://x/stale-recover.js' })).toBe(false)
  })
})
