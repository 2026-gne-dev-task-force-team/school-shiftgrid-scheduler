import { h } from '../dom.ts'
import { STATE_ICON, STATE_NAME, isOff } from '../ui/chip.ts'
import { raceText } from '../ui/character.ts'
import { actorTag } from '../ui/actor-tag.ts'
import { currentSprint, sprintLeft } from '../lib/sprints.ts'
import { jobOf, stateCounts } from '../lib/actor.ts'
import { isKo } from '../lib/ko.ts'
import { eventText, plainLog, wheelTitle } from '../ui/code-tag.ts'
import { usagePanel } from '../ui/usage.ts'
import type { LayerRenderer } from './types.ts'

/** 상태별 수 — 일함 · 쉼 · 대기 · 막힘 · 퇴근을 따로 센다(0 인 것도 보인다). 쓰러짐(한도 초과)이면 「😵 쓰러짐 전원」이 맨 앞에 선다. */
export function stateSummary(actors: { state: string }[], ko = isKo()): HTMLElement {
  return h('div', { class: 'sum-states' }, ...(ko ? [h('span', { 'data-state': 'ko' }, `😵 쓰러짐 ${actors.length}`)] : []),
    ...stateCounts(actors).map(([s, c]) => h('span', { 'data-state': s }, `${STATE_ICON[s]} ${STATE_NAME[s]} ${c}`)))
}

// 1층 한눈에 — 목표 · 부서별 지금 몇 명 · 한도와 속도 · 최근 로그.
export const layer1: LayerRenderer = {
  id: 'layer1', floor: 1, tab: '한눈에',
  render(host, ctx) {
    const { data } = ctx
    const g = currentSprint(data)
    const left = sprintLeft(data)
    host.append(h('section', { class: 'card' }, h('b', null, '목표'),
      g && h('p', null, `한 바퀴 ${g.sprint.id} · `, ...wheelTitle(g.sprint.title), ` — ${g.pct}% · 남은 일감 ${left}개`)))

    const depts = h('section', { class: 'card' }, h('b', null, '직업별 지금 몇 명'))
    depts.append(stateSummary(data.actors))
    // 직업 칸(job)으로 센다 — 부서(dept) 순서(본부·제작·검수)로 늘어놓고, 같은 부서 안에선 처음 나온 직업 순.
    const live = data.actors.filter((a) => !isOff(a.state))
    const jobs = (['hq', 'make', 'qa'] as const).flatMap((d) => [...new Set(live.filter((a) => a.dept === d).map((a) => jobOf(a)))].map((j) => [d, j] as const))
    for (const [d, j] of jobs) {
      const here = live.filter((a) => a.dept === d && jobOf(a) === j)
      const row = h('div', { class: 'row', 'data-dept': d, 'data-job': j }, h('span', { class: 'dept' }, `${j} ${here.length}명`))
      for (const a of here) {
        const c = actorTag(ctx, a)
        if (raceText(a)) c.append(h('small', { class: 'chr-race' }, raceText(a)))
        row.append(c)
      }
      depts.append(row)
    }
    host.append(depts, h('section', { class: 'card' }, h('b', null, '한도와 속도'), usagePanel(data.usage)))

    const log = h('ul', { class: 'recent' })
    for (const e of [...data.events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 5)) log.append(h('li', { 'data-id': e.subject_id }, ...plainLog(eventText(e.text))))
    host.append(h('section', { class: 'card' }, h('b', null, '최근 로그'), log))
  },
}
