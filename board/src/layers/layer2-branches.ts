import { h } from '../dom.ts'
import type { Branch, GraphCommit } from '../types.ts'
import type { LayerRenderer } from './types.ts'
import { character } from '../ui/character.ts'
import { actorTag } from '../ui/actor-tag.ts'
import { actorLabel, actorWhat } from '../lib/actor.ts'
import { laneHue, layoutGraph, synthGraph } from '../lib/graph-layout.ts'
import { filesList, filesRows, renderCylinder } from './layer2-cylinder.ts'
import type { LayerCtx } from './types.ts'

const PAD = 16, TOP = 30, RH = 40, LW = 26, TEXT_W = 280, DOT = 5 // 여백 · 첫 행 높이 · 행 간격 · 레일 간격 · 글 칸 폭 · 점 반쪽

const CHIP_MAX = 160, GAP = 6, SHA_W = 60, MORE_W = 40 // 이름표 최대 폭 · 간격 · 해시 칸 · 「+N」 칸

/** 글 칸 폭에 이름표가 다 안 들어가면 앞에서부터 들어가는 만큼만 보이고 나머지는 「+N」으로 접는다(R87). 최소 1개는 보인다. */
export function fitRefs<T extends { name: string }>(refs: T[], avail: number): { shown: T[]; hidden: T[] } {
  const wOf = (r: T) => Math.min(CHIP_MAX, r.name.length * 8 + 18) + GAP
  let used = SHA_W
  const shown: T[] = []
  for (const [i, r] of refs.entries()) {
    const rest = refs.length - i - 1
    if (shown.length && used + wOf(r) + (rest ? MORE_W : 0) > avail) break
    shown.push(r); used += wOf(r)
  }
  return { shown, hidden: refs.slice(shown.length) }
}

/** 한 칸에 선 캐릭터 — 앞에서 max 명만 나란히, 나머지는 「+N」 수로(R94 ③). */
export const crowd = <T,>(xs: T[], max = 2): { shown: T[]; more: number } => ({ shown: xs.slice(0, max), more: Math.max(0, xs.length - max) })

/** 그래프에 쓸 커밋 목록 — 줄기 행의 graph, 없으면(구판·서버 칸 미적용) 가지 정보로 얼개. */
const commitsOf = (branches: Branch[]): GraphCommit[] => ((t) => t?.graph?.length ? t.graph : synthGraph(branches))(branches.find((b) => b.trunk))

type View = 'cyl' | 'flat'
let view: View = 'cyl' // 기본은 원통(R94) — 무거우면 평면으로 끈다. 층을 오가도 고른 보기를 기억한다.

// 2층 가지 — 기본은 3D 원통(layer2-cylinder.ts · R94), 스위치로 평면 커밋 그래프(아래 renderFlat).
export const layer2: LayerRenderer = {
  id: 'layer2', floor: 2, tab: '갈래',
  render(host, ctx) {
    const body = h('div', { class: 'gc-body' })
    const btn = h('button', { class: 'gc-switch', 'aria-pressed': 'false' })
    const bar = h('div', { class: 'gc-bar' }, btn)
    host.append(bar, body)
    let off: (() => void) | void
    const show = () => {
      off?.(); body.replaceChildren()
      btn.textContent = view === 'cyl' ? '평면으로 보기' : '원통으로 보기'
      btn.setAttribute('aria-pressed', view === 'flat' ? 'true' : 'false')
      off = view === 'cyl' ? renderCylinder(body, ctx, commitsOf(ctx.data.branches)) : renderFlat(body, ctx)
    }
    btn.addEventListener('click', () => { view = view === 'cyl' ? 'flat' : 'cyl'; show() })
    show()
    return () => off?.()
  },
}

// 평면 보기 — 개발자가 보는 커밋 그래프(위가 최신 · 레일마다 색 · 점=커밋). 선·점은 canvas(도트풍: 네모 점·매끈 안 함),
// 눌리는 점·이름표·캐릭터는 그 위 DOM. 좁으면 가로 스크롤.
function renderFlat(host: HTMLElement, ctx: LayerCtx): () => void {
    const { data, openDetail, tip } = ctx
    const trunk = data.branches.find((b) => b.trunk)
    const by = new Map(data.branches.map((b) => [b.id, b]))
    const commits: GraphCommit[] = commitsOf(data.branches)
    const trunkTip = commits.find((c) => c.refs.some((r) => r.branch_id === trunk?.id))?.sha
    const { nodes, edges, lanes } = layoutGraph(commits, trunkTip)
    const at = new Map(nodes.map((n) => [n.sha, n]))
    const actor = (b: Branch) => data.actors.find((a) => a.id === b.actor_id)
    const who = (b: Branch) => ((a) => a ? `${actorLabel(a, data.actors, data.tasks)} — ${actorWhat(a, data.tasks)}` : '—')(actor(b))

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
            ['부모', c.parents.join(', ') || '없음 (맨 처음)'], ['가지 이름표', c.refs.map((r) => r.name).join(', ') || '—'], ...filesRows(c)],
          extra: filesList(c),
        }))
        inner.append(dot)

        // 글 칸: 이름표 칩들 + 메시지
        const row = h('div', { class: 'gg-msg' })
        row.style.cssText = `left:${tx}px;top:${cy - 10}px;width:${w - tx - PAD}px`
        const { shown, hidden } = fitRefs(c.refs, w - tx - PAD)
        for (const ref of shown) {
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
        if (hidden.length) {
          const more = h('button', { class: 'gg-l gg-more' }, `+${hidden.length}`)
          more.style.setProperty('--hue', String(n.lane === 0 ? 180 : laneHue(n.lane)))
          more.addEventListener('click', () => openDetail({ title: `가지 이름표 ${c.refs.length}개`, rows: c.refs.map((r) => [r.name, r.branch_id && by.get(r.branch_id) ? who(by.get(r.branch_id)!) : '—'] as [string, string]) }))
          row.append(more)
        }
        row.append(h('span', { class: 'gg-sub' }, c.subject), h('span', { class: 'gg-sha' }, c.sha.slice(0, 7)))
        inner.append(row)

        // 가지 끝(맨 앞 커밋) 위에 선 일꾼 — 열린 가지만. 한 칸에 여럿이면 겹치지 않게 옆으로 나란히 + 「+N」 묶음(R94 ③).
        const here = c.refs.map((ref) => ref.branch_id ? by.get(ref.branch_id) : undefined)
          .flatMap((b) => (b && b.state === 'live' && actor(b) ? [actor(b)!] : []))
        const { shown: on, more: rest } = crowd([...new Map(here.map((a) => [a.id, a])).values()])
        if (on.length) {
          const chip = h('span', { class: 'gg-chip gg-crowd' }, ...on.map((a) => actorTag(ctx, a, { size: 'mini', text: 'name' })))
          if (rest) chip.append(h('span', { class: 'gg-crowd-more', title: `캐릭터 ${rest}명 더` }, `+${rest}`))
          chip.style.cssText = `left:${cx - 14}px;top:${cy - DOT - 22}px`
          inner.append(chip)
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
}
