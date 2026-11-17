import { h } from '../dom.ts'
import { actorLabel, actorName, actorTokens, actorWhat, jobOf, taskNo, teamText } from '../lib/actor.ts'
import { isKo } from '../lib/ko.ts'
import { character, raceText, type CharSize } from './character.ts'
import { DEPT_NAME, STATE_ICON, STATE_NAME } from './chip.ts'
import type { LayerCtx } from '../layers/types.ts'
import type { Actor, BoardData } from '../types.ts'

// 캐릭터가 나오는 모든 자리의 공용 이름표(R92) — 캐릭터 + 「이름 · 직업」 + 「태스크 번호 제목」(없으면 쉼·대기·퇴근). 올리면 상태 툴팁, 누르면 상세.
// 자료에 없는 칸(기기·마지막 활동·레인·오늘 끝낸 수)은 툴팁에서 뺀다.

/** 이름표 둘째 줄 — 맡은 태스크 「T-번호 제목」, 일감이 없으면 상태 낱말(일함·쉼·대기·막힘·퇴근). */
const taskOf = <T extends { id: string }>(a: { task_id: string | null }, tasks: T[]): T | undefined => tasks.find((x) => x.id === a.task_id || x.id === taskNo(a.task_id))

export function actorTaskLine(a: Pick<Actor, 'task_id' | 'state'>, tasks: { id: string; title: string }[]): string {
  const t = taskOf(a, tasks)
  if (t) return `${taskNo(t.id) || t.id} ${t.title}`
  const n = taskNo(a.task_id)
  return n || (STATE_NAME[a.state] ?? a.state)
}

const ago = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`
}
const hm = (iso: string): string => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** 상태판 칸들 [이름, 값] — 값이 없는 칸은 빠진다. */
export function actorFacts(a: Actor, data: BoardData, now = Date.now()): [string, string][] {
  const t = taskOf(a, data.tasks)
  const lane = data.lanes.find((l) => l.id === t?.lane_id) ?? data.lanes.find((l) => l.actor_id === a.id)
  const last = [...data.events.filter((e) => e.actor_id === a.id).map((e) => Date.parse(e.ts)), t ? Date.parse(t.updated_at) : NaN].filter((n) => !Number.isNaN(n))
  const today = new Date(now).toDateString()
  const done = data.tasks.filter((x) => x.actor_id === a.id && x.column === 'done' && new Date(x.updated_at).toDateString() === today).length
  const rows: [string, string | false | undefined][] = [
    ['상태', isKo() ? `😵 쓰러짐 · 한도 초과 (${STATE_NAME[a.state] ?? a.state} 중이었다)` : `${STATE_ICON[a.state] ?? ''} ${STATE_NAME[a.state] ?? a.state}`.trim()],
    ['기기', raceText(a)],
    ['시작', hm(a.started_at)],
    ['마지막 활동', last.length ? ago(now - Math.max(...last)) : ''],
    ['레인', lane?.title],
    ['오늘 끝낸 일', data.tasks.some((x) => x.actor_id === a.id) ? `${done}건` : ''],
  ]
  return rows.filter((r): r is [string, string] => !!r[1])
}

/** 툴팁 글 — 「이름 · 직업 · 번호」 줄 + 상태판 칸들을 「 · 」로. */
export const actorTipText = (a: Actor, data: BoardData, now = Date.now()): string =>
  `${actorLabel(a, data.actors, data.tasks)} — ${actorFacts(a, data, now).map(([k, v]) => `${k} ${v}`).join(' · ')}`

export function actorDetail(a: Actor, data: BoardData, now = Date.now()) {
  const t = taskOf(a, data.tasks)
  return {
    title: actorLabel(a, data.actors, data.tasks),
    rows: [['하는 일', actorWhat(a, data.tasks)], ['이름', actorName(a, data.actors)], ['직업', jobOf(a)], ['부서', `${DEPT_NAME[a.dept] ?? a.dept} · ${teamText(a.team)}`],
      ...actorFacts(a, data, now), ['맡은 일', t ? `${t.id} ${t.title}` : '—'], ['쓴 토큰', actorTokens(a)]] as [string, string][],
    extra: h('div', { class: 'chr-card' }, character(a, 'card')),
  }
}

export interface TagOpts { size?: CharSize; /** name = 이름만 한 줄(좁은 자리) */ text?: 'full' | 'name'; /** 다른 버튼 안에 놓일 때 */ nested?: boolean; cls?: string }

/** 공용 이름표. 이름 · 직업 · 일감 줄은 늘 보이고(줄임표), 올리면 상태 툴팁, 누르면 상세. */
export function actorTag(ctx: Pick<LayerCtx, 'data' | 'openDetail' | 'tip'>, a: Actor, o: TagOpts = {}): HTMLElement {
  const { data } = ctx
  const full = (o.text ?? 'full') === 'full'
  const el: HTMLElement = h(o.nested ? 'span' : 'button', { class: `chip actor-tag${o.cls ? ` ${o.cls}` : ''}`, 'data-id': a.id, 'data-state': a.state },
    h('span', { class: 'chip-i' }, character(a, o.size ?? 'chip')),
    h('span', { class: 'at-text' },
      h('b', { class: 'at-name' }, full ? `${actorName(a, data.actors)} · ${jobOf(a)}` : actorName(a, data.actors)),
      ...(full ? [h('small', { class: 'at-task' }, actorTaskLine(a, data.tasks))] : [])))
  el.style.setProperty('--hue', String(a.hue))
  el.setAttribute('aria-label', actorTipText(a, data))
  if (o.nested) { el.setAttribute('role', 'button'); el.tabIndex = 0 }
  const open = () => ctx.openDetail(actorDetail(a, data))
  el.addEventListener('click', (e) => { e.stopPropagation(); open() })
  if (o.nested) el.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open() } })
  ctx.tip(el, () => actorTipText(a, data))
  return el
}
