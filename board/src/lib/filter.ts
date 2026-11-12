import type { Task } from '../types.ts'
import { colOf } from '../layers/layer4-logic.ts'

// Board 검색·필터(R72) — DOM 을 모르는 순수 함수. 질의 + 칩 → 거른 카드, 주소 ↔ 상태.
export interface Filter {
  q: string
  type: string[]   // Task['kind'] 값
  status: string[] // 열(wait·work·check·done)
  target: string[] // 대상 꼬리표(없는 자료는 「미분류」)
  lane: string[]   // lane_id
  who: string[]    // actor_id
  direct: boolean  // 쥔님 직접 지시만
}
export const EMPTY: Filter = { q: '', type: [], status: [], target: [], lane: [], who: [], direct: false }
export const UNCLASSIFIED = '미분류'
export const targetOfTask = (t: Task): string => t.target || UNCLASSIFIED

export const isEmpty = (f: Filter): boolean => !f.q.trim() && !f.type.length && !f.status.length && !f.target.length && !f.lane.length && !f.who.length && !f.direct

/** 질의 한 줄 → 낱말들(띄어쓰기 = AND, 대소문자 무시). */
export const words = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean)

export function matches(t: Task, f: Filter): boolean {
  const hay = [t.id, t.title, t.ask ?? '', t.body ?? ''].join('\n').toLowerCase()
  if (!words(f.q).every((w) => hay.includes(w))) return false
  if (f.type.length && !f.type.includes(t.kind)) return false
  if (f.status.length && !f.status.includes(colOf(t))) return false
  if (f.target.length && !f.target.includes(targetOfTask(t))) return false
  if (f.lane.length && !f.lane.includes(t.lane_id)) return false
  if (f.who.length && !(t.actor_id && f.who.includes(t.actor_id))) return false
  if (f.direct && !(/^R\d/.test(t.id) && t.direct === true)) return false
  return true
}
export const filterTasks = (tasks: Task[], f: Filter): Task[] => (isEmpty(f) ? tasks : tasks.filter((t) => matches(t, f)))

const KEYS = ['type', 'status', 'target', 'lane', 'who'] as const
/** 상태 → 주소 질의문(빈 칸은 안 적는다). */
export function toSearch(f: Filter): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  for (const k of KEYS) if (f[k].length) p.set(k, f[k].join(','))
  if (f.direct) p.set('direct', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}
/** 주소 질의문 → 상태. 모르는 칸은 무시. */
export function fromSearch(search: string): Filter {
  const p = new URLSearchParams(search)
  const list = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean)
  return { q: p.get('q') ?? '', type: list('type'), status: list('status'), target: list('target'), lane: list('lane'), who: list('who'), direct: p.get('direct') === '1' }
}
