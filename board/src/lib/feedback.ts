import type { BoardEvent, Task } from '../types.ts'
import { isPlain } from './plain.ts'

export const FEEDBACK_KEY = 'board.feedback' // board. 접두사 → 저장소 비우기가 같이 지운다
export const MAX_LEN = 200
export interface Feedback { id: string; text: string; where: string; ts: string }
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadFeedback(s: Store | undefined = globalThis.localStorage): Feedback[] {
  try { const v = JSON.parse(s?.getItem(FEEDBACK_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** 접수. 거절이면 이유 한 줄을 돌려준다. */
export function addFeedback(text: string, where: string, s: Store | undefined = globalThis.localStorage, now = Date.now()): { ok: true } | { ok: false; reason: string } {
  const t = text.trim()
  if (!t) return { ok: false, reason: '내용을 한 줄 적어 주세요.' }
  if (t.length > MAX_LEN) return { ok: false, reason: `${MAX_LEN}자까지 적을 수 있어요.` }
  if (!isPlain(t)) return { ok: false, reason: '열쇠·경로·이메일 꼴은 적을 수 없어요.' }
  if (!s) return { ok: false, reason: '이 기기에 저장할 수 없어요.' }
  const all = loadFeedback(s)
  all.push({ id: `fb${now}`, text: t, where, ts: new Date(now).toISOString() })
  s.setItem(FEEDBACK_KEY, JSON.stringify(all))
  return { ok: true }
}

/** 접수된 불편을 기다림 열의 🐞 카드와 흐름 줄로 바꾼다 — 자료 불러올 때 합친다. */
export function feedbackRows(fbs: Feedback[], laneId: string): { tasks: Task[]; events: BoardEvent[] } {
  return {
    tasks: fbs.map((f) => ({ id: f.id, title: `🐞 ${f.text}`, category: f.where, kind: 'bug', team: '접수', sprint: 0, est_min: 0,
      started_at: null, lane_id: laneId, column: 'wait', reason: 'new', actor_id: null, updated_at: f.ts })),
    events: fbs.map((f) => ({ id: `e${f.id}`, ts: f.ts, kind: 'feedback.add', subject_type: 'task', subject_id: f.id, actor_id: null, text: '🐞 불편 하나가 접수됐다' })),
  }
}
