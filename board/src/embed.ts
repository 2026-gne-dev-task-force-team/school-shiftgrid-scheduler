import './style.css'
import { loadData } from './data.ts'
import { h, isCalm } from './dom.ts'
import { loadFeedback } from './lib/feedback.ts'
import { LAYERS } from './layers/registry.ts'
import { restoreTab } from './layers/layer5-logic.ts'
import type { LayerCtx } from './layers/types.ts'
import { closesOnKey, loadOpen, saveOpen } from './lib/drawer.ts'
import { applyUpdate, clearThisDevice } from './lib/purge.ts'
import { fetchVersion, isNewer, type VersionInfo } from './lib/version.ts'
import { createBand } from './ui/band.ts'
import { createDetail } from './ui/detail.ts'
import { createFeedLog } from './ui/feedlog.ts'
import { openFeedback } from './ui/feedback.ts'
import { createStage } from './ui/stage.ts'
import { attachTip } from './ui/tip.ts'

const CALM_KEY = 'board.calm'
const phone = matchMedia('(max-width: 767px)')
const calmOn = () => {
  const s = localStorage.getItem(CALM_KEY)
  return s === null ? matchMedia('(prefers-reduced-motion: reduce)').matches || phone.matches : s === '1'
}

let root: HTMLElement | null = null
let page: HTMLElement
let barEl: HTMLButtonElement
let poll = 0
let curTab = 0 // 다시 그려도 보던 탭을 되살린다
function render(notice = false): void {
  clearInterval(poll)
    const data = loadData()
  const applyCalm = (on: boolean) => root!.classList.toggle('calm', on)
  applyCalm(calmOn())

  const stage = createStage()
  const detail = createDetail()
  const feed = createFeedLog(data.events, (id) => stage.pulse(id))
  const ctx: LayerCtx = { data, openDetail: detail.open, tip: attachTip }

  const band = createBand(data, {
    calm: calmOn(),
    onCalm(on) { localStorage.setItem(CALM_KEY, on ? '1' : '0'); applyCalm(on) },
    onApply: () => void applyUpdate(__BUILD__),
    onFeedback: () => openFeedback(detail.open, () => render(true)),
    async onPurge() {
      if (!confirm('이 기기에 남은 이 앱의 저장 자료를 비웁니다.\n서버 자료는 안전합니다. 다시 로그인해야 합니다.')) return
      await clearThisDevice()
      render()
    },
  })

  const tabs = h('nav', { class: 'tabs' })
  const show = (i: number) => {
    curTab = i
    tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j))
    stage.show(LAYERS[i], ctx)
  }
  LAYERS.forEach((l, i) => {
    const b = h('button', { class: 'btn' }, l.floor === 6 ? l.tab : `${l.floor} ${l.tab}`)
    b.addEventListener('click', () => show(i))
    tabs.append(b)
  })

  const syncLayout = () => { detail.setLayout(phone.matches ? 'sheet' : 'side') }
  phone.onchange = syncLayout
  syncLayout()

  const working = data.actors.filter((a) => a.state === 'work').length
  const goal = data.goals[0]
  barEl.replaceChildren(
    h('span', { class: 'sgb-name' }, goal ? `스프린트 ${goal.sprint} · ${goal.title}` : '작업현황판'),
    h('span', { class: 'sgb-pct' }, goal ? `${goal.progress}%` : ''),
    h('span', null, `진행 중 ${working}`),
    h('span', { class: 'sgb-caret' }, root!.querySelector('.sgb-drawer')!.classList.contains('open') ? '▲' : '▼'))
  page.replaceChildren(band.el, tabs, h('div', { class: 'body' }, feed, stage.el, detail.el))
  show(restoreTab(curTab, LAYERS.length))
  if (notice) {
    const go = h('button', { class: 'btn' }, '작업장에서 보기')
    go.addEventListener('click', () => {
      show(LAYERS.findIndex((l) => l.floor === 4))
      detail.el.hidden = true // 폰 바텀시트가 카드를 가리지 않게
      const card = stage.el.querySelector<HTMLElement>(`[data-id="${loadFeedback().at(-1)?.id}"]`)
      if (!card) return
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: isCalm() ? 'auto' : 'smooth' })
      card.classList.add('flash')
      setTimeout(() => card.classList.remove('flash'), 2000)
    })
    detail.open({ title: '접수됐어요', rows: [], extra: go })
  }

  const check = async () => {
    const v: VersionInfo | null = await fetchVersion()
    band.showUpdate(isNewer(__BUILD__, v) ? v : null)
  }
  void check()
  poll = window.setInterval(check, 60_000)
  document.onvisibilitychange = () => { if (!document.hidden) void check() }
}

// 앱 맨 위에 끼우는 막대 + 위 서랍. host 를 안 주면 body 맨 앞에 붙는다. 두 번 불러도 한 번만 붙는다.
export function mountBoard(host?: HTMLElement): void {
  if (root) return
  root = h('div', { class: 'sgb' })
  barEl = h('button', { class: 'sgb-bar', 'aria-label': '작업현황판 열고 닫기' })
  page = h('div', { class: 'sgb-page' })
  const scrim = h('button', { class: 'sgb-scrim', 'aria-label': '서랍 닫기', hidden: '' })
  const drawer = h('div', { class: 'sgb-drawer' }, h('div', { class: 'sgb-scroll' }, page))
  const set = (on: boolean) => {
    drawer.classList.toggle('open', on)
    scrim.hidden = !on
    barEl.querySelector('.sgb-caret')!.textContent = on ? '▲' : '▼'
    saveOpen(localStorage, on)
  }
  barEl.addEventListener('click', () => set(!drawer.classList.contains('open')))
  scrim.addEventListener('click', () => set(false))
  document.addEventListener('keydown', (e) => { if (closesOnKey(e.key, drawer.classList.contains('open'))) set(false) })
  root.append(barEl, scrim, drawer)
  if (host) host.append(root); else document.body.prepend(root)
  render()
  // 처음 열림은 그대로 되살린다(슬라이드 없이).
  if (loadOpen(localStorage)) { drawer.style.transition = 'none'; set(true); void drawer.offsetWidth; drawer.style.transition = '' }
}
