import type { Actor, BoardData, Flag, Task, Usage } from '../types.ts'

// 쓰러짐 — 클로드들이 눈 X 로 쓰러지고 판의 불이 꺼진다
// (쥔님 2026-11-17 20:45 *"7일 토큰 사용량 초과 … 캐릭터 다 눈 X … 다양한 방향으로 쓰러지게 … 불이 꺼진 것처럼 한산하고"*).
// 켜는 길 셋(앞이 이긴다):
//   ① 이 기기 손 스위치 — 주소 ?ko=on|off 가 localStorage(board.ko)에 남는다 · ?ko=auto 가 푼다(시험용)
//   ② 공용 셔터 — 서버 표 board.flags 의 'ko' 줄(value on|off · note = 화면 글). 쥔님이 말로 시키면 NAS `ko.cjs` 가 올리고 내린다 — 모든 기기에 같이 보이고, 실시간 소켓이 바뀜을 알려 바로 원복(쥔님 21:24 *"내가 쉬고 싶을 때 표현하는 용도 … 수동으로 셔터 올리고 내리고"*)
//   ③ 자료 — 보고꾼이 실은 usage 의 기관(org) 마지막 줄 pct_7d ≥ 100 이면 저절로 켜지고, 100 아래 새 줄이 오면 저절로 꺼진다
export const KO_KEY = 'board.ko'
export type KoForce = 'on' | 'off' | null
export interface Ko { on: boolean; pct: number | null; resetAt: string | null; forced: KoForce; by: 'local' | 'flag' | 'data'; note: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** 주소의 ?ko= 를 저장소에 옮기고, 저장된 강제값을 돌려준다(없으면 null = 자료가 정한다). */
export function readForce(store: Store, search = ''): KoForce {
  const q = new URLSearchParams(search).get('ko')
  if (q === 'on' || q === 'off') store.setItem(KO_KEY, q)
  else if (q === 'auto') store.removeItem(KO_KEY)
  const v = store.getItem(KO_KEY)
  return v === 'on' || v === 'off' ? v : null
}

export function knockout(usage: Usage[], forced: KoForce = null, flags: Flag[] = []): Ko {
  const cur = usage.filter((u) => u.account === 'org').sort((a, b) => a.ts.localeCompare(b.ts)).at(-1)
  const pct = cur ? cur.pct_7d : null
  const f = flags.find((x) => x.key === 'ko')
  const flag: KoForce = f?.value === 'on' ? 'on' : f?.value === 'off' ? 'off' : null
  const on = forced ? forced === 'on' : flag ? flag === 'on' : pct !== null && pct >= 100
  return { on, pct, resetAt: cur?.reset_7d_at ?? null, forced, by: forced ? 'local' : flag ? 'flag' : 'data', note: (f?.note ?? '').trim() }
}

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 11)
// 쓰러진 방향 — 이름 해시로 여섯 가지 중 하나(같은 캐릭터는 늘 같은 쪽). CSS 의 [data-ko="n"] 이 몸을 돌린다.
export const KO_POSES = 6
export const koPose = (name: string): number => hash(name) % KO_POSES

// 그리는 쪽이 읽는 현재 값 — render() 가 한 번 놓고 character() 가 읽는다(캐릭터를 그리는 자리마다 넘기지 않게).
let cur: Ko = { on: false, pct: null, resetAt: null, forced: null, by: 'data', note: '' }
export const setKo = (k: Ko): void => { cur = k }
export const isKo = (): boolean => cur.on

