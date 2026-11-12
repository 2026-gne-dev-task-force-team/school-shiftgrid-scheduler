import type { Actor, Task } from '../types.ts'

// 캐릭터 이름 = 하는 일. 역할 낱말(운전 규약 1절 팀·역할)에서 만든다 — 자료의 name 은 역할로 시작할 때만 믿는다.
const ROLES: [key: string, label: string, what: string][] = [
  ['지휘', '지휘', '일을 고르고 나눠 주고, 쥔님 말에 먼저 답하고, 다 된 것을 합친다'],
  ['살림', '살림지기', '토큰·빠뜨린 일·시간을 지켜보며 지휘를 돕는다'],
  ['설계', '설계', '설계를 바꿔 달라는 요청을 받아 정리한다'],
  ['화면', '화면 다듬기', '층 화면과 맨 위 막대를 만든다'],
  ['자료', '자료 나르기', '서버 자료와 보고를 맡는다'],
  ['시험', '시험', '자동 시험을 돌려 고장을 찾는다'],
  ['세션', '대화 세션', '#시간표앱 으로 쥔님과 직접 얘기하며 일을 고르고 맡긴다'],
  ['맨눈', '맨눈 점검', '코드를 안 보고 화면만 보며 불편한 곳을 찾는다'],
]
type Who = Pick<Actor, 'name' | 'role'> & Partial<Pick<Actor, 'id' | 'team'>>

const roleOf = (a: Who) => {
  const r = `${a.role ?? ''} ${a.team ?? ''}`
  return ROLES.find(([k]) => r.includes(k))
}
const baseOf = (a: Who) => roleOf(a)?.[1] ?? ((a.role || a.team || '').replace(/팀$/, '') || '도우미')

/** 화면에 보일 이름. name 이 역할로 시작하면(「시험 2」「시험·달력」) 그대로, 아니면 역할 이름. 같은 이름이 둘 이상이면 뒤에 번호. */
export function actorLabel(a: Who, all: Who[] = []): string {
  const base = baseOf(a)
  const name = (a.name ?? '').trim()
  if (name.startsWith(base) && name !== base) return name
  const twins = all.filter((x) => baseOf(x) === base && !((x.name ?? '').trim().startsWith(base) && (x.name ?? '').trim() !== base))
  if (twins.length < 2) return base
  const i = twins.findIndex((x) => (a.id ? x.id === a.id : x === a))
  return i < 0 ? base : `${base} ${i + 1}`
}

/** 「무엇을 하는 에이전트인가」 한 줄 — 역할 설명 + 지금 맡은 일감. */
export function actorWhat(a: Who & Pick<Actor, 'task_id'>, tasks: Pick<Task, 'id' | 'title'>[] = []): string {
  const what = roleOf(a)?.[2] ?? `${baseOf(a)} 일을 맡는다`
  const t = tasks.find((x) => x.id === a.task_id)
  return t ? `${what} · 지금: ${t.id} ${t.title}` : what
}
