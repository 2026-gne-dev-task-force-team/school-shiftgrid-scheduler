import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPS, appOf, asApp, editionOfApp, filterByApp, isInjected, readApp, versionCheckOn } from './app.ts'
import { addFeedback, feedbackRows, loadFeedback, setReview } from './feedback.ts'
import { loadData } from '../data.ts'
import type { BoardData, Task } from '../types.ts'

const t = (id: string, app?: string): Task => ({ id, title: id, category: 'c', kind: 'work', team: 't', sprint: 0, est_min: 0, started_at: null, lane_id: 'l', column: 'wait', reason: 'new', actor_id: null, updated_at: '', ...(app ? { app } : {}) })
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }
const base = (): BoardData => ({ actors: [{ id: 'a1', task_id: 'x2' } as never, { id: 'a0', task_id: null } as never], tasks: [t('x1'), t('x2', 'v2'), t('x3', 'v1'), t('x4', '1.2v')],
  lanes: [], branches: [], services: [], modules: [], goals: [], events: [{ id: 'e', subject_type: 'task', subject_id: 'x2' } as never], usage: [], runs: [], sprints: [],
  serverFeedback: [{ id: 'f1', text: 'a', where: '', ts: '' }, { id: 'f2', text: 'b', where: '', ts: '', app: 'v2' }] })

describe('판 구분 data-app', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('data-app 셋에서 그 판 것만 남는다', () => {
    const ids = (a: (typeof APPS)[number]) => filterByApp(base(), a).tasks.map((x) => x.id)
    expect(ids('v1')).toEqual(['x3'])
    expect(ids('1.2v')).toEqual(['x1', 'x4'])
    expect(ids('v2')).toEqual(['x2'])
    expect(filterByApp(base(), 'v1').actors.map((a) => a.id)).toEqual(['a0']) // 다른 판 일감에 매인 캐릭터·흐름 줄도 빠진다
    expect(filterByApp(base(), 'v1').events).toEqual([])
    expect(filterByApp(base(), 'v2').serverFeedback?.map((f) => f.id)).toEqual(['f2'])
  })
  it('옛 자료(app 칸 없음·엉뚱한 값)는 1.2v', () => {
    expect(appOf(t('a'))).toBe('1.2v')
    expect(appOf({ app: 'zzz' })).toBe('1.2v')
    expect(asApp(undefined)).toBe('1.2v')
    const el = (v: string | null) => ({ getAttribute: () => v }) as unknown as Element
    vi.stubGlobal('document', { documentElement: el(null) })
    expect(readApp(el(null))).toBe('1.2v')
    expect(readApp()).toBe('1.2v')
    expect(readApp(el('v2'))).toBe('v2')
    expect(readApp(el('v3'))).toBe('1.2v')
    expect(editionOfApp('1.2v')).toBe('v12')
    expect(feedbackRows([{ id: 'f', text: 'x', where: '', ts: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-02T00:00:00Z', direction: 'd' }], 'l').tasks[0].app).toBe('1.2v')
  })
  it('접수에 app 이 실리고 그 판에서만 보인다', () => {
    const s = mem()
    expect(addFeedback('v2 불편', '막대', s, 1, 'v2')).toEqual({ ok: true })
    addFeedback('기본 불편', '막대', s, 2)
    expect(loadFeedback(s).map((f) => f.app)).toEqual(['v2', '1.2v'])
    setReview('fb1', '방향', s); setReview('fb2', '방향', s)
    vi.stubGlobal('localStorage', { ...s, removeItem() {} })
    {
      const mine = (a: 'v1' | '1.2v' | 'v2') => loadData(Date.now(), null, a).tasks.filter((x) => x.kind === 'bug' && x.id.startsWith('fb')).map((x) => x.title)
      expect(mine('v2')).toEqual(['방향 · v2 불편'])
      expect(mine('1.2v')).toEqual(['방향 · 기본 불편'])
      expect(mine('v1')).toEqual([])
    }
  })
})

describe('주입 자리 구분', () => {
  it('v1·v2 는 주입, 1.2v·없음·엉뚱은 단독 — 판 확인은 단독에서만', () => {
    expect(['v1', 'v2'].map((a) => isInjected(asApp(a)))).toEqual([true, true])
    expect([undefined, '1.2v', 'zz'].map((a) => isInjected(asApp(a)))).toEqual([false, false, false])
    expect(versionCheckOn('v1')).toBe(false); expect(versionCheckOn('v2')).toBe(false); expect(versionCheckOn('1.2v')).toBe(true)
  })
})
