import { describe, it, expect, vi } from 'vitest'

const mem = new Map<string, unknown>()
vi.mock('./host.ts', () => ({
  appHost: { store: {
    get: async (k: string, fb: unknown) => (mem.has(k) ? mem.get(k) : fb),
    set: async (k: string, v: unknown) => { mem.set(k, v); return true },
  } },
}))

// 합성 번들: 목요일 한 칸 · 반 7-1 · 과학.
const BUNDLE = { bundleVersion: 1, versions: {}, parts: { doc: {
  specs: [{ id: 'sp', activeDays: [0, 1, 2, 3, 4], slots: [{ index: 0, label: '1교시', start: '09:00', end: '09:40' }] }],
  tracks: [{ id: 't', name: '7-1', grade: 7, specId: 'sp' }],
  timetables: [{ id: 'tt', specId: 'sp', startDate: '2026-03-01', priority: 1 }],
  assignments: [{ timetableId: 'tt', trackId: 't', dayIndex: 3, slotIndex: 0, activityId: 'a1' }],
  activities: [{ id: 'a1', name: '과학' }],
} } }

describe('번들 영속 사슬: adopt → 영속 → 모듈 초기화 → restore → lessonsOn', () => {
  it('새로 고친 뒤에도 번들 수업 칸이 나온다', async () => {
    const a = await import('./bundle.ts')
    expect((await a.importBundle(BUNDLE)).ok).toBe(true)
    expect(mem.has('bundle')).toBe(true)

    vi.resetModules() // 새로 고침: 모듈 상태가 날아간다. 저장소(mem)만 남는다.
    const b = await import('./bundle.ts')
    const src = await import('../plugins/ops-aux/source.ts')
    expect(b.getBundle()).toBeNull()
    expect(await b.restoreBundle()).toBe(true)
    expect(src.defaultAuxSource.lessonsOn('2026-11-19').map((l) => `${l.trackName}/${l.subject}`)).toEqual(['7-1/과학'])
  })
})
