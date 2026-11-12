import { describe, expect, it, vi } from 'vitest'
import { addFeedback, FEEDBACK_KEY, feedbackRows, loadFeedback, mergeInbox, removeFeedback, setReview, setStatus, statusOf } from './feedback.ts'
import { fetchRemote, reviewRemote } from './remote.ts'

function store(init?: string) {
  const m = new Map<string, string>(init ? [[FEEDBACK_KEY, init]] : [])
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('접수 상태', () => {
  it('옛 자료(상태 없음)는 접수로 읽고, 바꾸면 저장되고 카드 열이 따라간다', () => {
    const s = store(JSON.stringify([{ id: 'a', text: '옛', where: '막대', ts: '2026-01-01T00:00:00Z' }]))
    expect(statusOf(loadFeedback(s)[0])).toBe('new')
    expect(feedbackRows(loadFeedback(s), 'l').tasks).toHaveLength(0)
    expect(setReview('a', '  ', s).ok).toBe(false)
    expect(setReview('a', '이 방향으로', s).ok).toBe(true)
    expect(feedbackRows(loadFeedback(s), 'l').tasks[0].column).toBe('wait')
    setStatus('a', 'review', s)
    expect(feedbackRows(loadFeedback(s), 'l').tasks[0].column).toBe('work')
    setStatus('a', 'closed', s)
    expect(loadFeedback(s)[0].status).toBe('closed')
    expect(feedbackRows(loadFeedback(s), 'l').tasks[0].column).toBe('done')
    setStatus('a', 'bogus' as never, s)
    expect(loadFeedback(s)[0].status).toBe('closed')
  })
  it('지우기', () => {
    const s = store()
    addFeedback('하나', '막대', s, 1000); addFeedback('둘', '막대', s, 2000)
    removeFeedback('fb1000', s)
    expect(loadFeedback(s).map((f) => f.text)).toEqual(['둘'])
  })
  it('접수함 합치기 — 이 기기 + 서버, 최신순', () => {
    const l = [{ id: 'l1', text: 'a', where: '', ts: '2026-01-02T00:00:00Z' }]
    const sv = [{ id: 's1', text: 'b', where: '', ts: '2026-01-03T00:00:00Z' }, { id: 's0', text: 'c', where: '', ts: '2026-01-01T00:00:00Z' }]
    const m = mergeInbox(l, sv)
    expect(m.map((x) => x.id)).toEqual(['s1', 'l1', 's0'])
    expect(m.map((x) => x.origin)).toEqual(['server', 'local', 'server'])
  })
})

describe('remote', () => {
  const env = { url: 'https://x.test', key: 'k' }
  const rows = (n: string) => (n === 'feedback' ? [{ id: 's1', text: '서버글', place: '막대', ts: '2026-01-01T00:00:00Z' }] : [{ id: n }])
  const ok = (empty: string[] = []) => vi.fn(async (u: string) => {
    const n = /rest\/v1\/(\w+)/.exec(u)![1]
    return { ok: true, status: 200, json: async () => (empty.includes(n) ? [] : rows(n)) } as Response
  }) as unknown as typeof fetch

  it('env 없으면 null 이고 요청도 없다', async () => {
    const f = vi.fn() as unknown as typeof fetch
    expect(await fetchRemote({}, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
  it('성공 — 표와 feedback(place→where)', async () => {
    const f = ok()
    const r = await fetchRemote(env, f)
    expect(r!.tables!.tasks).toEqual([{ id: 'tasks' }])
    expect(r!.feedback).toEqual([{ id: 's1', text: '서버글', where: '막대', ts: '2026-01-01T00:00:00Z' }])
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers['Accept-Profile']).toBe('board')
  })
  it('표 하나 실패 — 목업(tables null), 서버 feedback 은 살린다', async () => {
    const f = vi.fn(async (u: string) => (u.includes('/goals?')
      ? ({ ok: false, status: 500, json: async () => [] } as Response)
      : ({ ok: true, status: 200, json: async () => rows(/rest\/v1\/(\w+)/.exec(u)![1]) } as Response))) as unknown as typeof fetch
    const r = await fetchRemote(env, f)
    expect(r!.tables).toBeNull()
    expect(r!.feedback).toHaveLength(1)
  })
  it('tasks 가 비면 목업', async () => {
    const r = await fetchRemote(env, ok(['tasks']))
    expect(r!.tables).toBeNull()
    expect(r!.feedback).toHaveLength(1)
  })
})

describe('reviewRemote', () => {
  const env = { url: 'https://x.test', key: 'k' }
  const res = (status: number, body: unknown = []) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response) as unknown as typeof fetch
  it('방향 빈 값은 요청 없이 거절', async () => {
    const f = res(200)
    expect((await reviewRemote('s1', ' ', env, f, '')).ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('성공 — PATCH board 프로필, 토큰 사용', async () => {
    const f = res(200, [{ id: 's1' }])
    const r = await reviewRemote('s1', '방향', env, f, 'TOK', 0)
    expect(r).toEqual({ ok: true, reviewed_at: '1970-01-01T00:00:00.000Z', direction: '방향' })
    const [u, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(u).toContain('feedback?id=eq.s1'); expect(init.method).toBe('PATCH')
    expect(init.headers.Authorization).toBe('Bearer TOK'); expect(init.headers['Content-Profile']).toBe('board')
  })
  it('칸이 없는 서버(400)는 SQL 필요 한 줄', async () => {
    const r = await reviewRemote('s1', '방향', env, res(400), '')
    expect(r).toEqual({ ok: false, reason: '서버에 검토 칸이 아직 없음(SQL 필요)' })
  })
  it('권한 없음(빈 결과)은 실패', async () => {
    expect((await reviewRemote('s1', '방향', env, res(200, []), '')).ok).toBe(false)
  })
})
