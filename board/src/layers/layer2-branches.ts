import { h } from '../dom.ts'
import type { Actor, Branch } from '../types.ts'
import type { LayerRenderer } from './types.ts'
import { character } from '../ui/character.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'
import { assignLanes, clampLeft, edgeLimit, graphSpans } from '../lib/graph.ts'

const PAD = 20, TOP = 34, LH = 52, MIN_COL = 84, TAIL = 150 // 여백 · 줄기 높이 · 줄 간격 · 칸 최소 폭 · 오른쪽 꼬리표·칩 자리

// 2층 가지 — 깃 그래프(왼→오른 시간). 선·점은 canvas, 이름표·캐릭터 칩은 그 위 DOM(눌러 상세 · 글자 안 잘림). 좁으면 가로 스크롤.
export const layer2: LayerRenderer = {
  id: 'layer2', floor: 2, tab: 'Branch',
  render(host, { data, openDetail, tip }) {
    const trunk = data.branches.find((b) => b.trunk)
    const by = new Map(data.branches.map((b) => [b.id, b]))
    const { spans, cols } = graphSpans(data.branches, data.events)
    const lane = assignLanes(spans), lanes = Math.max(0, ...lane.values())
    const actor = (b: Branch) => data.actors.find((a) => a.id === b.actor_id)
    const hueOf = (b: Branch) => (10 + 137.5 * spans.findIndex((s) => s.id === b.id)) % 360 // 가지마다 다른 색(황금각 돌림)
    const who = (b: Branch) => ((a) => a ? `${actorLabel(a, data.actors)} — ${actorWhat(a, data.tasks)}` : '—')(actor(b))

    const canvas = h('canvas', { role: 'img', 'aria-label': '가지 그래프 — 줄기에서 갈라지고 합쳐진 가지' })
    const inner = h('div', { class: 'gg-in' }, canvas)
    const box = h('div', { class: 'gg' }, inner)
    host.append(box)
    const g = canvas.getContext('2d')!
    const ht = TOP + (lanes + 1) * LH - 10
    inner.style.height = `${ht}px`
    const y = (l: number) => TOP + l * LH

    const draw = () => {
      const narrow = box.clientWidth < 500, tail = narrow ? 64 : TAIL, minCol = narrow ? 40 : MIN_COL // 폰은 꼬리·칸을 줄여 한 화면에 여러 가지
      const cw = Math.max(minCol, (box.clientWidth - PAD * 2 - tail) / (cols + 1))
      const w = PAD * 2 + (cols + 1) * cw + tail, dpr = devicePixelRatio || 1
      const x = (c: number) => PAD + c * cw
      const css = getComputedStyle(box), v = (n: string, d: string) => css.getPropertyValue(n).trim() || d
      inner.style.width = `${w}px`
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(ht * dpr)
      canvas.style.cssText = `width:${w}px;height:${ht}px`
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round'
      inner.querySelectorAll('.gg-l,.gg-chip').forEach((el) => el.remove())

      const neon = v('--neon', '#0e7c72'), bg = v('--bg', '#e6f0f7'), y0 = y(0)
      g.strokeStyle = neon; g.lineWidth = 4
      g.beginPath(); g.moveTo(x(0), y0); g.lineTo(w - PAD, y0); g.stroke()
      const dot = (cx: number, cy: number, r: number, fill: string, ring = bg) => {
        g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = ring; g.stroke()
      }
      const label = (cls: string, left: number, top: number, kid: Node | string, hue?: number, atEnd = false) => {
        const el = h(hue === undefined ? 'span' : 'button', { class: cls }, kid)
        el.style.cssText = `left:${left}px;top:${top}px${hue === undefined ? '' : `;--hue:${hue}`}`
        inner.append(el)
        el.style.left = `${clampLeft(left, atEnd ? edgeLimit(inner.offsetWidth, box.clientWidth) : inner.offsetWidth, el.offsetWidth)}px` // 이름표·칩 모두 오른쪽 끝에서 잘리지 않게 안으로 · 줄기 끝 칩은 보이는 폭 기준(R83)
        return el
      }
      label('gg-l gg-trunk', x(0), y0 - 30, trunk?.title ?? '줄기')
      // 도는 에이전트인데 자기 열린 가지가 없으면 줄기 끝에 「T-번호」와 함께 선다
      const open = new Set(spans.filter((s) => s.open).map((s) => s.id))
      const idle = data.actors.filter((a) => a.state === 'work' && a.task_id && !open.has(a.branch_id ?? ''))
      const shown = narrow ? idle.slice(0, 2) : idle, more = idle.slice(shown.length) // 좁으면 2개만 · 나머지는 「+N」(누르면 목록)
      const num = (a: Actor) => a.task_id!.replace(/^l-\w+-/, '')
      shown.forEach((a, i) =>
        label('gg-chip', w - PAD - 90 - i * 90 - (more.length ? 44 : 0), y0 - 34, h('span', null, character(a, 'mini'), ` ${num(a)}`), undefined, true))
      if (more.length) {
        const btn = label('gg-l', w - PAD - 40, y0 - 34, `+${more.length}`, 200, true)
        btn.addEventListener('click', () => openDetail({ title: '줄기 끝에서 도는 일꾼', rows: idle.map((a) => [num(a), actorLabel(a, data.actors)] as [string, string]) }))
      }

      for (const s of spans) {
        const b = by.get(s.id)!, yl = y(lane.get(s.id)!), col = `hsl(${hueOf(b)} 70% ${v('--branch-l', '40%')})`
        const fx = x(s.from), mid = fx + cw / 2, head = Math.max(x(s.to), mid)
        g.strokeStyle = col; g.lineWidth = 3
        g.beginPath(); g.moveTo(fx, y0); g.bezierCurveTo(fx + cw * 0.3, y0, mid - cw * 0.2, yl, mid, yl)
        if (s.open) g.lineTo(head, yl)
        else { const mx = x(s.to) - cw / 2; g.lineTo(mx, yl); g.bezierCurveTo(mx + cw * 0.2, yl, x(s.to) - cw * 0.3, y0, x(s.to), y0) }
        g.stroke()
        dot(fx, y0, 4, neon) // 갈라진 자리
        if (s.open) {
          const n = Math.max(1, b.ahead) // 커밋 점 — 마지막이 머리
          for (let i = 1; i <= n; i++) dot(mid + ((head - mid) * i) / n, yl, 5, col)
          g.setLineDash([4, 5]); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(head + 8, yl); g.lineTo(head + cw * 0.5, yl); g.stroke(); g.setLineDash([]) // 끝이 열림
          const a = actor(b)
          if (a) label('gg-chip', head + 10, yl - 21, character(a, 'mini')) // 가지 끝(머리 점) 옆
        } else dot(x(s.to), y0, 7, col, neon) // 합침 점은 크게
        const btn = label('gg-l', mid + 4, yl + 6, b.title, hueOf(b))
        btn.dataset.id = b.id
        tip(btn, () => `${b.title} · 앞선 ${b.ahead}개 · ${who(b)}`)
        btn.addEventListener('click', () => openDetail({
          title: b.title, rows: [['앞선 커밋', `${b.ahead}개`], ['맡은 캐릭터', who(b)], ['상태', b.state === 'live' ? '작업 중' : '줄기에 합쳐짐']],
          extra: ((a) => a ? h('div', { class: 'chr-card' }, character(a, 'card')) : undefined)(actor(b)),
        }))
      }
    }

    const ro = new ResizeObserver(draw); ro.observe(box)
    // 화면 밝기가 바뀌면(스위치 · 기기 설정) canvas 색을 새 변수값으로 다시 그린다
    const root = box.closest('.sgb'), mq = matchMedia('(prefers-color-scheme: dark)'), mo = new MutationObserver(draw)
    if (root) mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', draw)
    draw()
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', draw) }
  },
}
