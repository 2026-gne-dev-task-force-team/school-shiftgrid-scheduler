import type { BoardData } from '../types.ts'
import type { Feedback } from './feedback.ts'

const TABLES = ['actors', 'tasks', 'lanes', 'branches', 'services', 'modules', 'goals', 'events', 'usage', 'runs', 'sprints'] as const
export interface Remote { tables: BoardData | null; feedback: Feedback[] } // tables null = 목업을 쓴다
export interface Env { url?: string; key?: string }

const envNow = (): Env => ({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY })

async function get(env: Required<Env>, table: string, f: typeof fetch): Promise<unknown[]> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 5000)
  try {
    const r = await f(`${env.url}/rest/v1/${table}?select=*`, {
      signal: ac.signal, headers: { apikey: env.key, Authorization: 'Bearer ' + env.key, 'Accept-Profile': 'board' },
    })
    if (!r.ok) throw new Error(`${table} ${r.status}`)
    const v = await r.json()
    if (!Array.isArray(v)) throw new Error(`${table} 꼴`)
    return v
  } finally { clearTimeout(t) }
}

/** env 가 없으면 null(요청 안 함). 표 하나라도 실패하거나 tasks·lanes 가 비면 tables=null — 서버 feedback 은 따로 살린다. */
export async function fetchRemote(env: Env = envNow(), f: typeof fetch = fetch): Promise<Remote | null> {
  if (!env.url || !env.key) return null
  const e = env as Required<Env>
  const fbP = get(e, 'feedback', f).then((rows) => (rows as { id: string; text: string; place?: string; ts: string; app?: string }[])
    .map((r): Feedback => ({ id: r.id, text: r.text, where: r.place ?? '', ts: r.ts, app: r.app }))).catch((): Feedback[] => [])
  let tables: BoardData | null = null
  try {
    const rows = await Promise.all(TABLES.map((n) => get(e, n, f)))
    const d = Object.fromEntries(TABLES.map((n, i) => [n, rows[i]])) as unknown as BoardData
    if (d.tasks.length && d.lanes.length) tables = d
  } catch { /* 목업으로 */ }
  return { tables, feedback: await fbP }
}

// 마지막으로 서버에서 읽은 표 — 못 읽을 때 「n분 전 값」으로 보이려고 들고 있는다(목업이 아니다).
export const LAST_KEY = 'board.lastRemote'
export interface Last { at: number; tables: BoardData }
type Store = Pick<Storage, 'getItem' | 'setItem'>
export function saveLast(s: Store, v: Last): void { try { s.setItem(LAST_KEY, JSON.stringify(v)) } catch { /* 용량 초과 — 없어도 된다 */ } }
export function loadLast(s: Store): Last | null {
  try {
    const v = JSON.parse(s.getItem(LAST_KEY) ?? 'null') as Last | null
    return v && typeof v.at === 'number' && v.tables && Array.isArray(v.tables.tasks) && Array.isArray(v.tables.lanes) ? v : null
  } catch { return null }
}
export function agoText(now: number, at: number): string {
  const m = Math.max(0, Math.floor((now - at) / 60000))
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`
}
/** 칩에 쓰는 자료 출처 글. */
export function sourceChip(source: BoardData['source'], staleAt: number | undefined, now: number): string {
  switch (source) {
    case 'server': return 'Live data'
    case 'loading': return '불러오는 중…'
    case 'failed': return '서버 못 읽음'
    case 'stale': return `서버 못 읽음 · ${agoText(now, staleAt ?? now)} 값`
    default: return 'Mock data'
  }
}
