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

export function loadData(now = Date.now(), remote?: Remote | null, app: AppId = DEFAULT_APP): BoardData {
  const d: BoardData = { ...(remote?.tables ?? shift(rawFixtures, now - BASE) as BoardData),
    source: remote?.tables ? 'server' : 'mock', serverFeedback: (remote?.feedback ?? []).filter((f) => !loadHidden().includes(f.id)) }
  const fb = feedbackRows(loadFeedback(), d.lanes[0]?.id ?? '')
  return filterByApp({ ...d, tasks: [...d.tasks, ...fb.tasks], events: [...d.events, ...fb.events] }, app)
}
