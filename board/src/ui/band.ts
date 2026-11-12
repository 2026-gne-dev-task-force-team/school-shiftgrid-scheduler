import { h } from '../dom.ts'
import { fmtDur } from '../lib/forecast.ts'
import type { VersionInfo } from '../lib/version.ts'
import type { BoardData } from '../types.ts'
import { usagePanel } from './usage.ts'

export interface BandHooks { onApply(): void; onPurge(): void; calm: boolean; onCalm(on: boolean): void }

// 0층 띠 — 상태 칩 · 스프린트 진행% · 몇 시간째·남은 예상 · ✨ · ⋯ 메뉴 · ▼ 한도와 속도.
export function createBand(data: BoardData, hooks: BandHooks) {
  const now = Date.now()
  const run = data.runs[0], goal = data.goals[0]
  const working = data.actors.filter((a) => a.state === 'work').length
  const remain = data.tasks.filter((t) => t.column !== 'done').reduce((s, t) => s + t.est_min, 0)
  const mid = remain / Math.max(1, working)
  const state = goal?.state === 'shipped' ? '✅ 올라감' : goal?.state === 'review' ? '🔍 살펴보는 중' : working ? '🔨 짓는 중' : '⏸ 쉬는 중'
  const elapsed = run ? fmtDur((now - Date.parse(run.started_at)) / 60000) : ''

  const upd = h('button', { class: 'btn upd', hidden: '' })
  upd.addEventListener('click', hooks.onApply)
  const calm = h('input', { type: 'checkbox' })
  calm.checked = hooks.calm
  calm.addEventListener('change', () => hooks.onCalm(calm.checked))
  const purge = h('button', { class: 'btn' }, '이 기기 저장소 비우기')
  purge.addEventListener('click', hooks.onPurge)
  const menu = h('div', { class: 'menu', hidden: '' }, h('label', { class: 'btn' }, calm, ' 움직임 끄기'), purge)
  const more = h('button', { class: 'btn', 'aria-label': '더 보기' }, '⋯')
  more.addEventListener('click', () => { menu.hidden = !menu.hidden })
  const drop = h('div', { class: 'band-drop', hidden: '' }, usagePanel(data.usage))
  const down = h('button', { class: 'btn', 'aria-label': '한도와 속도 펼치기' }, '▼')
  down.addEventListener('click', () => { drop.hidden = !drop.hidden; down.textContent = drop.hidden ? '▼' : '▲' })

  const el = h('header', { class: 'band' },
    h('div', { class: 'band-row' },
      h('span', { class: 'chip' }, state),
      h('span', { class: 'band-goal' }, goal ? `스프린트 ${goal.sprint} · ${goal.title} · ${goal.progress}%` : ''),
      h('span', { class: 'band-clock' }, `${elapsed}째 · 남은 예상 ${fmtDur(mid * 0.8)}~${fmtDur(mid * 1.2)}`),
      upd, h('span', { class: 'grow' }), more, down),
    menu, drop)

  return {
    el,
    showUpdate(v: VersionInfo | null) {
      upd.hidden = !v
      if (v) upd.textContent = `✨ ${v.note || '새 기능이 올라왔어요'} [지금 바꾸기]`
    },
  }
}
