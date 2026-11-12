import { h } from '../dom.ts'
import { reviewLabel, sprintProgress, sprintsNewestFirst } from '../lib/sprints.ts'
import { chip } from '../ui/chip.ts'
import type { Sprint } from '../types.ts'
import type { LayerRenderer } from './types.ts'

const COL_NAME = { wait: '기다림', work: '하는 중', done: '끝' } as const
const COL_HUE = { wait: 45, work: 200, done: 140 } as const
const hm = (ts: string) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const hmOnly = (ts: string) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const span = (s: Sprint) => `${hm(s.began)} ~ ${s.ended ? hmOnly(s.ended) : '진행 중'}`

// 스프린트 — 한 줄에 번호·목표·기간·진행률·검수 칩, 누르면 태스크·시간·검수·회고가 펼쳐진다.
export const sprints: LayerRenderer = {
  id: 'sprints', floor: 6, tab: '스프린트',
  render(host, { data }) {
    if (!data.sprints?.length) { host.replaceChildren(h('p', { class: 'card' }, '아직 스프린트 기록이 없습니다')); return }
    host.replaceChildren(...sprintsNewestFirst(data.sprints).map((s) => {
      const p = sprintProgress(s, data.tasks)
      const head = h('button', { class: 'feed-line', 'aria-expanded': 'false' }, h('b', null, `${s.id}. ${s.title}`),
        h('small', null, `${s.goal} · ${span(s)}`))
      const bar = h('div', { class: 'bar' }, h('i'))
      bar.querySelector('i')!.style.width = `${p.pct}%`
      const label = reviewLabel(s)
      const top = h('div', { class: 'row' }, h('span', null, `진행 ${p.pct}% (${p.done}/${p.total})`),
        chip({ icon: s.passed ? '✅' : '⏳', label, hue: s.passed ? 140 : 45 }))
      const tasks = s.task_ids.map((id) => data.tasks.find((t) => t.id === id)).filter((t) => !!t)
      const body = h('div', null,
        h('p', null, `목표 — ${s.goal}`),
        h('div', { class: 'row' }, ...tasks.map((t) => chip({ icon: '•', label: `${t.title} · ${COL_NAME[t.column]}`, hue: COL_HUE[t.column], id: t.id }))),
        h('p', null, `시간 — 짐작 ${s.est_min}분 / 실제 ${s.ended ? `${s.actual_min}분` : '아직'}`),
        h('p', null, `검수·QA — ${s.review || '아직 없음'}`),
        h('p', null, s.ended ? `회고 — 빠뜨림 ${s.missed || '없음'} · 짐작/실제 ${s.est_min}/${s.actual_min}분 · 다음엔 ${s.next || '—'}` : '회고 — 끝난 뒤에 적습니다'))
      body.hidden = true
      head.addEventListener('click', () => { body.hidden = !body.hidden; head.setAttribute('aria-expanded', String(!body.hidden)) })
      return h('section', { class: 'card', 'data-id': `sprint-${s.id}` }, head, bar, top, body)
    }))
  },
}
