import './style.css'
import { loadData } from './data.ts'
import { h } from './dom.ts'
import { loadFeedback } from './lib/feedback.ts'
import { LAYERS } from './layers/registry.ts'
import { restoreTab } from './layers/layer5-logic.ts'
import type { LayerCtx } from './layers/types.ts'
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
const applyCalm = (on: boolean) => document.documentElement.classList.toggle('calm', on)

let poll = 0
let curTab = 0 // 다시 그려도 보던 탭을 되살린다
function mount(notice = false): void {
  clearInterval(poll)
  const app = document.getElementById('app')!
  const data = loadData()
  applyCalm(calmOn())

  const stage = createStage()
  const detail = createDetail()
  const feed = createFeedLog(data.events, (id) => stage.pulse(id))
  const ctx: LayerCtx = { data, openDetail: detail.open, tip: attachTip }

  const band = createBand(data, {
    calm: calmOn(),
    onCalm(on) { localStorage.setItem(CALM_KEY, on ? '1' : '0'); applyCalm(on) },
    onApply: () => void applyUpdate(__BUILD__),
    onFeedback: () => openFeedback(detail.open, () => mount(true)),
    async onPurge() {
      if (!confirm('이 기기에 남은 이 앱의 저장 자료를 비웁니다.\n서버 자료는 안전합니다. 다시 로그인해야 합니다.')) return
      await clearThisDevice()
      mount()
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

  app.replaceChildren(band.el, tabs, h('div', { class: 'body' }, feed, stage.el, detail.el))
  show(restoreTab(curTab, LAYERS.length))
  if (notice) {
    const go = h('button', { class: 'btn' }, '작업장에서 보기')
    go.addEventListener('click', () => {
      show(LAYERS.findIndex((l) => l.floor === 4))
      detail.el.hidden = true // 폰 바텀시트가 카드를 가리지 않게
      const card = stage.el.querySelector<HTMLElement>(`[data-id="${loadFeedback().at(-1)?.id}"]`)
      if (!card) return
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: document.documentElement.classList.contains('calm') ? 'auto' : 'smooth' })
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

mount()
