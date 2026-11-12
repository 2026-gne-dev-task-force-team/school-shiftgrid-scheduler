import { h, isCalm, sgbRoot } from '../dom.ts'
import type { Branch } from '../types.ts'
import { hitTest, project, type Seg } from './layer2-logic.ts'
import type { LayerRenderer } from './types.ts'

interface Look { vis: boolean; grow: number; merge: number } // 보임 · 자라는 정도 · 줄기로 합쳐지는 정도
const REPLAY_MS = 17000 // 목업: events 의 가지 따기·합치기를 이 간격으로 한 건씩 재생
const GROW_S = 2, MERGE_S = 2.5, SPIN = 0.12 // 초 · 초 · rad/s
const PAD = 24, R_FRAC = 0.36

// 2층 브랜치 무대 — canvas 2D 원통. 가지마다 θ, y=r·sinθ, 크기·밝기=cosθ, 글자도 같은 변환.
export const layer2: LayerRenderer = {
  id: 'layer2', floor: 2, tab: '가지',
  render(host, { data, openDetail, tip }) {
    const trunk = data.branches.find((b) => b.trunk)
    const work = data.branches.filter((b) => !b.trunk)
    const by = new Map(work.map((b) => [b.id, b]))
    const look = new Map<string, Look>(work.map((b) => [b.id, { vis: b.state === 'live', grow: 1, merge: 0 }]))
    const hueOf = (b: Branch) => data.actors.find((a) => a.id === b.actor_id)?.hue ?? 200
    const who = (b: Branch) => data.actors.find((a) => a.id === b.actor_id)?.name ?? '—'
    const replay = data.events.filter((e) => e.subject_type === 'branch' && (e.kind === 'branch.create' || e.kind === 'branch.merge'))
      .sort((a, b) => a.ts.localeCompare(b.ts))

    const canvas = h('canvas', { role: 'img', 'aria-label': '브랜치 원통' })
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab'
    const box = h('div', { class: 'cyl' }, canvas)
    box.style.cssText = 'width:100%;height:min(60vh,360px);min-height:240px'
    host.append(box)
    const g = canvas.getContext('2d')!
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || isCalm()

    let w = 0, ht = 0, rot = 0, pan = 0, hover: string | null = null, raf = 0, last = 0, segs: Seg[] = []
    let dragging = false, sx = 0, sy = 0, px = 0, py = 0, moved = 0

    const kick = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame) } }
    const resize = () => {
      const dpr = devicePixelRatio || 1
      w = box.clientWidth; ht = box.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(ht * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      kick()
    }

    const draw = () => {
      g.clearRect(0, 0, w, ht)
      const cy = ht / 2, ids = work.map((b) => b.id), bw = w - PAD * 2
      const ps = project(ids, rot, ht * R_FRAC).sort((a, b) => a.cos - b.cos)
      const fs = innerWidth < 768 ? 15 : 14
      segs = []
      const pass = (list: typeof ps) => {
        for (const p of list) {
          const b = by.get(p.id)!, lk = look.get(p.id)!
          if (!lk.vis) continue
          const fx = PAD + bw * (0.08 + 0.22 * (ids.indexOf(p.id) % 3)) + pan
          const len = bw * (0.3 + 0.06 * Math.min(b.ahead, 5)) * lk.grow
          const y = cy + p.y * (1 - lk.merge), sc = 0.55 + 0.45 * p.cos, x2 = fx + 40 + len
          const bright = (p.cos + 1) / 2
          const a = (0.2 + 0.8 * bright) * (lk.merge > 0.9 ? (1 - lk.merge) * 10 : 1)
          const col = `hsl(${hueOf(b)} 70% ${40 + 20 * bright}%)`
          g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = 4 * sc; g.lineCap = 'round'
          if (p.cos > 0 && hover === p.id) { g.shadowColor = col; g.shadowBlur = 14; g.translate(0, -3) }
          g.beginPath(); g.moveTo(fx, cy); g.bezierCurveTo(fx + 30, cy, fx + 10, y, fx + 40, y); g.lineTo(x2, y)
          if (lk.merge > 0) g.bezierCurveTo(x2 + 40, y, x2 + 20, cy, x2 + 60, cy) // 줄기로 휘어 든다
          g.stroke()
          if (lk.merge > 0 && lk.merge < 1) { // 합치는 빛이 가지를 따라 흐른다
            const t = lk.merge
            g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10
            g.beginPath(); g.arc(fx + 40 + (x2 - fx - 40) * t, y + (cy - y) * t * t, 4 * sc, 0, 7); g.fill()
          }
          g.fillStyle = col; g.beginPath(); g.arc(x2, y, 5 * sc, 0, 7); g.fill() // 가지 끝 점 = 캐릭터 자리
          g.restore()
          if (p.cos > 0) { // 앞면: 이름표를 또렷하게(원통 크기 무관 고정 글자) — 과녁은 선+이름표 상자
            const tx = fx + 48
            g.save(); g.font = `${fs}px system-ui`; g.lineJoin = 'round'
            const w2 = g.measureText(b.title).width
            g.strokeStyle = '#0b0f17'; g.lineWidth = 4; g.strokeText(b.title, tx, y - 6)
            g.fillStyle = '#fff'; g.fillText(b.title, tx, y - 6); g.restore()
            segs.push({ id: p.id, x1: fx + 40, x2: Math.max(x2, tx + w2), y: y - 5, cos: p.cos })
          }
        }
      }
      pass(ps.filter((p) => p.cos < 0))
      g.save(); g.strokeStyle = '#4fd1c5'; g.shadowColor = '#4fd1c5'; g.shadowBlur = 12; g.lineWidth = 9; g.lineCap = 'round'
      g.beginPath(); g.moveTo(PAD, cy); g.lineTo(w - PAD, cy); g.stroke()
      g.shadowBlur = 0; g.fillStyle = '#dbe6f5'; g.font = '600 13px system-ui'; g.fillText(trunk?.title ?? '줄기', PAD, cy - 12); g.restore()
      pass(ps.filter((p) => p.cos >= 0))
    }

    const frame = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0
      let animating = false
      last = t
      if (!reduce()) rot += SPIN * dt
      for (const lk of look.values()) {
        if (lk.grow < 1) { lk.grow = Math.min(1, lk.grow + dt / GROW_S); animating = true }
        if (lk.merge > 0 && lk.merge < 1) { lk.merge = Math.min(1, lk.merge + dt / MERGE_S); animating = true; if (lk.merge >= 1) lk.vis = false }
      }
      draw()
      raf = !reduce() || animating || dragging ? requestAnimationFrame(frame) : 0
    }

    let k = 0
    const step = () => { // 이벤트 한 건 재생 — 동작 줄임이면 애니메이션 없이 바로 결과
      const e = replay[k++ % replay.length], lk = e && look.get(e.subject_id)
      if (!e || !lk) return
      const still = reduce()
      if (e.kind === 'branch.create') Object.assign(lk, { vis: true, grow: still ? 1 : 0, merge: 0 })
      else Object.assign(lk, { vis: !still, grow: 1, merge: still ? 1 : 0.001 })
      kick()
    }
    const timer = replay.length ? window.setInterval(step, REPLAY_MS) : 0

    // 끌기: 세로 = θ(원통 돌리기) · 가로 = 시간 쪽으로 밀기 · 휠 = 돌리기
    const tol = () => (innerWidth < 768 ? 22 : 12) // 과녁 반높이: PC 24px · 폰 44px
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
    const setHover = (id: string | null, e: PointerEvent) => {
      if (id === hover) return
      hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'
      // 툴팁은 요소 단위라 가지가 바뀔 때마다 합성 enter/leave 로 새 글을 띄운다
      canvas.dispatchEvent(new PointerEvent(id ? 'pointerenter' : 'pointerleave', { pointerType: 'mouse', clientX: e.clientX, clientY: e.clientY }))
      kick()
    }
    canvas.addEventListener('pointerenter', (e) => { if (e.isTrusted) e.stopImmediatePropagation() }) // 진짜 enter 는 가지 위일 때만 합성으로
    tip(canvas, () => { const b = hover ? by.get(hover) : null; return b ? `${b.title} · 앞선 ${b.ahead}개 · ${who(b)}` : '' })
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; sx = px = e.clientX; sy = py = e.clientY
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'
      const [x, y] = at(e); hover = hitTest(segs, x, y, tol()); kick()
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) { const [x, y] = at(e); if (e.pointerType === 'mouse') setHover(hitTest(segs, x, y, tol()), e); return }
      rot += (e.clientY - py) * 0.012
      pan = Math.max(-w * 0.2, Math.min(w * 0.2, pan + (e.clientX - px)))
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy)); px = e.clientX; py = e.clientY; kick()
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!dragging) return
      dragging = false; canvas.style.cursor = 'grab'
      const [x, y] = at(e), id = moved < 6 ? hitTest(segs, x, y, tol()) : null, b = id ? by.get(id) : null
      if (b) openDetail({ title: b.title, rows: [['앞선 커밋', `${b.ahead}개`], ['맡은 캐릭터', who(b)], ['상태', b.state === 'live' ? '작업 중' : '줄기에 합쳐짐']] })
      kick()
    })
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); rot += e.deltaY * 0.003; kick() }, { passive: false })

    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else kick() }
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(resize); ro.observe(box)
    const mo = new MutationObserver(kick); mo.observe(sgbRoot() ?? document.documentElement, { attributes: true, attributeFilter: ['class'] })
    resize()

    return () => {
      cancelAnimationFrame(raf); raf = 0; clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis); ro.disconnect(); mo.disconnect()
    }
  },
}
