import { h, isCalm } from '../dom.ts'
import { KIND_ICON } from '../ui/chip.ts'
import type { Task } from '../types.ts'
import { BLOCK_NAME, COLS, REASON_NAME, blockText, colOf, isOver, minutesIn, showReason, type Col } from './layer4-logic.ts'
import type { LayerRenderer } from './types.ts'
import { character } from '../ui/character.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'

// 구역 가구 — 도트 rect 몇 개(18×10 격자). 서류함·돋보기 탁자·책상·상자 더미.
const W = '#C8A06A', D = '#8A6A3E', P = '#F3E6D3', G = '#9AA5AD'
const FURN: Record<Col, [number, number, number, number, string][]> = {
  wait: [[0, 2, 6, 8, G], [1, 3, 4, 2, P], [1, 6, 4, 2, P], [8, 1, 9, 6, D], [9, 2, 3, 2, P], [13, 3, 3, 2, '#E8C65B']],
  work: [[0, 4, 8, 4, W], [0, 8, 1, 2, D], [7, 8, 1, 2, D], [1, 2, 4, 2, '#2B1710'], [10, 4, 8, 4, W], [10, 8, 1, 2, D], [17, 8, 1, 2, D], [12, 2, 4, 2, '#2B1710']],
  check: [[2, 5, 14, 3, W], [3, 8, 1, 2, D], [14, 8, 1, 2, D], [6, 2, 4, 3, '#BFE3F2'], [9, 4, 3, 2, '#2B1710'], [12, 3, 2, 2, P]],
  done: [[1, 5, 6, 5, W], [2, 6, 4, 1, D], [8, 6, 6, 4, W], [9, 7, 4, 1, D], [4, 1, 6, 4, W], [5, 2, 4, 1, D], [14, 3, 3, 6, '#7BC86C']],
}
const EN: Record<Col, string> = { check: 'Review', wait: 'Inbox', work: 'Desks', done: 'Crates' }
const furn = (c: Col) => {
  const t = document.createElement('template')
  t.innerHTML = `<svg class="ws-furn" aria-hidden="true" viewBox="0 0 18 10" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${FURN[c].map(([x, y, w, hh, f]) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${f}"/>`).join('')}</svg>`
  return t.content.firstElementChild!
}

// 4층 작업장 — 확인 중 · 기다림 · 작업 · 끝. 카드가 열을 옮기면 FLIP 으로 천천히 날아간다.
export const layer4: LayerRenderer = {
  id: 'layer4', floor: 4, tab: 'Board',
  render(host, { data, openDetail, tip }) {
    const tasks: Task[] = data.tasks.map((t) => ({ ...t }))
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || isCalm()
    const cols = new Map<Col, { body: HTMLElement; badge: HTMLElement }>()
    const board = h('div', { class: 'ws' })
    for (const c of COLS) {
      const badge = h('span', { class: 'ws-badge', hidden: '' })
      const body = h('div', { class: 'ws-body' })
      board.append(h('section', { class: 'ws-col', 'data-col': c.id }, h('header', { class: 'ws-head' }, h('span', null, c.name, h('small', null, ` ${EN[c.id]}`)), badge), furn(c.id), body))
      cols.set(c.id, { body, badge })
    }
    // 쉬는 캐릭터는 복도를 왔다갔다 — 사람마다 거리·속도·지연이 다르다(calm 이면 CSS 가 멎는다)
    const walk = h('div', { class: 'ws-walk', 'aria-hidden': 'true' })
    data.actors.filter((a) => a.state === 'idle' || a.state === 'done').forEach((a, i) => {
      const w = h('span', { class: 'ws-roamer', style: `--dist:${90 + (i * 53) % 140}px;--dur:${9 + (i * 3) % 7}s;--dly:${-i * 2.3}s;left:${10 + (i * 37) % 50}%` }, character(a, 'mini'))
      walk.append(w)
    })
    host.append(board, walk)

    const cards = new Map<string, HTMLElement>()
    const home = new Map<string, Col>() // 처음 있던 열 — 다른 열로 간 카드는 그 열 머리에 +N 배지(폰)
    const now = () => Date.now()
    const dept = (team: string) => data.actors.find((a) => a.team === team)?.dept ?? 'make'
    const cur = (id: string) => tasks.find((x) => x.id === id)!

    const fill = (el: HTMLElement, t: Task) => {
      const m = minutesIn(t, now())
      el.className = 'ws-card' + (isOver(t, now()) ? ' over' : '')
      el.dataset.dept = dept(t.team)
      const a = data.actors.find((x) => x.id === t.actor_id)
      const st = m === null && t.column === 'done' ? 'done' : showReason(t) ? 'blocked' : isOver(t, now()) ? 'over' : t.column === 'done' ? 'done' : 'ok'
      const more = [a ? `${actorLabel(a, data.actors)} — ${actorWhat(a, data.tasks)}` : '', `${t.category} · ${t.team}`, m !== null ? `${m}분째 / 짐작 ${t.est_min}분` : '', showReason(t) ? `⛔ ${blockText(t, tasks) ?? REASON_NAME[t.reason] ?? t.reason}` : ''].filter(Boolean).join(' · ')
      el.title = more
      el.replaceChildren(...(st === 'blocked' ? [h('span', { class: 'ws-bang', 'aria-hidden': 'true' }, '!')] : []), h('i', { class: 'ws-dot', 'data-s': st }), h('b', null, `${KIND_ICON[t.kind] ?? '•'} ${t.title}`), ...(a ? [character(a, 'mini')] : []))
    }

    const layout = (animate: boolean) => {
      const first = new Map([...cards].map(([id, el]) => [id, el.getBoundingClientRect()]))
      for (const t of tasks) {
        let el = cards.get(t.id)
        if (!el) {
          el = h('button', { 'data-id': t.id })
          el.addEventListener('click', () => {
            const c = cur(t.id)
            openDetail({ title: c.title, rows: [['머리표', KIND_ICON[c.kind] ?? c.kind], ['분류', c.category], ['팀', c.team],
              ['상태', REASON_NAME[c.reason] ?? c.reason], ['시간', `${minutesIn(c, now()) ?? 0}분째 / 짐작 ${c.est_min}분`],
              ...(c.block_kind ? [['막힌 이유', `${BLOCK_NAME[c.block_kind]} — ${blockText(c, tasks)}`] as [string, string]] : [])] })
          })
          tip(el, () => `${cur(t.id).title} · ${REASON_NAME[cur(t.id).reason] ?? cur(t.id).reason}`)
          el.style.setProperty('--i', String(cards.size))
          cards.set(t.id, el)
          home.set(t.id, colOf(t))
        }
        fill(el, t)
        cols.get(colOf(t))!.body.append(el)
      }
      const moved = new Map<Col, number>()
      for (const t of tasks) if (home.get(t.id) !== colOf(t)) moved.set(colOf(t), (moved.get(colOf(t)) ?? 0) + 1)
      for (const [id, c] of cols) { const n = moved.get(id) ?? 0; c.badge.hidden = n === 0; c.badge.textContent = `+${n}` }
      if (!animate || reduce()) return
      for (const [id, el] of cards) {
        const a = first.get(id), b = el.getBoundingClientRect()
        if (!a || (a.left === b.left && a.top === b.top)) continue
        el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }],
          { duration: 1600, easing: 'ease-in-out' })
      }
    }
    layout(false)

    // 목업용 — 자료가 정지돼 있어 FLIP 을 볼 수 없으니 15초마다 「t4」가 작업 ↔ 끝을 오간다.
    const demo = tasks.find((t) => t.id === 't4')
    const timer = demo ? setInterval(() => {
      demo.column = demo.column === 'work' ? 'done' : 'work'
      demo.reason = demo.column === 'done' ? 'done' : 'new'
      layout(true)
    }, 15000) : undefined
    const clock = setInterval(() => { for (const t of tasks) fill(cards.get(t.id)!, t) }, 30000)
    return () => { clearInterval(timer); clearInterval(clock) }
  },
}
