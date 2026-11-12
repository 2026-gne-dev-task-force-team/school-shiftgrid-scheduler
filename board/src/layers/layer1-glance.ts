import { h } from '../dom.ts'
import { chip, DEPT_NAME, STATE_ICON } from '../ui/chip.ts'
import { character } from '../ui/character.ts'
import { currentSprint, sprintLeft } from '../lib/sprints.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'
import { usagePanel } from '../ui/usage.ts'
import type { LayerRenderer } from './types.ts'

// 1층 한눈에 — 목표 · 부서별 지금 몇 명 · 한도와 속도 · 최근 로그.
export const layer1: LayerRenderer = {
  id: 'layer1', floor: 1, tab: 'Overview',
  render(host, { data, openDetail, tip }) {
    const g = currentSprint(data)
    const left = sprintLeft(data)
    host.append(h('section', { class: 'card' }, h('b', null, '목표'),
      g && h('p', null, `Sprint ${g.sprint.id} · ${g.sprint.title} — ${g.pct}% · 남은 일감 ${left}개`)))

    const depts = h('section', { class: 'card' }, h('b', null, '부서별 지금 몇 명'))
    for (const d of ['hq', 'make', 'qa'] as const) {
      const here = data.actors.filter((a) => a.dept === d && a.state !== 'done')
      const row = h('div', { class: 'row', 'data-dept': d }, h('span', { class: 'dept' }, `${DEPT_NAME[d]} ${here.length}명`))
      for (const a of here) {
        const name = actorLabel(a, data.actors), what = actorWhat(a, data.tasks)
        const c = chip({ icon: character(a), label: a.task_id ? `${name} · ${a.task_id}` : name, hue: a.hue, id: a.id, onClick: () => openDetail({
          title: name, rows: [['하는 일', what], ['부서', `${DEPT_NAME[a.dept]} · ${a.team}`], ['상태', `${STATE_ICON[a.state]} ${a.state}`],
            ['맡은 일', ((t) => t ? `${t.id} ${t.title}` : '—')(data.tasks.find((t) => t.id === a.task_id))]],
          extra: h('div', { class: 'chr-card' }, character(a, 'card')) }) })
        tip(c, () => `${name} — ${what} · ${STATE_ICON[a.state]}`)
        c.title = `${name} — ${what}`
        row.append(c)
      }
      depts.append(row)
    }
    host.append(depts, h('section', { class: 'card' }, h('b', null, '한도와 속도'), usagePanel(data.usage)))

    const log = h('ul', { class: 'recent' })
    for (const e of [...data.events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 5)) log.append(h('li', { 'data-id': e.subject_id }, e.text))
    host.append(h('section', { class: 'card' }, h('b', null, '최근 로그'), log))
  },
}
