import { h } from '../dom.ts'
import { clampZoom, groupHouses, lineOf, roomCount } from './layer5-logic.ts'
import { crewByModule, layoutGraph, labelWidth, linkModules, stateOf } from './layer5-graph.ts'
import { BP_EDGES, BP_MODULES, BP_OVERVIEW, type BpModule } from '../data/blueprint-modules.ts'
import { actorTag } from '../ui/actor-tag.ts'
import type { LayerRenderer } from './types.ts'

const STATE_NAME = { plan: '계획', build: '짓는 중', built: '완성' }
const NS = 'http://www.w3.org/2000/svg'
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: (Node | string)[]) => {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  el.append(...kids)
  return el
}
/** 「shared/」·「코어 5」 도 쓸 수 있는 DOM id. */
const domId = (id: string) => `bp-m-${[...id].map((c) => (/[\w-]/.test(c) ? c : c === '/' ? '' : `_${c.charCodeAt(0)}`)).join('')}`

// 5층 설계도 — 「1.2v 설계 ① 통합 구조」 의 모듈을 상자 + 화살표 도식으로(R91). 위 = 사람이 만지는 판, 아래 = 바닥 모듈.
// 휠은 그냥 스크롤이다(확대·축소는 + / − 단추만). 상자를 누르면 아래 설명 칸이 펼쳐진다.
export const layer5: LayerRenderer = {
  id: 'layer5', floor: 5, tab: '설계도',
  render(host, ctx) {
    const { data, tip } = ctx
    const { total, built } = roomCount(groupHouses(data.modules))
    const link = linkModules(data.modules, BP_MODULES)
    const { by: crew, lost } = crewByModule(data.actors, data.modules, data.tasks, BP_MODULES, link)
    const crewTags = (id: string, text: 'full' | 'name', nested = false) => (crew.get(id) ?? []).map((a) => h('span', { class: 'bp-crew' }, actorTag(ctx, a, { size: 'mini', text, nested })))
    const nameOf = (id: string) => BP_MODULES.find((m) => m.id === id)?.title ?? id
    const taskTitle = (id: string | null) => data.tasks.find((t) => t.id === id)?.title
    const g = layoutGraph(BP_MODULES, BP_EDGES)

    // 설명 칸 — 모듈마다 하나, 처음엔 접힘.
    const row = (label: string, ...kids: (Node | string)[]) => h('div', { class: 'bp-row' }, h('dt', null, label), h('dd', null, ...kids))
    const list = (items: string[]) => h('ul', null, ...items.map((x) => h('li', null, x)))
    const descOf = (m: BpModule) => {
      const st = stateOf(m.id, data.modules, link)
      const rooms = data.modules.filter((x) => x.parent && link.get(x.id) === m.id)
      const outs = BP_EDGES.filter((e) => e.from === m.id).map((e) => `→ ${nameOf(e.to)} (${e.to}) — ${e.label}`)
      const ins = BP_EDGES.filter((e) => e.to === m.id).map((e) => `← ${nameOf(e.from)} (${e.from}) — ${e.label}`)
      return h('details', { class: 'bp-desc', id: domId(m.id), 'data-id': m.id },
        h('summary', null, h('span', { class: `bp-dot ${lineOf(st)}` }), h('b', null, m.title), h('code', null, m.id), h('small', null, `${m.kind} · ${STATE_NAME[st]}`), ...crewTags(m.id, 'full', true)),
        h('dl', null,
          row('무엇을 하나', m.does),
          row('들어가는 것', m.inputs),
          row('나오는 것', m.outputs),
          row('기대는 곳', outs.length ? list(outs) : '없음 — 맨 바닥이라 다른 모듈을 쓰지 않는다'),
          row('쓰이는 곳', ins.length ? list(ins) : '없음 — 맨 위 판이라 사람이 직접 연다'),
          row('주요 파일', list(m.files)),
          row('판(태스크) 번호', m.tasks.join(' · '), ...(rooms.length ? [list(rooms.map((r) => `${r.name} — ${STATE_NAME[r.state]}${taskTitle(r.task_id) ? ` · 일감 「${taskTitle(r.task_id)}」` : ''}`))] : [])),
          row('설계 ① 절', m.sections.join(' · '))))
    }
    const descs = BP_MODULES.map(descOf)
    const descById = new Map(BP_MODULES.map((m, i) => [m.id, descs[i]]))

    // 도식 — 밑 SVG 에 화살표·이름표, 위에 상자(HTML — 캐릭터 이름표를 그대로 얹으려고).
    const defs = svg('defs', {}, svg('marker', { id: 'bp-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'bp-arrowhead' })))
    const paths = g.edges.map((e) => svg('path', { d: e.d, class: 'bp-edge', 'marker-end': 'url(#bp-arrow)', 'data-from': e.from, 'data-to': e.to }, svg('title', {}, `${nameOf(e.from)} → ${nameOf(e.to)} : ${e.label}`)))
    const labels = g.edges.map((e) => {
      const w = labelWidth(e.label)
      return svg('g', { class: 'bp-elabel', 'data-from': e.from, 'data-to': e.to, transform: `translate(${(e.lx - w / 2).toFixed(1)},${(e.ly - 9).toFixed(1)})` },
        svg('rect', { width: w.toFixed(1), height: 18, rx: 4 }), svg('text', { x: (w / 2).toFixed(1), y: 13, 'text-anchor': 'middle' }, e.label))
    })
    const art = svg('svg', { class: 'bp-svg', width: g.width, height: g.height, viewBox: `0 0 ${g.width} ${g.height}`, 'aria-hidden': 'true' }, defs, ...paths, ...labels)

    const boxes = BP_MODULES.map((m) => {
      const b = g.boxes.get(m.id)!
      const st = stateOf(m.id, data.modules, link)
      const btn = h('button', { class: `bp-node bp-room ${lineOf(st)}`, 'data-id': m.id, 'aria-controls': domId(m.id) },
        h('b', null, m.title), h('code', null, m.id), h('small', null, `${m.kind} · ${STATE_NAME[st]}`))
      btn.addEventListener('click', () => {
        const d = descById.get(m.id)!
        d.open = true
        for (const x of host.querySelectorAll('.bp-node.on, .bp-desc.on')) x.classList.remove('on')
        btn.classList.add('on'); d.classList.add('on')
        d.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      })
      tip(btn, () => `${m.title} · ${STATE_NAME[st]} — 누르면 아래에 설명이 펼쳐집니다`)
      // 캐릭터는 상자 아래 테두리에 배지처럼 — 단추 안에 단추(이름표)를 넣지 않으려고 형제로 둔다.
      const tags = crewTags(m.id, 'name')
      return h('div', { class: 'bp-box', style: `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px` }, btn, ...(tags.length ? [h('span', { class: 'bp-slot' }, ...tags)] : []))
    })
    const graph = h('div', { class: 'bp-graph', style: `width:${g.width}px;height:${g.height}px` }, art, ...boxes)
    const sizer = h('div', { class: 'bp-sizer' }, graph)
    // 휠·두 손가락에는 아무것도 묶지 않는다 — 브라우저 기본 스크롤 그대로(R91 ①). 배율은 아래 단추만 바꾼다.
    const view = h('div', { class: 'bp-view' }, sizer)

    let zoom = 1
    const set = (z: number) => {
      zoom = clampZoom(z)
      graph.style.transform = zoom === 1 ? '' : `scale(${zoom})`
      sizer.style.width = `${g.width * zoom}px`; sizer.style.height = `${g.height * zoom}px`
      view.dataset.zoom = String(zoom)
    }
    const zbtn = (t: string, label: string, next: () => number) => {
      const b = h('button', { class: 'btn', 'aria-label': label, title: label }, t)
      b.addEventListener('click', () => set(next()))
      return b
    }
    set(1)

    const overview = h('section', { class: 'bp-overview' }, h('h3', null, '앱 전체가 어떻게 도나'), h('ol', null, ...BP_OVERVIEW.map((x) => h('li', null, x))))
    const bar = h('div', { class: 'bp-bar' }, h('strong', null, `모듈 ${BP_MODULES.length}개 · 판 ${total}개 중 ${built}개 완성`),
      zbtn('−', '축소', () => zoom / 1.25), zbtn('+', '확대', () => zoom * 1.25), zbtn('1:1', '원래 크기', () => 1))
    const legend = h('p', { class: 'bp-legend' }, '화살표 = 「쓴다」(화살 끝이 내주는 쪽) · 이름표 = 오가는 것 · 위 = 사람이 여는 판, 아래 = 바닥 모듈 · ',
      h('span', { class: 'bp-dot solid' }), '완성 ', h('span', { class: 'bp-dot scaffold' }), '짓는 중 ', h('span', { class: 'bp-dot ghost' }), '계획')

    const parts: HTMLElement[] = [overview, bar, legend, view, h('h3', { class: 'bp-desc-h' }, '모듈마다 자세히 — 상자를 누르거나 줄을 펼치세요'), h('div', { class: 'bp-descs' }, ...descs)]
    if (lost.length) parts.push(h('section', { class: 'bp-lost' }, h('header', null, '어느 모듈인지 모름'), h('div', { class: 'bp-rooms' }, ...lost.map((a) => h('span', { class: 'bp-crew' }, actorTag(ctx, a, { size: 'mini' }))))))
    host.append(h('div', { class: 'bp' }, ...parts))
  },
}
