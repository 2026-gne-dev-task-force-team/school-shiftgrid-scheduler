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
  const fbP = get(e, 'feedback', f).then((rows) => (rows as { id: string; text: string; place?: string; ts: string }[])
    .map((r): Feedback => ({ id: r.id, text: r.text, where: r.place ?? '', ts: r.ts }))).catch((): Feedback[] => [])
  let tables: BoardData | null = null
  try {
    const rows = await Promise.all(TABLES.map((n) => get(e, n, f)))
    const d = Object.fromEntries(TABLES.map((n, i) => [n, rows[i]])) as unknown as BoardData
    if (d.tasks.length && d.lanes.length) tables = d
  } catch { /* 목업으로 */ }
  return { tables, feedback: await fbP }
}
