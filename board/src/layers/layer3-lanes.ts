import { h } from '../dom.ts'
import { chip, KIND_ICON, STATE_ICON } from '../ui/chip.ts'
import { character } from '../ui/character.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'
import type { LayerRenderer } from './types.ts'

const STATE_TEXT: Record<string, string> = { work: '하는 중', blocked: '확인 중', idle: '쉬는 중', done: '끝' }

// 3층 레인 — 레인마다 한 줄(공개 제목 · 맡은 캐릭터 · 상태). 일감 공이 머리에서 핀 쪽으로 천천히 굴러간다.
export const layer3: LayerRenderer = {
  id: 'layer3', floor: 3, tab: 'Lanes',
  render(host, { data, openDetail, tip }) {
    const box = h('div', { class: 'lanes' })
    for (const l of data.lanes) {
      // 레인 담당 + 이 레인 일감을 지금 맡아 도는 캐릭터들
      const who = data.actors.filter((x) => x.id === l.actor_id || (x.state === 'work' && data.tasks.find((t) => t.id === x.task_id)?.lane_id === l.id))
      const chips = who.map((a) => ((c) => { const t = `${actorLabel(a, data.actors)} — ${actorWhat(a, data.tasks)}`; c.title = t; tip(c, () => t); return c })(
        chip({ icon: character(a), label: actorLabel(a, data.actors), hue: a.hue, id: a.id })))
      const head = h('div', { class: 'lane-head' }, h('b', null, l.title),
        ...(chips.length ? chips : [h('span', null, '—')]),
        h('span', null, `${STATE_ICON[l.state] ?? '⏸'} ${STATE_TEXT[l.state] ?? l.state}`))
      const mine = data.tasks.filter((t) => t.lane_id === l.id), done = mine.filter((t) => t.column === 'done').length
      const pct = mine.length ? Math.round((done / mine.length) * 100) : 0
      const prog = h('div', { class: 'lane-prog' }, h('small', null, `끝 ${done}/${mine.length} · ${pct}%`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })))
      const track = h('div', { class: 'lane-track' })
      data.tasks.filter((t) => t.lane_id === l.id && t.column !== 'done').forEach((t, i) => {
        const ball = h('button', { class: 'ball', 'data-id': t.id, 'aria-label': t.title, style: `animation-delay:${-i * 9}s` }, KIND_ICON[t.kind] ?? '●')
        ball.addEventListener('click', () => openDetail({ title: t.title, rows: [['레인', l.title], ['분류', t.category], ['팀', t.team]] }))
        tip(ball, () => t.title)
        track.append(ball)
      })
      box.append(h('div', { class: 'lane', 'data-state': l.state, 'data-id': l.id }, head, prog, track))
    }
    host.append(box)
  },
}
