import { describe, expect, it } from 'vitest'
import { kstText, taskDetail } from './task-detail.ts'
import type { Task } from '../types.ts'

const base: Task = { id: 'R1', title: '제목', category: '지휘', kind: 'bug', team: '지휘', sprint: 0, est_min: 0, started_at: null, lane_id: 'l1', column: 'wait', reason: 'new', actor_id: null, updated_at: '2026-11-12T00:00:00Z' }
const data = { tasks: [base, { ...base, id: 'T-2a', title: '이어진 일' }], actors: [], branches: [] }

describe('카드 상세 칸', () => {
  it('빈 칸은 만들지 않는다', () => {
    const m = taskDetail(base, data)
    expect(m.main).toEqual([])
    expect(m.history).toEqual([])
    expect(m.links).toEqual([])
    expect(m.side.map(([k]) => k)).toEqual(['유형', '상태', '분류 · 팀']) // 캐릭터·판·가지·시각 없음
    expect(m.side[0][1]).toBe('🐞 결함')
  })
  it('찬 칸은 순서대로 · 연결은 제목째 · 없는 번호는 버린다 · 시각은 KST', () => {
    const t: Task = { ...base, ask: '원문', body: '설명', done: '조건', links: ['T-2a', 'T-없음'], askedAt: '2026-11-12T05:23:00Z', history: [{ ts: '2026-11-12T05:23:00Z', text: '접수' }] }
    const m = taskDetail(t, data)
    expect(m.main.map((s) => s.label)).toEqual(['원래 요청', '설명', '완료 조건'])
    expect(m.links).toEqual([{ id: 'T-2a', title: '이어진 일' }])
    expect(m.history).toEqual([{ at: '11-12 14:23', text: '접수' }])
    expect(kstText('엉터리')).toBe('')
  })
})
