import actors from '../fixtures/actors.json'
import tasks from '../fixtures/tasks.json'
import lanes from '../fixtures/lanes.json'
import branches from '../fixtures/branches.json'
import services from '../fixtures/services.json'
import modules from '../fixtures/modules.json'
import goals from '../fixtures/goals.json'
import events from '../fixtures/events.json'
import usage from '../fixtures/usage.json'
import runs from '../fixtures/runs.json'
import sprints from '../fixtures/sprints.json'
import { feedbackRows, loadFeedback, loadHidden } from './lib/feedback.ts'
import { DEFAULT_APP, filterByApp, type AppId } from './lib/app.ts'
import type { Remote } from './lib/remote.ts'
import type { BoardData } from './types.ts'

export const rawFixtures = { actors, tasks, lanes, branches, services, modules, goals, events, usage, runs, sprints }

const BASE = Date.parse('2026-01-01T10:00:00Z') // fixtures 의 「지금」

// 시각 칸(ts · *_at)을 지금 기준으로 밀어 살아 있는 듯 보이게 한다.
function shift(v: unknown, d: number): unknown {
  if (Array.isArray(v)) return v.map((x) => shift(x, d))
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) =>
      [k, (k === 'ts' || k.endsWith('_at')) && typeof x === 'string' ? new Date(Date.parse(x) + d).toISOString() : shift(x, d)]))
  }
  return v
}

/** 서버 키가 있는 판의 읽기 상태. keyed=false(키 없는 로컬 개발)만 목업을 쓴다. */
export interface ServerState { keyed: boolean; settled: boolean; last?: { at: number; tables: BoardData } | null }

const EMPTY: BoardData = { actors: [], tasks: [], lanes: [], branches: [], services: [], modules: [], goals: [], events: [], usage: [], runs: [], sprints: [] }

export function loadData(now = Date.now(), remote?: Remote | null, app: AppId = DEFAULT_APP, srv?: ServerState): BoardData {
  let base: BoardData
  if (remote?.tables) base = { ...remote.tables, source: 'server' }
  else if (!srv?.keyed) base = { ...(shift(rawFixtures, now - BASE) as BoardData), source: 'mock' }
  else if (!srv.settled) base = { ...EMPTY, source: 'loading' }
  else if (srv.last) base = { ...srv.last.tables, source: 'stale', staleAt: srv.last.at }
  else base = { ...EMPTY, source: 'failed' }
  const d: BoardData = { ...base, serverFeedback: (remote?.feedback ?? []).filter((f) => !loadHidden().includes(f.id)) }
  if (d.source === 'loading' || d.source === 'failed') return filterByApp(d, app) // 빈 칸 — 로컬 접수 카드도 얹지 않는다
  const fb = feedbackRows([...loadFeedback(), ...(d.serverFeedback ?? [])], d.lanes[0]?.id ?? '')
  return filterByApp({ ...d, tasks: [...d.tasks, ...fb.tasks], events: [...d.events, ...fb.events] }, app)
}
