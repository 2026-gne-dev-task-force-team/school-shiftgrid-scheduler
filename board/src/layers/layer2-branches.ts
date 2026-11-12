import { h } from '../dom.ts'
import type { Branch, GraphCommit } from '../types.ts'
import type { LayerRenderer } from './types.ts'
import { character } from '../ui/character.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'
import { laneHue, layoutGraph, synthGraph } from '../lib/graph-layout.ts'

const PAD = 16, TOP = 30, RH = 40, LW = 26, TEXT_W = 280, DOT = 5 // 여백 · 첫 행 높이 · 행 간격 · 레일 간격 · 글 칸 폭 · 점 반쪽

// 2층 가지 — 개발자가 보는 커밋 그래프(위가 최신 · 레일마다 색 · 점=커밋). 선·점은 canvas(도트풍: 네모 점·매끈 안 함),
// 눌리는 점·이름표·캐릭터는 그 위 DOM. 좁으면 가로 스크롤.
export const layer2: LayerRenderer = {
  id: 'layer2', floor: 2, tab: 'Branch',
  render(host, { data, openDetail, tip }) {
    const trunk = data.branches.find((b) => b.trunk)
    const by = new Map(data.branches.map((b) => [b.id, b]))
    const commits: GraphCommit[] = trunk?.graph?.length ? trunk.graph : synthGraph(data.branches)
    const trunkTip = commits.find((c) => c.refs.some((r) => r.branch_id === trunk?.id))?.sha
    const { nodes, edges, lanes } = layoutGraph(commits, trunkTip)
    const at = new Map(nodes.map((n) => [n.sha, n]))
    const actor = (b: Branch) => data.actors.find((a) => a.id === b.actor_id)
    const who = (b: Branch) => ((a) => a ? `${actorLabel(a, data.actors)} — ${actorWhat(a, data.tasks)}` : '—')(actor(b))

    const canvas = h('canvas', { role: 'img', 'aria-label': '커밋 그래프 — 위가 최신, 가지가 줄기에서 갈라지고 합쳐진 모습' })
    const inner = h('div', { class: 'gg-in gg-v-in' }, canvas)
    const box = h('div', { class: 'gg' }, inner)
    host.append(box)
    const g = canvas.getContext('2d')!
    const ht = TOP + Math.max(1, commits.length) * RH
    const tx = PAD + lanes * LW + 10 // 글 칸 왼쪽
    const x = (l: number) => PAD + l * LW + LW / 2 - 6
    const y = (r: number) => TOP + r * RH + RH / 2 - 8

    const draw = () => {
      const w = Math.max(box.clientWidth, tx + TEXT_W), dpr = devicePixelRatio || 1
      const css = getComputedStyle(box), v = (n: string, d: string) => css.getPropertyValue(n).trim() || d
      inner.style.cssText = `position:relative;width:${w}px;height:${ht}px`
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(ht * dpr)
      canvas.style.cssText = `width:${w}px;height:${ht}px`
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; g.lineCap = 'butt'; g.lineJoin = 'miter'
      inner.querySelectorAll('.gg-dotb,.gg-l,.gg-chip,.gg-msg').forEach((el) => el.remove())
      const neon = v('--neon', '#0e7c72'), bg = v('--bg', '#e6f0f7'), bl = v('--branch-l', '40%')
      const colorOf = (l: number) => (l === 0 ? neon : `hsl(${laneHue(l)} 70% ${bl})`)

      // 선 — 같은 레일은 곧게, 레일이 바뀌면 한 행 안에서 S 곡선으로 꺾는다
      g.lineWidth = 3
      for (const e of edges) {
        g.strokeStyle = colorOf(e.colorLane)
        const x1 = x(e.fromLane), y1 = y(e.fromRow), x2 = x(e.toLane), y2 = e.open ? ht : y(e.toRow)
        g.beginPath(); g.moveTo(x1, y1)
        if (e.bend === 'none') g.lineTo(x2, y2)
        else if (e.bend === 'child') { const ym = Math.min(y1 + RH, y2); g.bezierCurveTo(x1, (y1 + ym) / 2, x2, (y1 + ym) / 2, x2, ym); g.lineTo(x2, y2) }
        else { const ys = Math.max(y2 - RH, y1); g.lineTo(x1, ys); g.bezierCurveTo(x1, (ys + y2) / 2, x2, (ys + y2) / 2, x2, y2) }
        g.stroke()
        if (e.open) { g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x1, y2 - 14); g.lineTo(x1, y2); g.stroke(); g.setLineDash([]) }
      }

      for (const c of commits) {
        const n = at.get(c.sha)!, cx = x(n.lane), cy = y(n.row), col = colorOf(n.lane)
        const merge = c.parents.length > 1, r = merge ? DOT + 1 : DOT
        g.fillStyle = bg; g.fillRect(cx - r - 2, cy - r - 2, 2 * r + 4, 2 * r + 4) // 점 둘레를 비워 선과 떼기
        g.fillStyle = col; g.fillRect(cx - r, cy - r, 2 * r, 2 * r)
        if (merge) { g.fillStyle = bg; g.fillRect(cx - 2, cy - 2, 4, 4) } // 머지 점은 속이 빈 네모

        const dot = h('button', { class: 'gg-dotb', 'aria-label': `커밋 ${c.sha} ${c.subject}` })
        dot.style.cssText = `left:${cx - 11}px;top:${cy - 11}px`
        dot.addEventListener('click', () => openDetail({
          title: c.subject || `커밋 ${c.sha}`,
          rows: [['해시', c.sha], ['시각', c.at ? new Date(c.at).toLocaleString('ko-KR') : '—'],
            ['부모', c.parents.join(', ') || '없음 (맨 처음)'], ['가지 이름표', c.refs.map((r) => r.name).join(', ') || '—']],
        }))
        inner.append(dot)

        // 글 칸: 이름표 칩들 + 메시지
        const row = h('div', { class: 'gg-msg' })
        row.style.cssText = `left:${tx}px;top:${cy - 10}px;width:${w - tx - PAD}px`
        for (const ref of c.refs) {
          const b = ref.branch_id ? by.get(ref.branch_id) : undefined
          const hue = n.lane === 0 ? 180 : laneHue(n.lane)
          const chip = h('button', { class: 'gg-l' }, ref.name)
          chip.style.setProperty('--hue', String(hue))
          if (b) {
            tip(chip, () => `${ref.name} · 앞선 ${b.ahead}개 · ${who(b)}`)
            chip.dataset.id = b.id
            chip.addEventListener('click', () => openDetail({
              title: ref.name, rows: [['앞선 커밋', `${b.ahead}개`], ['맡은 캐릭터', who(b)], ['상태', b.state === 'live' ? '작업 중' : '줄기에 합쳐짐']],
              extra: ((a) => a ? h('div', { class: 'chr-card' }, character(a, 'card')) : undefined)(actor(b)),
            }))
          }
          row.append(chip)
        }
        row.append(h('span', { class: 'gg-sub' }, c.subject), h('span', { class: 'gg-sha' }, c.sha.slice(0, 7)))
        inner.append(row)

        // 가지 끝(맨 앞 커밋) 위에 선 일꾼 — 열린 가지만
        for (const ref of c.refs) {
          const b = ref.branch_id ? by.get(ref.branch_id) : undefined, a = b && b.state === 'live' ? actor(b) : undefined
          if (!a) continue
          const chip = h('span', { class: 'gg-chip' }, character(a, 'mini'))
          chip.style.cssText = `left:${cx - 14}px;top:${cy - DOT - 22}px`
          inner.append(chip)
          break
        }
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
