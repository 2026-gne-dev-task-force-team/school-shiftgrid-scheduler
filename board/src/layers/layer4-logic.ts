import type { Task } from '../types.ts'

export type Col = 'check' | 'wait' | 'work' | 'done'
export const COLS: { id: Col; name: string }[] = [
  { id: 'check', name: '확인 중' }, { id: 'wait', name: '기다림' }, { id: 'work', name: '작업' }, { id: 'done', name: '끝' },
]
export const REASON_NAME: Record<string, string> = {
  new: '새 일', dep: '앞 일 기다림', checking: '확인 중', blocked: '막힘', review: '살펴보는 중', done: '끝', closed: '닫힘',
}

// 쥔님 결정 대기(reason=checking)는 공개 화면에선 「확인 중」 칸으로만 보인다.
export const colOf = (t: Task): Col => (t.column === 'wait' && t.reason === 'checking' ? 'check' : t.column)

export const minutesIn = (t: Task, now: number): number | null =>
  t.started_at === null ? null : Math.max(0, Math.floor((now - Date.parse(t.started_at)) / 60000))

// 짐작(est_min)을 넘긴 일만 true — 끝난 카드·시작 전 카드는 아니다.
export const isOver = (t: Task, now: number): boolean => {
  const m = minutesIn(t, now)
  return t.column !== 'done' && m !== null && m > t.est_min
}

// 이유 칩은 기다림 칸의 막힘·앞 일 기다림에만 붙는다.
export const showReason = (t: Task): boolean => t.column === 'wait' && (t.reason === 'blocked' || t.reason === 'dep')
