// 판 구분 — 세 판(v1 · 1.2v · v2)이 각자 현황판을 본다. 주입된 자리의 `data-app` 이 판 이름이고, 없거나 엉뚱하면 1.2v.
import type { BoardData } from '../types.ts'
export const APPS = ['v1', '1.2v', 'v2'] as const
export type AppId = (typeof APPS)[number]
export const DEFAULT_APP: AppId = '1.2v'
export const asApp = (v: unknown): AppId => (APPS as readonly unknown[]).includes(v) ? (v as AppId) : DEFAULT_APP
/** 일감·불편의 판 — app 칸이 없는 옛 자료는 1.2v. */
export const appOf = (x: { app?: unknown }): AppId => asApp(x.app)
/** 마운트 자리(없으면 문서 루트)의 data-app 을 읽는다. */
export const readApp = (host?: Element | null): AppId => asApp((host ?? document.documentElement)?.getAttribute?.('data-app'))
/** 막대 판 칩 id(v12) ↔ 판 이름(1.2v). */
export const editionOfApp = (a: AppId): 'v1' | 'v12' | 'v2' => (a === '1.2v' ? 'v12' : a)

/** 그 판 일감·불편만 남긴다. 지운 일감에 매인 캐릭터·가지·흐름 줄도 같이 뺀다. */
export function filterByApp(d: BoardData, app: AppId): BoardData {
  const tasks = d.tasks.filter((t) => appOf(t) === app)
  const gone = new Set(d.tasks.filter((t) => appOf(t) !== app).map((t) => t.id))
  return { ...d, tasks,
    actors: d.actors.filter((a) => !a.task_id || !gone.has(a.task_id)),
    branches: d.branches.filter((b) => !b.task_id || !gone.has(b.task_id)),
    events: d.events.filter((e) => !(e.subject_type === 'task' && gone.has(e.subject_id))),
    serverFeedback: d.serverFeedback?.filter((f) => appOf(f) === app) }
}
