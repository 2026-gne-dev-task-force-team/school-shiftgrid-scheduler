import type { Sprint, Task } from '../types.ts'

/** 든 태스크 중 끝난('done') 비율 0~100. 든 태스크가 없거나 자료에 없는 id 뿐이면 0. */
export function sprintProgress(s: Sprint, tasks: Task[]): { done: number; total: number; pct: number } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const mine = s.task_ids.map((id) => byId.get(id)).filter((t): t is Task => !!t)
  const done = mine.filter((t) => t.column === 'done').length
  return { done, total: mine.length, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 }
}

/** 시작이 늦은 줄(최신)이 위. */
export const sprintsNewestFirst = (list: Sprint[]): Sprint[] => [...list].sort((a, b) => Date.parse(b.began) - Date.parse(a.began))

/** 검수 칩 글: 통과 / 검수 대기(결과 아직 없음). */
export const reviewLabel = (s: Sprint): string => (s.passed === true ? '검수 통과' : s.passed === false ? '검수 보완' : '검수 대기')

/** 지금 스프린트: ended 없는 줄(여럿이면 가장 늦게 시작한 것), 없으면 가장 최신. 진행률은 sprintProgress. 스프린트가 없으면 null. */
export function currentSprint(d: { sprints: Sprint[]; tasks: Task[] }): { sprint: Sprint; pct: number } | null {
  const newest = sprintsNewestFirst(d.sprints)
  const sprint = newest.find((s) => !s.ended) ?? newest[0]
  return sprint ? { sprint, pct: sprintProgress(sprint, d.tasks).pct } : null
}
