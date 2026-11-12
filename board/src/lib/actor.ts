import type { Actor, Task } from '../types.ts'

// 캐릭터 이름표 = 「역할 · 맡은 태스크 번호」 한 줄. 자료의 name(세션·기기·사람 이름이 섞일 수 있다)은 안 쓴다 — role·team 낱말과 task_id 만 본다.
// [key, 이름표 낱말, 하는 일]
const ROLES: [key: string, tag: string, what: string][] = [
  ['지휘', '지휘', '일을 고르고 나눠 주고, 쥔님 말에 먼저 답하고, 다 된 것을 합친다'],
  ['살림', '살림', '토큰·빠뜨린 일·시간을 지켜보며 지휘를 돕는다'],
  ['설계', '설계팀', '설계를 바꿔 달라는 요청을 받아 정리한다'],
  ['화면', '화면팀', '층 화면과 맨 위 막대를 만든다'],
  ['자료', '자료팀', '서버 자료와 보고를 맡는다'],
  ['시험', '시험팀', '자동 시험을 돌려 고장을 찾는다'],
  ['세션', '대화', '#시간표앱 으로 쥔님과 직접 얘기하며 일을 고르고 맡긴다'],
  ['맨눈', '맨눈', '코드를 안 보고 화면만 보며 불편한 곳을 찾는다'],
  ['감독', '감독관', '레인 표를 돌아보며 빠진 곳·막힌 곳을 알린다'],
]
type Who = Pick<Actor, 'name' | 'role'> & Partial<Pick<Actor, 'id' | 'team' | 'task_id'>>

// role 이 먼저 — team 은 문장일 수 있다(감독관의 team = 요약 줄)
const roleOf = (a: Who) => ROLES.find(([k]) => (a.role ?? '').includes(k)) ?? ROLES.find(([k]) => (a.team ?? '').includes(k))
const baseOf = (a: Who) => roleOf(a)?.[1] ?? ((a.role || a.team || '').replace(/팀$/, '') || '도우미')

/** 이름표 한 줄 — 역할 + (있으면) 맡은 태스크 번호. 예: `지휘` · `화면팀 T-7z` · `감독관`. 순수 함수. */
export function nameTag(a: Who): string {
  const n = (a.task_id ?? '').replace(/^l-\w+-/, '')
  return n ? `${baseOf(a)} ${n}` : baseOf(a)
}

/** 화면에 보일 이름표. 태스크 번호 없는 같은 이름표가 둘 이상이면 뒤에 1·2 번호. */
export function actorLabel(a: Who, all: Who[] = []): string {
  const tag = nameTag(a)
  if (a.task_id) return tag
  const twins = all.filter((x) => !x.task_id && nameTag(x) === tag)
  if (twins.length < 2) return tag
  const i = twins.findIndex((x) => (a.id ? x.id === a.id : x === a))
  return i < 0 ? tag : `${tag} ${i + 1}`
}

/** 「무엇을 하는 에이전트인가」 한 줄 — 역할 설명 + 지금 맡은 일감. */
export function actorWhat(a: Who & Pick<Actor, 'task_id'>, tasks: Pick<Task, 'id' | 'title'>[] = []): string {
  const what = roleOf(a)?.[2] ?? `${baseOf(a)} 일을 맡는다`
  const t = tasks.find((x) => x.id === a.task_id)
  return t ? `${what} · 지금: ${t.id} ${t.title}` : what
}

/** 에이전트가 쓴 토큰 한 줄 — 「누적 N · 분당 M」. 기록을 못 이은 캐릭터(값 없음)는 「—」. */
export function actorTokens(a: Partial<Pick<Actor, 'tok_total' | 'tok_per_min'>>): string {
  if (typeof a.tok_total !== 'number') return '—'
  const n = (v: number) => v.toLocaleString('ko-KR')
  return `누적 ${n(a.tok_total)} · 분당 ${n(a.tok_per_min ?? 0)}`
}

/** 상태별 수 — 일함 · 쉼 · 대기 · 막힘 · 퇴근(옛 done 포함). 0 인 것도 낱말로 남는다. */
export function stateCounts(actors: { state: string }[]): [state: string, n: number][] {
  const n = (...ss: string[]) => actors.filter((a) => ss.includes(a.state)).length
  return [['work', n('work')], ['idle', n('idle')], ['wait', n('wait')], ['blocked', n('blocked')], ['off', n('off', 'done')]]
}
