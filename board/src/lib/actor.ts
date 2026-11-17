import type { Actor, Task } from '../types.ts'
import { pickName } from '../../reporter/names.mjs'

// 캐릭터 = 「이름 · 직업 · 태스크 번호」 세 칸(R98). 이름은 사람 이름처럼 고정(캐릭터 id 에서 정한다 · 같은 에이전트면 같은 이름), 직업은 하는 일 낱말, 번호는 맡은 태스크.
// 자료의 job 칸이 있으면 name·job 을 그대로 쓰고, 없는 옛 자료는 role·team 낱말로 직업을 가리고 이름은 id 에서 만든다(옛 name 은 세션·기기 이름이 섞여 안 쓴다).
// [key, 직업 낱말, 하는 일]
const ROLES: [key: string, job: string, what: string][] = [
  ['지휘', '지휘', '일을 고르고 나눠 주고, 쥔님 말에 먼저 답하고, 다 된 것을 합친다'],
  ['살림', '살림', '토큰·빠뜨린 일·시간을 지켜보며 지휘를 돕는다'],
  ['설계', '설계', '설계를 바꿔 달라는 요청을 받아 정리한다'],
  ['화면', '화면 다듬기', '층 화면과 맨 위 막대를 만든다'],
  ['코드', '코드 짜기', '코드를 짜고 고친다'],
  ['자료', '자료 나르기', '서버 자료와 보고를 나른다'],
  ['시험', '시험', '자동 시험을 돌려 고장을 찾는다'],
  ['세션', '대화 세션', '#시간표앱 으로 쥔님과 직접 얘기하며 일을 고르고 맡긴다'],
  ['맨눈', '맨눈 점검', '코드를 안 보고 화면만 보며 불편한 곳을 찾는다'],
  ['감독', '감독관', '레인 표를 돌아보며 빠진 곳·막힌 곳을 알린다'],
]
type Who = Pick<Actor, 'name' | 'role'> & Partial<Pick<Actor, 'id' | 'team' | 'task_id' | 'job'>>

// role 이 먼저 — team 은 문장일 수 있다(감독관의 team = 요약 줄)
const roleOf = (a: Who) => ROLES.find(([k]) => (a.role ?? '').includes(k)) ?? ROLES.find(([k]) => (a.team ?? '').includes(k))
/** 직업 낱말 — 자료의 job 이 먼저, 없으면 role·team 에서. */
export const jobOf = (a: Who): string => a.job || (roleOf(a)?.[1] ?? ((a.role || a.team || '').replace(/팀$/, '') || '도우미'))

/** 맡은 태스크 번호 — 「l-xx-T-8p1」 → 「T-8p1」. T-번호 꼴이 아니면 빈 문자열(숫자만 있는 꼬리는 번호가 아니다). */
export const taskNo = (id?: string | null): string => {
  const n = (id ?? '').replace(/^l-\w+-/, '')
  return /^T-\w+$/.test(n) ? n : ''
}

/** 캐릭터 이름 — job 칸이 있는 자료는 name 그대로, 옛 자료는 id 에서 만든 고정 이름(같은 무리 안에서 겹치면 비켜 간다). */
export function actorName(a: Who, all: Who[] = []): string {
  const seed = (x: Who) => x.id ?? `${x.role}|${x.task_id ?? ''}|${x.team ?? ''}`
  const taken = new Set<string>()
  for (const x of all) {
    const nm = x.job ? x.name : pickName(seed(x), taken)
    if (x === a || (a.id && x.id === a.id)) return nm
    taken.add(nm)
  }
  return a.job ? a.name : pickName(seed(a), taken)
}

/** 이름표 글 「이름 · 직업」 — 칩의 본문. 태스크 번호는 따로. */
export const actorTitle = (a: Who, all: Who[] = []): string => `${actorName(a, all)} · ${jobOf(a)}`

/** 칩용 — 「이름 · 직업」 + 맡은 태스크 번호는 따로 꼬리표로(번호 두 번·T- 없는 꼬리 번호 없음). 번호가 없으면 tag 는 빈 문자열. */
export function actorChip(a: Who, all: Who[] = [], _tasks: Pick<Task, 'id' | 'title'>[] = []): { label: string; tag: string } {
  return { label: actorTitle(a, all), tag: taskNo(a.task_id) }
}

/** 화면에 보일 이름표 한 줄 「이름 · 직업 · 태스크 번호」(번호는 있을 때만). */
export function actorLabel(a: Who, all: Who[] = [], _tasks: Pick<Task, 'id' | 'title'>[] = []): string {
  const n = taskNo(a.task_id)
  return n ? `${actorTitle(a, all)} · ${n}` : actorTitle(a, all)
}

/** 「무엇을 하는 에이전트인가」 한 줄 — 역할 설명 + 지금 맡은 일감. */
export function actorWhat(a: Who & Pick<Actor, 'task_id'>, tasks: Pick<Task, 'id' | 'title'>[] = []): string {
  const what = roleOf(a)?.[2] ?? `${jobOf(a)} 일을 맡는다`
  const t = tasks.find((x) => x.id === a.task_id)
  return t ? `${what} · 지금: ${t.id} ${t.title}` : what
}

/** 감독관 team 줄 「⚠️ 7 · ❌ 31 · 순찰 14:02」 → 「주의 7건 · 실패 31건 · 점검 14:02」. 모르는 꼴은 그대로. */
export const teamText = (team: string | undefined): string =>
  (team ?? '').replace(/⚠️?\s*(\d+)/g, '주의 $1건').replace(/❌\s*(\d+)/g, '실패 $1건').replace(/순찰/g, '점검')

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
