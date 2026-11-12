import type { Actor, Module, Task } from '../types.ts'

// 일감 ↔ 설계 칸 맞춤 규칙 — 여기 한 함수에만 둔다. 못 맞추면 null(Blueprint 맨 아래 「어느 칸인지 모름」).
const TOKEN = /\b(?:R\d+|T-\w+|P\d+[a-z]?)\b/gi
const tokens = (s: string | null | undefined) => new Set((s ?? '').match(TOKEN)?.map((x) => x.toLowerCase()) ?? [])

/** 맡은 칸의 module id. 1) 칸의 task_id 가 같음 2) 일감 id·제목의 번호(R36·T-8g·P12)가 칸 이름·메모에 있음(방 먼저, 그다음 집). */
export function matchRoom(a: Pick<Actor, 'task_id'>, modules: Module[], tasks: Pick<Task, 'id' | 'title'>[]): string | null {
  if (!a.task_id) return null
  const byTask = modules.find((m) => m.task_id === a.task_id && m.parent)
  if (byTask) return byTask.id
  const t = tasks.find((x) => x.id === a.task_id)
  const keys = new Set([...tokens(a.task_id), ...tokens(t?.title)])
  if (keys.size) {
    const hit = (m: Module) => { const mk = tokens(`${m.name} ${m.note ?? ''}`); return [...keys].some((k) => mk.has(k)) }
    const found = modules.find((m) => m.parent && hit(m)) ?? modules.find(hit)
    if (found) return found.id
  }
  return modules.find((m) => m.task_id === a.task_id)?.id ?? null
}

/** 칸 곁에 붙는 캐릭터 — 일함·막힘만. 칸 id → 캐릭터들, 못 맞춘 캐릭터는 lost. */
export function attachActors(actors: Actor[], modules: Module[], tasks: Pick<Task, 'id' | 'title'>[]) {
  const byRoom = new Map<string, Actor[]>(), lost: Actor[] = []
  for (const a of actors) {
    if (a.state !== 'work' && a.state !== 'blocked') continue
    const id = matchRoom(a, modules, tasks)
    if (id) byRoom.set(id, [...(byRoom.get(id) ?? []), a]); else lost.push(a)
  }
  return { byRoom, lost }
}
