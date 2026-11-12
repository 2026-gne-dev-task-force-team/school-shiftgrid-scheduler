import { h } from '../dom.ts'
import type { BoardData } from '../types.ts'
import { KIND_LABEL } from '../lib/task-detail.ts'
import { actorLabel } from '../lib/actor.ts'
import { COLS } from '../layers/layer4-logic.ts'
import { UNCLASSIFIED, isEmpty, targetOfTask, type Filter } from '../lib/filter.ts'

type Group = 'type' | 'status' | 'target' | 'lane' | 'who'
const plain = (s: string) => s.replace(/^\S+\s/, '')

/** 검색 칸 + 필터 칩 줄(그리기만). 바뀔 때마다 onChange 로 새 상태를 올린다. 폰(좁은 폭)에선 접는 줄 하나. */
export function filterBar(data: BoardData, init: Filter, onChange: (f: Filter) => void): HTMLElement {
  let f: Filter = { ...init }
  const kinds = [...new Set(data.tasks.map((t) => t.kind))]
  const targets = [...new Set(data.tasks.map(targetOfTask))].sort((a, b) => (a === UNCLASSIFIED ? 1 : b === UNCLASSIFIED ? -1 : a.localeCompare(b)))
  const lanes = data.lanes.filter((l) => data.tasks.some((t) => t.lane_id === l.id))
  const who = data.actors.filter((a) => data.tasks.some((t) => t.actor_id === a.id))
  const groups: [Group, string, [string, string][]][] = [
    ['type', '유형', kinds.map((k) => [k, plain(KIND_LABEL[k] ?? k)])],
    ['status', '상태', COLS.map((c) => [c.id, c.name])],
    ['target', '대상', targets.map((t) => [t, t])],
    ['lane', '레인', lanes.map((l) => [l.id, l.title])],
    ['who', '캐릭터', who.map((a) => [a.id, actorLabel(a, data.actors)])],
  ]
  const input = h('input', { type: 'search', class: 'fb-q', placeholder: '번호 · 제목 · 원문 · 설명 검색 (띄어쓰기 = 모두 포함)', 'aria-label': '태스크 검색' })
  input.value = f.q
  const clear = h('button', { type: 'button', class: 'fb-clear' }, '비우기')
  const toggle = h('button', { type: 'button', class: 'fb-toggle', 'aria-expanded': 'false' })
  const panel = h('div', { class: 'fb-panel' })
  const chips: { btn: HTMLElement; g: Group | 'direct'; v: string }[] = []
  const mk = (g: Group | 'direct', v: string, label: string) => {
    const btn = h('button', { type: 'button', class: 'fb-chip', 'aria-pressed': 'false' }, label)
    btn.addEventListener('click', () => {
      if (g === 'direct') f = { ...f, direct: !f.direct }
      else f = { ...f, [g]: f[g].includes(v) ? f[g].filter((x) => x !== v) : [...f[g], v] }
      sync(); onChange(f)
    })
    chips.push({ btn, g, v })
    return btn
  }
  for (const [g, name, opts] of groups) if (opts.length) panel.append(h('div', { class: 'fb-row' }, h('b', null, name), ...opts.map(([v, l]) => mk(g, v, l))))
  panel.append(h('div', { class: 'fb-row' }, mk('direct', '1', '쥔님 직접 지시만')))
  const activeCount = () => (f.q.trim() ? 1 : 0) + f.type.length + f.status.length + f.target.length + f.lane.length + f.who.length + (f.direct ? 1 : 0)
  const sync = () => {
    for (const c of chips) { const on = c.g === 'direct' ? f.direct : f[c.g].includes(c.v); c.btn.setAttribute('aria-pressed', String(on)); c.btn.classList.toggle('on', on) }
    const n = activeCount()
    toggle.textContent = `필터${n ? ` ${n}` : ''}`
    clear.hidden = isEmpty(f)
  }
  input.addEventListener('input', () => { f = { ...f, q: input.value }; sync(); onChange(f) })
  clear.addEventListener('click', () => { f = { q: '', type: [], status: [], target: [], lane: [], who: [], direct: false }; input.value = ''; sync(); onChange(f) })
  toggle.addEventListener('click', () => { const open = bar.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)) })
  const bar = h('div', { class: 'fb' }, h('div', { class: 'fb-top' }, input, toggle, clear), panel)
  if (!isEmpty({ ...f, q: '' })) bar.classList.add('open') // 주소로 들어온 필터가 접힌 채 숨지 않게
  toggle.setAttribute('aria-expanded', String(bar.classList.contains('open')))
  sync()
  return bar
}
