import './style.css'
import { loadData } from './data.ts'
import { h, isCalm } from './dom.ts'
import { loadFeedback } from './lib/feedback.ts'
import { LAYERS } from './layers/registry.ts'
import { restoreTab } from './layers/layer5-logic.ts'
import type { LayerCtx } from './layers/types.ts'
import { escTarget, loadOpen, saveOpen } from './lib/drawer.ts'
import { applyUpdate, clearThisDevice } from './lib/purge.ts'
import { fetchRemote, type Remote } from './lib/remote.ts'
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
let barEl: HTMLElement
let menuHost: HTMLElement
let poll = 0
let band: ReturnType<typeof createBand> | null = null
let remote: Remote | null = null // 원격이 오면 담아 두고 다시 그린다
let latest: VersionInfo | null = null // 띠에 띄운 새 판
let curTab = 0 // 다시 그려도 보던 탭을 되살린다
let setDrawer: (on: boolean) => void = () => {}
function render(notice = false): void {
  clearInterval(poll)
  band?.dispose()
  const data = loadData(Date.now(), remote)
  const applyCalm = (on: boolean) => root!.classList.toggle('calm', on)
  applyCalm(calmOn())

  const stage = createStage()
  const detail = createDetail()
  const feed = createFeedLog(data.events, (id) => stage.pulse(id), data.actors)
  const ctx: LayerCtx = { data, openDetail: detail.open, tip: attachTip }

  const bnd = band = createBand(data, {
    calm: calmOn(),
    onCalm(on) { localStorage.setItem(CALM_KEY, on ? '1' : '0'); applyCalm(on) },
    onApply: () => void applyUpdate(latest?.build ?? __BUILD__), // 새 판 번호로 열어야 옛 index.html 사본을 피한다
    // 접수 창은 서랍 안 상세 칸에 뜨니, 닫힌 서랍이면 먼저 연다.
    onFeedback: () => { setDrawer(true); openFeedback(detail.open, () => render(true)) },
    async onPurge() { // 확인은 메뉴 안 2단계가 이미 받았다
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
    const did = `sgb-tab-desc-${l.id}`
    const b = h('button', { class: 'btn', title: l.desc ?? '', 'aria-describedby': did }, l.floor === 6 ? l.tab : `${l.floor} ${l.tab}`)
    b.addEventListener('click', () => show(i))
    tabs.append(b, h('span', { id: did, hidden: '' }, l.desc ?? ''))
  })

  const syncLayout = () => { detail.setLayout(phone.matches ? 'sheet' : 'side') }
  phone.onchange = syncLayout
  syncLayout()

  const caret = h('button', { class: 'btn sgb-mini sgb-caret', 'aria-label': '작업현황판 열고 닫기' },
    root!.querySelector('.sgb-drawer')!.classList.contains('open') ? '▲' : '▼')
  barEl.replaceChildren(bnd.toggle, bnd.upd, bnd.fb, bnd.more, caret)
  menuHost.replaceChildren(bnd.menu)
  page.replaceChildren(bnd.drop, tabs, h('div', { class: 'body' }, feed, stage.el, detail.el))
  show(restoreTab(curTab, LAYERS.length))
  if (notice) {
    const go = h('button', { class: 'btn' }, 'Board 에서 보기')
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
    latest = isNewer(__BUILD__, v) ? v : null
    bnd.showUpdate(latest)
  }
  void check()
  poll = window.setInterval(check, 60_000)
  document.onvisibilitychange = () => { if (!document.hidden) void check() }
}

// 앱 맨 위에 끼우는 막대 + 위 서랍. host 를 안 주면 body 맨 앞에 붙는다. 두 번 불러도 한 번만 붙는다.
export function mountBoard(host?: HTMLElement): void {
  if (root) return
  root = h('div', { class: 'sgb' })
  barEl = h('div', { class: 'sgb-bar' })
  menuHost = h('div', { class: 'sgb-menuhost' }) // 막대는 overflow 가 잘리니 메뉴는 막대 밖에 둔다
  page = h('div', { class: 'sgb-page' })
  const scrim = h('button', { class: 'sgb-scrim', 'aria-label': '서랍 닫기', hidden: '' })
  const drawer = h('div', { class: 'sgb-drawer' }, h('div', { class: 'sgb-scroll' }, page))
  const set = (on: boolean) => {
    drawer.classList.toggle('open', on)
    scrim.hidden = !on
    barEl.querySelector('.sgb-caret')!.textContent = on ? '▲' : '▼'
    saveOpen(localStorage, on)
  }
  setDrawer = set
  barEl.addEventListener('click', (e) => { if ((e.target as Element).closest('.sgb-toggle, .sgb-caret')) set(!drawer.classList.contains('open')) })
  scrim.addEventListener('click', () => set(false))
  document.addEventListener('keydown', (e) => {
    const t = escTarget(e.key, !!band && !band.menu.hidden, drawer.classList.contains('open'))
    if (t === 'menu') band!.closeMenu(); else if (t === 'drawer') set(false)
  })
  root.append(barEl, menuHost, scrim, drawer)
  if (host) host.append(root); else document.body.prepend(root)
  render()
  void fetchRemote().then((r) => { if (r) { remote = r; render() } })
  // 처음 열림은 그대로 되살린다(슬라이드 없이).
  if (loadOpen(localStorage)) { drawer.style.transition = 'none'; set(true); void drawer.offsetWidth; drawer.style.transition = '' }
}
