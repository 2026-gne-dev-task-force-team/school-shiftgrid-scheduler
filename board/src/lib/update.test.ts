import { afterEach, describe, expect, it, vi } from 'vitest'
import { addFeedback, feedbackRows, hideFeedback, loadFeedback, loadHidden, removeFeedback } from './feedback.ts'
import { applyUpdate, loadSeen, SEEN_KEY } from './purge.ts'
import { fetchVersion, isNewer } from './version.ts'
import { loadData } from '../data.ts'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m } }
afterEach(() => vi.unstubAllGlobals())

describe('R39 새 판 알림', () => {
  it('같은 판이면 안 뜨고, 누른 판은 한 번만', () => {
    const v = { build: 'b2', at: '', note: '' }
    expect(isNewer('b1', v)).toBe(true)
    expect(isNewer('b2', v)).toBe(false)
    expect(isNewer('b1', v, 'b2')).toBe(false)
    expect(isNewer('b1', { ...v, build: 'b3' }, 'b2')).toBe(true)
  })
  it('가짜 fetch: version.json 의 build 로 비교한다', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ build: 'abc1234', at: 'x', note: 'n' }) }))
    expect(isNewer('abc1234', await fetchVersion())).toBe(false)
    expect(isNewer('old0000', await fetchVersion())).toBe(true)
  })
  it('[지금 바꾸기] = 서비스워커 해제 + 모든 캐시 삭제 + 본 판 기록 + 새 주소로 열기', async () => {
    const ls = mem(); const unreg = vi.fn(); const del = vi.fn(); const replace = vi.fn()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister: unreg }] } })
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache-v2-x', 'board.a'], delete: del })
    vi.stubGlobal('location', { pathname: '/preview/', replace })
    await applyUpdate('b2')
    expect(unreg).toHaveBeenCalledTimes(1)
    expect(del.mock.calls.map((c) => c[0])).toEqual(['workbox-precache-v2-x', 'board.a'])
    expect(ls.m.get(SEEN_KEY)).toBe('b2'); expect(loadSeen()).toBe('b2')
    expect(replace).toHaveBeenCalledWith('/preview/?v=b2')
  })
})

describe('R42 지운 불편', () => {
  it('지우면 Board 자료(카드·흐름 줄)에서 빠진다', () => {
    const s = mem(); vi.stubGlobal('localStorage', s)
    addFeedback('지울 것', '막대', s, 1000)
    const has = () => { const d = loadData(); return [d.tasks.some((t) => t.id === 'fb1000'), d.events.some((e) => e.subject_id === 'fb1000')] }
    expect(has()).toEqual([true, true])
    removeFeedback('fb1000', s)
    expect(has()).toEqual([false, false])
    expect(feedbackRows(loadFeedback(s), 'l').tasks).toHaveLength(0)
  })
  it('서버 사본은 숨김 목록으로 걸러진다(서버는 안 건드림)', () => {
    const s = mem(); vi.stubGlobal('localStorage', s)
    const fb = [{ id: 's1', text: 'x', where: '', ts: '2026-01-01T00:00:00Z' }]
    expect(loadData(0, { tables: null, feedback: fb }).serverFeedback).toHaveLength(1)
    hideFeedback('s1', s); hideFeedback('s1', s)
    expect(loadHidden(s)).toEqual(['s1'])
    expect(loadData(0, { tables: null, feedback: fb }).serverFeedback).toHaveLength(0)
  })
})
