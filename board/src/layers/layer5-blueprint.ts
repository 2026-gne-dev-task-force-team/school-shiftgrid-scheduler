import { h } from '../dom.ts'
import { clampZoom, groupHouses, lineOf, roomCount } from './layer5-logic.ts'
import type { LayerRenderer } from './types.ts'

const STATE_NAME = { plan: 'Plan', build: 'Building', built: 'Built' }

// 5층 설계도 집 — 집 = 부모 모듈, 방 = 자식. 선 종류가 상태(유령·비계·실선). 확대는 휠·버튼·두 손가락.
export const layer5: LayerRenderer = {
  id: 'layer5', floor: 5, tab: 'Blueprint',
  render(host, { data, openDetail, tip }) {
    const houses = groupHouses(data.modules)
    const { total, built } = roomCount(houses)
    const taskTitle = (id: string | null) => data.tasks.find((t) => t.id === id)?.title ?? '없음'

    const canvas = h('div', { class: 'bp-canvas' })
    for (const hs of houses) {
      const rooms = hs.rooms.map((m) => {
        const b = h('button', { class: `bp-room ${lineOf(m.state)}`, 'data-id': m.id }, m.name)
        b.addEventListener('click', () => openDetail({ title: m.name, rows: [['상태', STATE_NAME[m.state]], ['연결된 일감', taskTitle(m.task_id)], ...(m.note ? [['번호·설계 절', m.note] as [string, string]] : [])] }))
        tip(b, () => `${m.name} · ${STATE_NAME[m.state]}`)
        return b
      })
      canvas.append(h('section', { class: 'bp-house' }, h('header', null, hs.root.name), h('div', { class: 'bp-rooms' }, ...rooms)))
    }

    let zoom = 1
    const apply = () => { canvas.style.transform = `scale(${zoom})` }
    const set = (z: number) => { zoom = clampZoom(z); apply() }
    const zbtn = (t: string, label: string, f: number) => {
      const b = h('button', { class: 'btn', 'aria-label': label }, t)
      b.addEventListener('click', () => set(zoom * f))
      return b
    }
    const view = h('div', { class: 'bp-view' }, canvas)
    view.addEventListener('wheel', (e) => { e.preventDefault(); set(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }, { passive: false })
    // 폰 핀치 — touch-action 이 브라우저 확대를 막고 두 손가락 거리를 직접 잰다.
    const pts = new Map<number, { x: number; y: number }>()
    let d0 = 0, z0 = 1
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
    view.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = zoom } })
    view.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && d0 > 0) set(z0 * dist() / d0)
    })
    const up = (e: PointerEvent) => { pts.delete(e.pointerId) }
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up)

    host.append(h('div', { class: 'bp' }, h('div', { class: 'bp-bar' }, h('strong', null, `방 ${total}개 중 ${built}개`), zbtn('−', '축소', 1 / 1.25), zbtn('+', '확대', 1.25)), view))
  },
}
