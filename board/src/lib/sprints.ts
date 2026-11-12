import type { Sprint, Task } from '../types.ts'

/** 든 태스크 중 끝난('done') 비율 0~100. 든 태스크가 없거나 자료에 없는 id 뿐이면 0. */
export function sprintProgress(s: Sprint, tasks: Task[]): { done: number; total: number; pct: number } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const mine = s.task_ids.map((id) => byId.get(id)).filter((t): t is Task => !!t)
  const done = mine.filter((t) => t.column === 'done').length
  return { done, total: mine.length, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 }
}

/** 지금 스프린트의 남은 일감 수(스프린트 태스크 기준 — 요청함 R 카드는 안 센다). 막대·Overview 가 같이 쓴다. */
export const sprintLeft = (d: { sprints: Sprint[]; tasks: Task[] }): number => ((c) => (c ? ((p) => p.total - p.done)(sprintProgress(c.sprint, d.tasks)) : 0))(currentSprint(d))

/** 시작이 늦은 줄(최신)이 위. began 이 비거나 깨졌으면(NaN) 0 으로 치고, 같으면 번호 큰 쪽이 위. */
export const sprintsNewestFirst = (list: Sprint[]): Sprint[] =>
  [...list].sort((a, b) => (Date.parse(b.began) || 0) - (Date.parse(a.began) || 0) || b.id - a.id)

/** 검수 칩 글: 통과 / 보완 / 결과 없음이면 끝났는지로 「끝」·「진행 중」. */
export const reviewLabel = (s: Sprint): string => (s.passed === true ? '검수 통과' : s.passed === false ? '검수 보완' : s.ended ? '끝' : '진행 중')

/** 막대 글: 「스프린트 N · 제목」 — 지금 스프린트(currentSprint), 없으면 판 이름. */
export const sprintLabel = (d: { sprints: Sprint[]; tasks: Task[] }): string =>
  ((c) => (c ? `Sprint ${c.sprint.id} · ${c.sprint.title}` : '작업현황판'))(currentSprint(d))

/** 지금 스프린트: ended 없는 줄(여럿이면 가장 늦게 시작한 것), 없으면 가장 최신. 진행률은 sprintProgress. 스프린트가 없으면 null. */
export function currentSprint(d: { sprints: Sprint[]; tasks: Task[] }): { sprint: Sprint; pct: number } | null {
  const newest = sprintsNewestFirst(d.sprints)
  const sprint = newest.find((s) => !s.ended) ?? newest[0]
  return sprint ? { sprint, pct: sprintProgress(sprint, d.tasks).pct } : null
}

/** 안내판 상태 말: 끝난 줄=ARRIVED, 시작했고 아직 안 끝남=BOARDING, 시작 전(또는 began 깨짐)=SCHEDULED. */
export type FlightStatus = 'ARRIVED' | 'BOARDING' | 'SCHEDULED'
export const flightStatus = (s: Sprint, now: number = Date.now()): FlightStatus =>
  s.ended ? 'ARRIVED' : Date.parse(s.began) <= now ? 'BOARDING' : 'SCHEDULED'