/** 풀리는 시각 — 오늘이면 「HH:MM」, 아니면 「M/D HH:MM」. 못 읽으면 빈 글. */
export function fmtReset(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return new Date(now).toDateString() === d.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

/** 판 위 조용한 한 줄 — 티켓이 아니라 상태 글(쥔님 *"티켓 표시도 … 달지 말고 그냥 조용히"*). 셔터에 글(note)이 있으면 그 글이 앞선다. */
export function koText(k: Ko, now = Date.now()): string {
  if (k.note) return k.note
  const when = k.by === 'data' ? fmtReset(k.resetAt, now) : ''
  return `기관 계정 7일 한도 초과 — 클로드들이 쓰러져 작업과 현황판이 멈췄습니다${when ? ` · 한도 풀림 ${when}` : ''}${k.by === 'local' ? ' · (이 기기 손 스위치)' : ''}`
}

// ── 장면 꾸미기(프런트만 · 자료는 안 건드린다) ───────────────────────────────────────────
// 보고꾼은 20분 조용한 캐릭터를 퇴근(off)으로 치워 버려 「다 돌고 있는 채로 죽은」 장면이 안 남는다
// (쥔님 20:55 *"이미 몇 명 정리됐네 … 여기저기 여러 명 열심히 작업하다가 쓰러진 것처럼 … 이전 티켓으로 꾸며서 … 프런트 쪽에만"*).
// 그래서 쓰러짐 모드에서는 화면이 퇴근·쉼 캐릭터 몇을 **마지막으로 맡았던 일감(이전 티켓)** 위에 다시 세운다 — 일감 카드는 「작업」 열로, 레인은 「하는 중」으로.
// 서버 자료는 그대로이고 모드가 꺼지면 한 번 다시 그리는 것으로 원복된다.
export const KO_REVIVE_MAX = 12 // 다시 세우는 수 상한 — 나머지는 숙소에서 쓰러진 채
const MIN = 60_000

const isOffish = (s: Actor['state']) => s === 'off' || s === 'done' || s === 'idle' || s === 'wait'
const minsAgo = (iso: string, m: number) => new Date(Date.parse(iso) - m * MIN).toISOString()

export function stageKo(d: BoardData, now = Date.now()): BoardData {
  const tasks: Task[] = d.tasks.map((t) => ({ ...t }))
  const actors: Actor[] = d.actors.map((a) => ({ ...a }))
  const taken = new Set(tasks.filter((t) => t.column === 'work' && t.actor_id).map((t) => t.actor_id))
  // 최근에 끝난 일감(갱신 시각 내림차순) — 이전 티켓 더미. 이미 누가 들고 있는 카드는 뺀다
  const pool = tasks.filter((t) => t.column === 'done' && !/^[RU]\d/.test(t.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const used = new Set<string>()
  // 일손 중 퇴근·쉼 — 최근에 나간 순. 지휘(lead)·대화 세션은 세우지 않는다
  const cands = actors.filter((a) => a.kind === 'helper' && isOffish(a.state) && !taken.has(a.id) && !/세션/.test(`${a.role} ${a.job ?? ''}`))
    .sort((a, b) => (b.ended_at ?? b.started_at).localeCompare(a.ended_at ?? a.started_at)).slice(0, KO_REVIVE_MAX)
  let n = 0
  for (const a of cands) {
    let t = tasks.find((x) => x.id === a.task_id && !used.has(x.id) && x.column !== 'wait')
    if (!t) t = pool.find((x) => !used.has(x.id) && (!x.actor_id || x.actor_id === a.id))
    if (!t) break
    used.add(t.id)
    const at = a.ended_at ?? new Date(now).toISOString()
    // 넷에 하나는 복도에서 쓰러진 채(쉼 꼴) — 「여기저기」. 나머지는 카드 위에서
    if (n++ % 4 === 3) { a.state = 'idle'; continue }
    a.state = 'work'; a.task_id = t.id; a.ended_at = null
    t.column = 'work'; t.reason = 'new'; t.actor_id = a.id
    if (!t.started_at) t.started_at = minsAgo(at, 7 + (hash(a.name) % 29)) // 몇십 분째 하던 일처럼
  }
  const working = new Set(tasks.filter((t) => t.column === 'work').map((t) => t.lane_id))
  const lanes = d.lanes.map((l) => (working.has(l.id) && l.state === 'idle' ? { ...l, state: 'work' } : l))
  return { ...d, tasks, actors, lanes }
}
