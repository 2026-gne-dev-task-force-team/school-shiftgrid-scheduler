import { describe, expect, it } from 'vitest'
import { addFeedback, FEEDBACK_KEY, feedbackRows, loadFeedback, MAX_LEN } from './feedback.ts'
import { purgeStorage } from './purge.ts'

function store() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k), get length() { return m.size }, key: (i: number) => [...m.keys()][i] ?? null, m,
  }
}

describe('불편 접수', () => {
  it('board.feedback 에 쌓이고 bug·wait 카드와 흐름 줄이 된다', () => {
    const s = store()
    expect(addFeedback('버튼이 안 눌려요', '막대', s)).toEqual({ ok: true })
    expect(addFeedback('글씨가 작아요', '4 Board', s).ok).toBe(true)
    expect(JSON.parse(s.m.get(FEEDBACK_KEY)!)).toHaveLength(2)
    expect(feedbackRows(loadFeedback(s), 'l1').tasks).toHaveLength(0) // 접수만으로는 카드 0
    const at = '2026-01-01T00:00:00Z'
    const mk = (o: object) => [{ id: 'x', text: '글', where: '막대', ts: at, ...o }]
    expect(feedbackRows(mk({ reviewed_at: at, direction: '   ' }), 'l').tasks).toHaveLength(0) // 방향 빈 검토
    expect(feedbackRows(mk({ direction: '이렇게' }), 'l').tasks).toHaveLength(0) // reviewed_at 없음(칸 없는 서버)
    expect(feedbackRows(mk({ reviewed_at: null, direction: null }), 'l').tasks).toHaveLength(0)
    const { tasks, events } = feedbackRows(mk({ reviewed_at: at, direction: '이렇게' }), 'l1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'bug', column: 'wait', title: '이렇게 · 글' })
    expect(events[0].text).toBe('🐞 검토된 불편 하나가 일감이 됐다')
  })
  it('담백하지 않은 글 · 빈 글 · 200자 초과는 이유와 함께 거절', () => {
    const s = store()
    for (const bad of ['키 sk-abc', 'SK-abc', 'eyJhbGci', 'a@b.kr', 'C:\\x', '  ', '', 'a'.repeat(MAX_LEN + 1)]) {
      const r = addFeedback(bad, '막대', s)
      expect(r.ok).toBe(false)
    }
    expect(s.m.size).toBe(0)
  })
  it('서버 규칙과 같게 허용', () => {
    const s = store()
    for (const ok of ['3/4교시 칸이 좁아요', 'task-board 정리', 'a'.repeat(MAX_LEN)]) expect(addFeedback(ok, '막대', s).ok).toBe(true)
  })
  it('저장소 비우기 뒤 사라진다', () => {
    const s = store()
    addFeedback('하나', '막대', s)
    purgeStorage(s)
    expect(loadFeedback(s)).toEqual([])
  })
})
