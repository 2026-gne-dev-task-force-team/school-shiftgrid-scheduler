import './style.css'
import { DEFAULT_APP, readApp, versionCheckOn, type AppId } from './lib/app.ts'
import { loadData } from './data.ts'
import { h, isCalm } from './dom.ts'
import { FEEDBACK_CHANGED, loadFeedback } from './lib/feedback.ts'
import { LAYERS } from './layers/registry.ts'
import { restoreTab } from './layers/layer5-logic.ts'
import type { LayerCtx } from './layers/types.ts'
import { escTarget, loadOpen, saveOpen } from './lib/drawer.ts'
import { isTyping, loadAuto, saveAuto, shouldAutoApply } from './lib/autoupdate.ts'
import { applyUpdate, clearThisDevice, loadSeen } from './lib/purge.ts'
import { loadTheme, saveTheme, type Theme } from './lib/theme.ts'
import { fetchRemote, type Remote } from './lib/remote.ts'
import { connectRealtime } from './lib/realtime.ts'
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
  return s === '1' // 사용자가 직접 켤 때만 — 시스템 설정·폰 폭으로 자동으로 켜지 않는다
}

let app: AppId = DEFAULT_APP // 마운트 자리의 data-app
let root: HTMLElement | null = null
let page: HTMLElement
let barEl: HTMLElement
let menuHost: HTMLElement
let poll = 0
let band: ReturnType<typeof createBand> | null = null
let remote: Remote | null = null // 원격이 오면 담아 두고 다시 그린다
let live: boolean | undefined // 실시간 소켓 상태. undefined = 소켓을 안 쓴다(키 없음·목업)
let latest: VersionInfo | null = null // 띠에 띄운 새 판
let runCheck: () => Promise<void> = async () => {} // 새 판 확인을 지금 한 번 — 체크박스를 켰을 때·입력이 끝났을 때도 부른다
let curTab = 0 // 다시 그려도 보던 탭을 되살린다
let detailEl: HTMLElement | null = null
let setDrawer: (on: boolean) => void = () => {}
function render(notice = false): void {
  clearInterval(poll)
  band?.dispose()
  const data = loadData(Date.now(), remote, app)
  const applyCalm = (on: boolean) => root!.classList.toggle('calm', on)
  applyCalm(calmOn())
  const theme = loadTheme(localStorage)
  root!.dataset.theme = theme // CSS 가 light·dark·auto(@media 로 기기 따라)를 가른다

  const stage = createStage()
  const detail = createDetail()
  detailEl = detail.el
  const feed = createFeedLog(data.events, (id) => stage.pulse(id), data.actors)
  const ctx: LayerCtx = { data, openDetail: detail.open, tip: attachTip }

  const bnd = band = createBand(data, {
    app,
    calm: calmOn(),
    live,
    theme,
    onTheme(t: Theme) { saveTheme(localStorage, t); root!.dataset.theme = t },
    onCalm(on) { localStorage.setItem(CALM_KEY, on ? '1' : '0'); applyCalm(on) },
    auto: loadAuto(localStorage),
    onAuto(on) { saveAuto(localStorage, on); void runCheck() },
    onApply: () => void applyUpdate(latest?.build ?? __BUILD__), // 새 판 번호로 열어야 옛 index.html 사본을 피한다
    // 접수 창은 서랍 안 상세 칸에 뜨니, 닫힌 서랍이면 먼저 연다.
    onFeedback: () => { setDrawer(true); openFeedback(detail.open, () => render(true), app) },
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
    const b = h('button', { class: 'btn', title: l.desc ?? '', 'aria-describedby': did }, ...(l.floor === 6 ? [l.tab] : [h('span', { class: 'tn' }, String(l.floor)), ` ${l.tab}`]))
    b.addEventListener('click', () => show(i))
    tabs.append(b, h('span', { id: did, hidden: '' }, l.desc ?? ''))
  })

  const syncLayout = () => { detail.setLayout(phone.matches ? 'sheet' : 'side') }
  phone.onchange = syncLayout
  syncLayout()

  const caret = h('button', { class: 'btn sgb-mini sgb-caret', 'aria-label': '작업현황판 열고 닫기' },
    root!.querySelector('.sgb-drawer')!.classList.contains('open') ? '▲' : '▼')
  barEl.replaceChildren(bnd.editions, bnd.toggle, bnd.upd, bnd.auto, bnd.fb, bnd.more, caret)
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
    if (!versionCheckOn(app)) return // v1·v2 주입 자리: 판 확인 끔(app.ts versionCheckOn)
    const v: VersionInfo | null = await fetchVersion()
    latest = isNewer(__BUILD__, v, loadSeen()) ? v : null
    bnd.showUpdate(latest)
    // 자동 바꾸기 — 앱에 「안 올라간 변경」 신호가 없어 입력 포커스만 본다. 미뤄진 건 다음 확인(1분·탭 복귀·입력 끝)이 다시 묻는다.
    if (shouldAutoApply({ on: loadAuto(localStorage), local: __BUILD__, latest, seen: loadSeen(), typing: isTyping(document.activeElement) })) void applyUpdate(latest!.build)
  }
  runCheck = check
  void check()
  poll = window.setInterval(check, 60_000)
  document.onvisibilitychange = () => { if (!document.hidden) void check() }
}

// 앱 맨 위에 끼우는 막대 + 위 서랍. host 를 안 주면 body 맨 앞에 붙는다. 두 번 불러도 한 번만 붙는다.
export function mountBoard(host?: HTMLElement): void {
  if (root) return
  app = readApp(host)
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
    const t = escTarget(e.key, !!band && !band.menu.hidden, !!detailEl && !detailEl.hidden, drawer.classList.contains('open'))
    if (t === 'menu') band!.closeMenu(); else if (t === 'detail') detailEl!.hidden = true; else if (t === 'drawer') set(false)
  })
  document.addEventListener('focusout', () => setTimeout(() => { if (loadAuto(localStorage)) void runCheck() }, 0)) // 입력이 끝나면 미뤄 둔 자동 바꾸기를 다시 묻는다
  window.addEventListener(FEEDBACK_CHANGED, () => render()) // Inbox 에서 지우기·상태 바꾸기 → Board·흐름 줄도 즉시
  root.append(barEl, menuHost, scrim, drawer)
  if (host) host.append(root); else document.body.prepend(root)
  render()
  const refresh = () => fetchRemote().then((r) => { if (r) { remote = r; render() } })
  void refresh()
  // 실시간 소켓이 있으면 바뀜 알림에 다시 읽고, 소켓이 끊긴 동안은 1분 주기 읽기가 받친다. 키가 없으면 둘 다 안 한다.
  const rt = connectRealtime({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY,
    onChange: () => void refresh(), onStatus(on) { live = on; band?.setLive(on) } })
  if (rt) { live = false; band?.setLive(false); setInterval(() => { if (!live && !document.hidden) void refresh() }, 60_000) }
  // 처음 열림은 그대로 되살린다(슬라이드 없이).
  if (loadOpen(localStorage)) { drawer.style.transition = 'none'; set(true); void drawer.offsetWidth; drawer.style.transition = '' }
}
