import { h } from '../dom.ts'
import { fmtDur } from '../lib/forecast.ts'
import { currentSprint, sprintLabel } from '../lib/sprints.ts'
import type { VersionInfo } from '../lib/version.ts'
import type { BoardData } from '../types.ts'
import { usagePanel } from './usage.ts'

export interface BandHooks { onApply(): void; onFeedback(): void; onPurge(): void; calm: boolean; onCalm(on: boolean): void }

// 막대(.sgb-bar)의 내용 — 토글 쪽(상태 칩 · 자료 출처 · Sprint N · 목표 · 진행률% · 경과/남은 예상) · 새 버전 · 불편 접수 · ⋯ 메뉴.
// 옛 띠의 ▼(한도와 속도)는 ⋯ 메뉴의 항목으로 옮겼고, 펼쳐지는 패널(drop)은 서랍 맨 위에 끼운다.
export function createBand(data: BoardData, hooks: BandHooks) {
  const now = Date.now()
  const run = data.runs[0], goal = data.goals[0], cur = currentSprint(data)
  const working = data.actors.filter((a) => a.state === 'work').length
  const remain = data.tasks.filter((t) => t.column !== 'done').reduce((s, t) => s + t.est_min, 0)
  const mid = remain / Math.max(1, working)
  const state = goal?.state === 'shipped' ? '✅ Shipped' : goal?.state === 'review' ? '🔍 In review' : working ? '🔨 Building' : '⏸ Idle'
  const elapsed = run ? fmtDur((now - Date.parse(run.started_at)) / 60000) : ''

  const upd = h('button', { class: 'btn upd sgb-mini', hidden: '' })
  upd.addEventListener('click', hooks.onApply)
  const fb = h('button', { class: 'btn sgb-mini' }, '불편 접수')

  // 메뉴 — 첫 줄이 저장소 비우기. 누르면 같은 자리에서 2단계 확인(window.confirm 안 씀).
  const purge = h('button', { class: 'btn' }, '🗑 이 기기 저장소 비우기')
  const ask = h('div', { class: 'menu-ask', hidden: '' },
    h('span', null, '이 기기에 남은 저장 자료를 비웁니다. 서버 자료는 안전하고, 다시 로그인해야 합니다.'))
  const yes = h('button', { class: 'btn' }, '비우기')
  const no = h('button', { class: 'btn' }, '취소')
  ask.append(yes, no)
  const askToggle = (on: boolean) => { ask.hidden = !on; purge.hidden = on }
  purge.addEventListener('click', () => askToggle(true))
  no.addEventListener('click', () => askToggle(false))
  yes.addEventListener('click', () => { askToggle(false); hooks.onPurge() })

  const calm = h('input', { type: 'checkbox' })
  calm.checked = hooks.calm
  calm.addEventListener('change', () => hooks.onCalm(calm.checked))
  const drop = h('div', { class: 'band-drop', hidden: '' }, usagePanel(data.usage))
  const lim = h('button', { class: 'btn' }, '한도와 속도 펼치기')
  lim.addEventListener('click', () => { drop.hidden = !drop.hidden; lim.textContent = drop.hidden ? '한도와 속도 펼치기' : '한도와 속도 접기' })
  const menu = h('div', { class: 'menu', hidden: '' }, purge, ask, h('label', { class: 'btn' }, calm, ' 움직임 끄기'), lim)
  const more = h('button', { class: 'btn sgb-mini', 'aria-label': '더 보기' }, '⋯')
  const closeMenu = () => { menu.hidden = true; askToggle(false) }
  more.addEventListener('click', () => { if (menu.hidden) menu.hidden = false; else closeMenu() })
  fb.addEventListener('click', () => { closeMenu(); hooks.onFeedback() })
  // 바깥 클릭이면 닫는다(메뉴 안·⋯ 는 제외). 다시 그릴 때마다 새로 달리니 옛 것은 떼어 둔다.
  const outside = (e: MouseEvent) => { const t = e.target as Node; if (!menu.hidden && !menu.contains(t) && !more.contains(t)) closeMenu() }
  document.addEventListener('click', outside)

  const toggle = h('span', { class: 'sgb-toggle' },
    h('span', { class: 'chip' }, state),
    h('span', { class: data.source === 'server' ? 'chip src' : 'chip src mock', title: '자료 출처' }, data.source === 'server' ? 'Live data' : 'Mock data'),
    h('span', { class: 'sgb-name' }, sprintLabel(data)),
    h('span', { class: 'sgb-gauge', 'aria-hidden': 'true', title: 'Sprint 진행률' }, ...Array.from({ length: 10 }, (_, i) => h('i', cur && i < Math.round(cur.pct / 10) ? { class: 'on' } : null))),
    h('span', { class: 'sgb-pct', title: 'Sprint 진행률' }, cur ? `${cur.pct}%` : ''),
    h('span', { class: 'band-clock', title: '경과 시간 · 남은 예상' }, run ? `${elapsed}째 · 남은 예상 ${fmtDur(mid * 0.8)}~${fmtDur(mid * 1.2)}` : ''))

  return {
    toggle, upd, fb, more, menu, drop, closeMenu,
    dispose() { document.removeEventListener('click', outside) },
    showUpdate(v: VersionInfo | null) {
      upd.hidden = !v
      if (v) upd.textContent = `✨ ${v.note || '새 기능이 올라왔어요'} [지금 바꾸기]`
    },
  }
}
