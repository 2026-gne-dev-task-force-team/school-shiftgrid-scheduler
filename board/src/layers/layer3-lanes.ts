import { h } from '../dom.ts'
import { chip, KIND_ICON, STATE_ICON } from '../ui/chip.ts'
import { character } from '../ui/character.ts'
import type { LayerRenderer } from './types.ts'

const STATE_TEXT: Record<string, string> = { work: '하는 중', blocked: '확인 중', idle: '쉬는 중', done: '끝' }

// 3층 레인 — 레인마다 한 줄(공개 제목 · 맡은 캐릭터 · 상태). 일감 공이 머리에서 핀 쪽으로 천천히 굴러간다.
export const layer3: LayerRenderer = {
  id: 'layer3', floor: 3, tab: '레인',
  render(host, { data, openDetail, tip }) {
    const box = h('div', { class: 'lanes' })
    for (const l of data.lanes) {
      const a = data.actors.find((x) => x.id === l.actor_id)
      const head = h('div', { class: 'lane-head' }, h('b', null, l.title),
        a ? chip({ icon: character(a), label: a.name, hue: a.hue, id: a.id }) : h('span', null, '—'),
        h('span', null, `${STATE_ICON[l.state] ?? '⏸'} ${STATE_TEXT[l.state] ?? l.state}`))
      const track = h('div', { class: 'lane-track' })
      data.tasks.filter((t) => t.lane_id === l.id && t.column !== 'done').forEach((t, i) => {
        const ball = h('button', { class: 'ball', 'data-id': t.id, 'aria-label': t.title, style: `animation-delay:${-i * 9}s` }, KIND_ICON[t.kind] ?? '●')
        ball.addEventListener('click', () => openDetail({ title: t.title, rows: [['레인', l.title], ['분류', t.category], ['팀', t.team]] }))
        tip(ball, () => t.title)
        track.append(ball)
      })
      box.append(h('div', { class: 'lane', 'data-state': l.state, 'data-id': l.id }, head, track))
    }
    host.append(box)
  },
}
