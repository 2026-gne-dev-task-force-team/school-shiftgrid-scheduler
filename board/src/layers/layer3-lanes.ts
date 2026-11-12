import { h } from '../dom.ts'
import { chip, KIND_ICON, STATE_ICON } from '../ui/chip.ts'
import { character } from '../ui/character.ts'
import { actorLabel, actorTokens, actorWhat } from '../lib/actor.ts'
import type { Actor } from '../types.ts'
import type { LayerRenderer } from './types.ts'
import { changedChips, laneChips, type ChipState } from './layer3-logic.ts'

const seen = new Map<string, Map<string, ChipState>>() // 레인별 직전 칩 상태 — 바뀐 것만 반짝이려고

const STATE_TEXT: Record<string, string> = { work: '하는 중', blocked: '확인 중', idle: '쉬는 중', done: '끝' }

// 3층 레인 — 레인마다 한 줄(공개 제목 · 맡은 캐릭터 · 상태). 일감은 가만히 있는 작은 칩(번호 · 상태 점)이고, 새로 생기거나 상태가 바뀔 때만 한 번 반짝인다.
export const layer3: LayerRenderer = {
  id: 'layer3', floor: 3, tab: 'Lanes',
  render(host, { data, openDetail, tip }) {
    const box = h('div', { class: 'lanes' })
    const tagged = (a: Actor) => { const l = actorLabel(a, data.actors), n = a.task_id?.replace(/^l-\w+-/, ''); return n && !l.includes(n) ? `${l} ${n}` : l } // 맡은 태스크 번호
    for (const l of data.lanes) {
      // 레인 담당 + 이 레인 일감을 지금 맡아 도는 캐릭터들
      const who = data.actors.filter((x) => x.id === l.actor_id || (x.state === 'work' && data.tasks.find((t) => t.id === x.task_id)?.lane_id === l.id))
      const chips = who.map((a) => ((c) => { const t = `${actorLabel(a, data.actors)} — ${actorWhat(a, data.tasks)} · 토큰 ${actorTokens(a)}`; c.title = t; tip(c, () => t); return c })(
        chip({ icon: character(a), label: tagged(a), hue: a.hue, id: a.id })))
      const head = h('div', { class: 'lane-head' }, h('b', null, l.title),
        ...(chips.length ? chips : [h('span', null, '—')]),
        h('span', null, `${STATE_ICON[l.state] ?? '⏸'} ${STATE_TEXT[l.state] ?? l.state}`))
      const mine = data.tasks.filter((t) => t.lane_id === l.id), done = mine.filter((t) => t.column === 'done').length
      const pct = mine.length ? Math.round((done / mine.length) * 100) : 0
      const prog = h('div', { class: 'lane-prog' }, h('small', null, `끝 ${done}/${mine.length} · ${pct}%`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })))
      const chipsNow = laneChips(data.tasks, l.id), flashed = changedChips(seen.get(l.id), chipsNow)
      seen.set(l.id, new Map(chipsNow.map((c) => [c.id, c.state])))
      const track = h('div', { class: 'lane-chips' }, ...chipsNow.map((c) => {
        const el = h('button', { class: 'lane-chip' + (flashed.has(c.id) ? ' flash' : ''), 'data-id': c.id, 'data-s': c.state, 'aria-label': c.title }, h('i', { class: 'lc-dot' }), c.id)
        el.addEventListener('click', () => { const t = data.tasks.find((x) => x.id === c.id)!; openDetail({ title: t.title, rows: [['레인', l.title], ['분류', t.category], ['팀', t.team]] }) })
        tip(el, () => `${KIND_ICON[c.kind] ?? '●'} ${c.title}`)
        return el
      }))
      box.append(h('div', { class: 'lane', 'data-state': l.state, 'data-id': l.id }, head, prog, track))
    }
    host.append(box)
  },
}
