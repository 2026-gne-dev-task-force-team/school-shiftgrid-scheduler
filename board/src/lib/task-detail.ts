import type { BoardData, Task } from '../types.ts'

// 카드 상세(지라 이슈 화면 꼴)의 칸 계산 — DOM 을 모르는 순수 함수. 값이 없는 칸은 아예 만들지 않는다(= 화면에서 숨김).
export interface TaskDetailModel {
  main: { label: string; text: string }[]           // 왼쪽 본문: 원래 요청 · 설명 · 완료 조건
  side: [label: string, value: string][]            // 오른쪽 옆칸: 유형 · 상태 · 캐릭터 · 가지 …
  links: { id: string; title: string }[]            // 연결된 태스크(R↔T) — 제목이 있는 것만
  history: { at: string; text: string }[]           // 접수 · 착수 · 끝 (옛 → 새)
}

export const KIND_LABEL: Record<Task['kind'], string> = { work: '🔨 기능', cr: '📐 설계', bug: '🐞 결함', decide: '🙋 결정', review: '👀 검수' }
const COLUMN_NAME: Record<Task['column'], string> = { wait: '기다림', work: '작업', done: '끝' }
const REASON_NAME: Record<string, string> = { new: '새 일', dep: '앞 일 기다림', checking: '확인 중', blocked: '막힘', review: '살펴보는 중', done: '끝', closed: '닫힘' }

/** ISO → 「MM-DD HH:mm」(KST). 못 읽으면 빈 글. */
export function kstText(iso: string | undefined): string {
  const ms = Date.parse(iso ?? '')
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms + 9 * 3600e3), p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function taskDetail(t: Task, data: Pick<BoardData, 'tasks' | 'actors' | 'branches'>): TaskDetailModel {
  const main: TaskDetailModel['main'] = []
  if (t.ask) main.push({ label: '원래 요청', text: t.ask })
  if (t.body) main.push({ label: '설명', text: t.body })
  if (t.done) main.push({ label: '완료 조건', text: t.done })

  const actor = data.actors.find((a) => a.id === t.actor_id) ?? data.actors.find((a) => a.task_id === t.id)
  const branch = data.branches.find((b) => b.task_id === t.id)
  const side: TaskDetailModel['side'] = [
    ['유형', KIND_LABEL[t.kind] ?? t.kind],
    ...(t.target ? [['대상', t.target] as [string, string]] : []),
    ['상태', t.column === 'wait' || t.column === 'work' ? `${COLUMN_NAME[t.column]} · ${REASON_NAME[t.reason] ?? t.reason}` : '끝'],
    ...(actor ? [['맡은 캐릭터', actor.name] as [string, string]] : []),
    ['분류 · 팀', `${t.category} · ${t.team}`],
    ...(t.app ? [['판', t.app] as [string, string]] : []),
    ...(branch ? [['가지', `${branch.state === 'merged' ? '합쳐짐' : '열림'} · 줄기보다 ${branch.ahead}개 앞`] as [string, string]] : []),
    ...(t.askedAt ? [['받은 시각', kstText(t.askedAt)] as [string, string]] : []),
  ]
  const links = (t.links ?? []).flatMap((id) => { const o = data.tasks.find((x) => x.id === id); return o ? [{ id, title: o.title }] : [] })
  const history = (t.history ?? []).map((e) => ({ at: kstText(e.ts), text: e.text })).filter((e) => e.at)
  return { main, side, links, history }
}
