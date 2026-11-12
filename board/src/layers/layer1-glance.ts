import { h } from '../dom.ts'
import { chip, DEPT_NAME, PROP_ICON, STATE_ICON } from '../ui/chip.ts'
import { usagePanel } from '../ui/usage.ts'
import type { LayerRenderer } from './types.ts'

// 1층 한눈에 — 목표 · 부서별 지금 몇 명 · 한도와 속도 · 최근 로그.
export const layer1: LayerRenderer = {
  id: 'layer1', floor: 1, tab: '한눈',
  render(host, { data, openDetail, tip }) {
    const g = data.goals[0]
    const left = data.tasks.filter((t) => t.column !== 'done').length
    host.append(h('section', { class: 'card' }, h('b', null, '목표'),
      g && h('p', null, `${g.title} — ${g.progress}% · 남은 일감 ${left}개`)))

    const depts = h('section', { class: 'card' }, h('b', null, '부서별 지금 몇 명'))
    for (const d of ['hq', 'make', 'qa'] as const) {
      const here = data.actors.filter((a) => a.dept === d && a.state !== 'done')
      const row = h('div', { class: 'row', 'data-dept': d }, h('span', { class: 'dept' }, `${DEPT_NAME[d]} ${here.length}명`))
      for (const a of here) {
        const c = chip({ icon: PROP_ICON[a.prop] ?? '•', label: a.name, hue: a.hue, id: a.id, onClick: () => openDetail({
          title: a.name, rows: [['부서', `${DEPT_NAME[a.dept]} · ${a.team}`], ['상태', `${STATE_ICON[a.state]} ${a.state}`],
            ['맡은 일', data.tasks.find((t) => t.id === a.task_id)?.title ?? '—']] }) })
        tip(c, () => `${a.name} · ${a.team} · ${STATE_ICON[a.state]}`)
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
