import type { BoardEvent, Task } from '../types.ts'
import { DEFAULT_APP, type AppId } from './app.ts'

export const FEEDBACK_KEY = 'board.feedback' // board. 접두사 → 저장소 비우기가 같이 지운다
export const MAX_LEN = 200
export type Status = 'new' | 'review' | 'fixed' | 'closed'
export const STATUSES: Status[] = ['new', 'review', 'fixed', 'closed']
export const STATUS_NAME: Record<Status, string> = { new: '접수', review: '검토', fixed: '고침', closed: '닫힘' }
export interface Feedback { id: string; text: string; where: string; ts: string; status?: Status; app?: string } // status 없는 옛 자료 = 접수
export const statusOf = (f: Feedback): Status => (f.status && STATUSES.includes(f.status) ? f.status : 'new')
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadFeedback(s: Store | undefined = globalThis.localStorage): Feedback[] {
  try { const v = JSON.parse(s?.getItem(FEEDBACK_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** 서버 board.feedback.text check 와 같은 규칙(board-schema.sql). 길이는 코드포인트, btrim 은 공백(U+0020)만. */
export function checkFeedback(text: string): { ok: true; text: string } | { ok: false; reason: string } {
  const t = text.replace(/^ +| +$/g, '')
  if (!t) return { ok: false, reason: '내용을 한 줄 적어 주세요.' }
  if ([...t].length > MAX_LEN) return { ok: false, reason: `${MAX_LEN}자까지 적을 수 있어요.` }
  if (/[\\@]/.test(t)) return { ok: false, reason: '역슬래시와 @ 는 적을 수 없어요.' }
  if (/(?<![A-Za-z0-9_])(sk-|eyJ)/i.test(t)) return { ok: false, reason: '열쇠 꼴(sk-, eyJ)은 적을 수 없어요.' }
  return { ok: true, text: t }
}

/** 접수. 거절이면 이유 한 줄을 돌려준다. */
export function addFeedback(text: string, where: string, s: Store | undefined = globalThis.localStorage, now = Date.now(), app: AppId = DEFAULT_APP): { ok: true } | { ok: false; reason: string } {
  const r = checkFeedback(text)
  if (!r.ok) return r
  const t = r.text
  if (!s) return { ok: false, reason: '이 기기에 저장할 수 없어요.' }
  const all = loadFeedback(s)
  all.push({ id: `fb${now}`, text: t, where, ts: new Date(now).toISOString(), app })
  s.setItem(FEEDBACK_KEY, JSON.stringify(all))
  return { ok: true }
}

export function setStatus(id: string, status: Status, s: Store | undefined = globalThis.localStorage): void {
  if (!s || !STATUSES.includes(status)) return
  s.setItem(FEEDBACK_KEY, JSON.stringify(loadFeedback(s).map((f) => (f.id === id ? { ...f, status } : f))))
}

export function removeFeedback(id: string, s: Store | undefined = globalThis.localStorage): void {
  if (s) s.setItem(FEEDBACK_KEY, JSON.stringify(loadFeedback(s).filter((f) => f.id !== id)))
}

/** 서버 사본은 지우지 않고 이 기기에서만 숨긴다. */
export const HIDDEN_KEY = 'board.feedback.hidden'
export function loadHidden(s: Store | undefined = globalThis.localStorage): string[] {
  try { const v = JSON.parse(s?.getItem(HIDDEN_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function hideFeedback(id: string, s: Store | undefined = globalThis.localStorage): void {
  if (s) s.setItem(HIDDEN_KEY, JSON.stringify([...new Set([...loadHidden(s), id])]))
}

/** 접수가 바뀌면 불러 현황판 전체(Board·흐름 줄)를 다시 그리게 한다. */
export const FEEDBACK_CHANGED = 'board:feedback-changed'
export const notifyFeedbackChanged = (): void => void globalThis.dispatchEvent?.(new Event(FEEDBACK_CHANGED))

export interface InboxItem extends Feedback { origin: 'local' | 'server'; status: Status }

/** 이 기기 접수 + 서버 접수를 한 목록으로 — 최신순. */
export function mergeInbox(local: Feedback[], server: Feedback[]): InboxItem[] {
  return [...local.map((f) => ({ ...f, origin: 'local' as const, status: statusOf(f) })),
    ...server.map((f) => ({ ...f, origin: 'server' as const, status: statusOf(f) }))]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
}

/** 검토·고침 = 작업 열, 닫힘 = 끝 열. */
const place = (st: Status): Pick<Task, 'column' | 'reason'> =>
  st === 'closed' ? { column: 'done', reason: 'done' } : st === 'new' ? { column: 'wait', reason: 'new' } : { column: 'work', reason: 'new' }

/** 접수된 불편을 🐞 카드(상태 따라 열)와 흐름 줄로 바꾼다 — 자료 불러올 때 합친다. */
export function feedbackRows(fbs: Feedback[], laneId: string): { tasks: Task[]; events: BoardEvent[] } {
  return {
    tasks: fbs.map((f) => ({ id: f.id, title: f.text, category: f.where, kind: 'bug', team: '접수', sprint: 0, est_min: 0,
      started_at: null, lane_id: laneId, app: f.app ?? DEFAULT_APP, actor_id: null, updated_at: f.ts, ...place(statusOf(f)) })),
    events: fbs.map((f) => ({ id: `e${f.id}`, ts: f.ts, kind: 'feedback.add', subject_type: 'task', subject_id: f.id, actor_id: null, text: '🐞 불편 하나가 접수됐다' })),
  }
}
