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
    expect(addFeedback('버튼이 안 눌려요', '띠', s)).toEqual({ ok: true })
    expect(addFeedback('글씨가 작아요', '4 작업장', s).ok).toBe(true)
    expect(JSON.parse(s.m.get(FEEDBACK_KEY)!)).toHaveLength(2)
    const { tasks, events } = feedbackRows(loadFeedback(s), 'l1')
    expect(tasks[0]).toMatchObject({ kind: 'bug', column: 'wait' })
    expect(events[0].text).toBe('🐞 불편 하나가 접수됐다')
  })
  it('담백하지 않은 글 · 빈 글 · 200자 초과는 이유와 함께 거절', () => {
    const s = store()
    for (const bad of ['sk-abc123', 'C:/x', 'me@korea.kr', '  ', 'a'.repeat(MAX_LEN + 1)]) {
      const r = addFeedback(bad, '띠', s)
      expect(r.ok).toBe(false)
    }
    expect(s.m.size).toBe(0)
  })
  it('저장소 비우기 뒤 사라진다', () => {
    const s = store()
    addFeedback('하나', '띠', s)
    purgeStorage(s)
    expect(loadFeedback(s)).toEqual([])
  })
})
