// 2층 가지 — 3D 원통(R94). 줄기가 원통 한가운데 축이고, 가지마다 원통 한 면(360°÷가지 수 같은 간격)을 차지한다.
// 면 하나 = 그 가지의 세로 커밋 레일(위가 최신) + 커밋 줄(점 · 메시지 · 번호 · 누가 · 시각). 휠·좌우 화살표·밀기로 돌리고,
// 가지 칩을 누르면 그 가지가 정면으로 온다. 앞 면은 크고 밝게, 뒤 면은 작고 어둡게(원근은 아래 순수 함수가 계산 — 라이브러리 없음).
import { h, isCalm } from '../dom.ts'
import type { Branch, GraphCommit } from '../types.ts'
import type { LayerCtx } from './types.ts'
import { actorTag } from '../ui/actor-tag.ts'
import { actorName, taskNo } from '../lib/actor.ts'
import { laneHue } from '../lib/graph-layout.ts'

export interface Face { id: string; name: string; branch?: Branch; hue: number; commits: GraphCommit[]; fork?: string }

/**
 * 커밋을 가지 면으로 나눈다(순수). 가지 끝 커밋에서 첫 부모를 따라 내려가며 줄기(줄기 끝의 첫 부모 사슬)나 이미 다른 가지가 가진 커밋을 만나면 멈춘다 — 거기가 갈라진 자리(fork).
 * 어느 가지에도 안 든 커밋(줄기·이름표 없는 합쳐진 가지)은 trunk 로. 면은 가지 끝이 최신인 순(끝이 없으면 updated_at)으로 줄 세운다. 각 목록은 위가 최신.
 */
export function branchFaces(commits: GraphCommit[], branches: Branch[]): { faces: Face[]; trunk: GraphCommit[] } {
  const by = new Map(commits.map((c) => [c.sha, c]))
  const idx = new Map(commits.map((c, i) => [c.sha, i]))
  const tipOf = (id: string) => commits.find((c) => c.refs.some((r) => r.branch_id === id))
  const trunkB = branches.find((b) => b.trunk)
  const onTrunk = new Set<string>()
  for (let c = trunkB ? tipOf(trunkB.id) : undefined; c && !onTrunk.has(c.sha); c = by.get(c.parents[0] ?? '')) onTrunk.add(c.sha)
  const time = (b: Branch) => tipOf(b.id)?.at || b.updated_at
  const work = branches.filter((b) => !b.trunk).sort((a, b) => time(b).localeCompare(time(a)) || a.id.localeCompare(b.id))
  const claimed = new Set<string>()
  const faces: Face[] = work.map((b, i) => {
    const tip = tipOf(b.id), mine: GraphCommit[] = []
    let c = tip
    while (c && !onTrunk.has(c.sha) && !claimed.has(c.sha)) { mine.push(c); claimed.add(c.sha); c = by.get(c.parents[0] ?? '') }
    const fork = c?.sha ?? (mine.length ? mine[mine.length - 1]!.parents[0] : undefined)
    return { id: b.id, name: tip?.refs.find((r) => r.branch_id === b.id)?.name ?? b.title, branch: b, hue: laneHue(i + 1), commits: newestFirst(mine, idx), fork }
  })
  return { faces, trunk: newestFirst(commits.filter((c) => !claimed.has(c.sha)), idx) }
}

/** 위가 최신 — 시각이 있으면 시각 내림차순, 같거나 없으면 원래 목록 순서(새것→옛것). */
const newestFirst = (cs: GraphCommit[], idx: Map<string, number>): GraphCommit[] =>
  [...cs].sort((a, b) => (a.at && b.at ? b.at.localeCompare(a.at) : 0) || idx.get(a.sha)! - idx.get(b.sha)!)

/** 면 사이 각도 — 늘 균등(가지가 늘거나 줄면 다시 나눈다). */
export const faceStep = (n: number): number => (n > 0 ? 360 / n : 360)

/** 각도를 (-180, 180] 로 접는다. */
export const wrapDeg = (d: number): number => { const r = ((d % 360) + 360) % 360; return r > 180 ? r - 360 : r }

export interface Pose { deg: number; x: number; depth: number; scale: number; light: number; z: number; front: boolean }

/**
 * 원통 위 면 i 의 자세(순수). rot = 지금 정면에 둔 각도. deg = 정면에서 얼마나 돌아갔나.
 * x = 옆으로 밀린 정도(-1~1, 반지름 배수) · depth = 앞 1 ~ 뒤 0 · scale·light = 앞일수록 크고 밝게 · z = 쌓는 순서.
 */
export function cylinderPose(i: number, n: number, rot: number): Pose {
  const step = faceStep(n), deg = wrapDeg(i * step - rot), rad = (deg * Math.PI) / 180
  const depth = (1 + Math.cos(rad)) / 2
  return { deg, x: Math.sin(rad), depth, scale: 0.55 + 0.45 * depth, light: 0.3 + 0.7 * depth, z: Math.round(depth * 1000), front: Math.abs(deg) < step / 2 || n === 1 }
}

/** 지금 정면에 있는 면 번호. */
export const frontIndex = (rot: number, n: number): number => (n > 0 ? ((Math.round(rot / faceStep(n)) % n) + n) % n : 0)

/** 면 i 를 정면으로 — 지금 각도에서 가장 짧게 도는 쪽 값(빙빙 돌지 않게). */
export const rotTo = (rot: number, i: number, n: number): number => rot + wrapDeg(i * faceStep(n) - rot)

const when = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 커밋 줄 하나 — 그래프 칸(레일·점) · 메시지(늘 보임, 줄임표) · 번호 · 누가 · 시각. 올리면 전문 툴팁, 누르면 상세. */
function commitRow(ctx: LayerCtx, c: GraphCommit, face: Face | undefined, opt: { first: boolean; last: boolean; trunk?: boolean }): HTMLElement {
  const { data } = ctx
  const b = face?.branch
  const a = b ? data.actors.find((x) => x.id === b.actor_id) : undefined
  const no = taskNo(b?.task_id) || ''
  const merge = c.parents.length > 1
  const graph = h('span', { class: `gc-g${opt.first ? ' gc-g-first' : ''}${opt.last ? ' gc-g-last' : ''}`, 'aria-hidden': 'true' },
    h('i', { class: `gc-dot${merge ? ' gc-merge' : ''}` }))
  const row = h('button', { class: `gc-row${opt.trunk ? ' gc-row-trunk' : ''}`, 'data-sha': c.sha, 'aria-label': `커밋 ${c.sha} ${c.subject}` },
    graph,
    h('span', { class: 'gc-sub' }, c.subject || `커밋 ${c.sha.slice(0, 7)}`),
    h('span', { class: 'gc-no' }, no || c.sha.slice(0, 7)),
    h('span', { class: 'gc-who' }, a ? actorName(a, data.actors) : opt.trunk ? '줄기' : '—'),
    h('time', { class: 'gc-at', datetime: c.at }, when(c.at)))
  const branchName = face?.name ?? (c.refs.map((r) => r.name).join(', ') || '줄기')
  ctx.tip(row, () => `${c.subject || '(메시지 없음)'}\n${c.sha} · 가지 ${branchName}${no ? ` · ${no}` : ''}`)
  row.addEventListener('click', () => ctx.openDetail({
    title: c.subject || `커밋 ${c.sha}`,
    rows: [['해시', c.sha], ['시각', c.at ? new Date(c.at).toLocaleString('ko-KR') : '—'], ['가지', branchName], ['태스크', no || '—'],
      ['누가', a ? actorName(a, data.actors) : '—'], ['부모', c.parents.join(', ') || '없음 (맨 처음)'], ...filesRows(c)],
    extra: filesList(c),
  }))
  return row
}

/** 상세 「바뀐 파일」 — files 가 있으면 개수 줄 + 경로 목록(extra), 없으면 자료에 아직 없음. */
export function filesRows(c: GraphCommit): [string, string][] {
  if (!c.files?.length) return [['바뀐 파일', '자료에 아직 없음']]
  return [['바뀐 파일', `${c.files.length + (c.filesMore ?? 0)}개`]]
}
/** 목록 줄들 — 경로마다 한 줄, 넘친 개수가 있으면 마지막에 「… 외 N개」. */
export const filesLines = (c: GraphCommit): string[] => c.files?.length ? [...c.files, ...(c.filesMore ? [`… 외 ${c.filesMore}개`] : [])] : []
export function filesList(c: GraphCommit): HTMLElement | undefined {
  const lines = filesLines(c)
  return lines.length ? h('ul', { class: 'gc-files' }, ...lines.map((f) => h('li', null, f))) : undefined
}

/** 원통 그리기. 돌릴 때는 면 DOM 을 다시 만들지 않고 transform 만 바꾼다. */
export function renderCylinder(host: HTMLElement, ctx: LayerCtx, commits: GraphCommit[]): () => void {
  const { data } = ctx
  const { faces, trunk } = branchFaces(commits, data.branches)
  const n = faces.length
  const trunkB = data.branches.find((b) => b.trunk)
  let rot = 0

  const status = h('p', { class: 'gc-status', 'aria-live': 'polite' })
  const chips = h('div', { class: 'gc-chips', role: 'tablist', 'aria-label': '가지 고르기 — 누르면 그 가지가 정면으로' })
  const drum = h('div', { class: 'gc-drum' })
  const axis = h('div', { class: 'gc-axis', 'aria-hidden': 'true' }, h('span', { class: 'gc-axis-l' }, trunkB?.title ?? '줄기'))
  drum.append(axis)
  const view = h('div', { class: 'gc-view', tabindex: '0', role: 'region', 'aria-roledescription': '원통', 'aria-label': '가지 원통 — 좌우 화살표·휠·밀기로 돌립니다' }, drum)
  const faceEls: HTMLElement[] = []
  const chipEls: HTMLElement[] = []

  faces.forEach((f, i) => {
    const b = f.branch
    const a = b && b.state === 'live' ? data.actors.find((x) => x.id === b.actor_id) : undefined
    const head = h('div', { class: 'gc-head' },
      h('span', { class: 'gg-l gc-name' }, f.name),
      h('small', { class: 'gc-meta' }, `${b?.state === 'merged' ? '줄기에 합쳐짐' : `앞선 ${b?.ahead ?? f.commits.length}개`}${b && b.title !== f.name ? ` · ${b.title}` : ''}`))
    head.querySelector<HTMLElement>('.gc-name')!.style.setProperty('--hue', String(f.hue))
    const rows = h('div', { class: 'gc-rows' })
    // 캐릭터는 자기 가지 면의 맨 앞(최신) 커밋 줄에 선다 — 면마다 하나라 가지끼리 각도로 떨어져 안 겹친다.
    if (a) rows.append(h('div', { class: 'gc-actor' }, actorTag(ctx, a, { size: 'mini' })))
    f.commits.forEach((c, k) => rows.append(commitRow(ctx, c, f, { first: k === 0, last: k === f.commits.length - 1 })))
    if (!f.commits.length) rows.append(h('p', { class: 'gc-empty' }, '커밋 기록이 실리지 않은 가지'))
    if (f.fork) rows.append(h('div', { class: 'gc-fork' }, h('span', { class: 'gc-g gc-g-fork', 'aria-hidden': 'true' }), `줄기 ${f.fork.slice(0, 7)} 에서 갈라짐`))
    const el = h('section', { class: 'gc-face', 'data-id': f.id, 'aria-label': `가지 ${f.name}` }, head, rows)
    el.style.setProperty('--hue', String(f.hue))
    // 정면이 아닌 면을 누르면 내용 대신 그 면을 정면으로 돌린다
    el.addEventListener('click', (e) => { if (el.dataset.front !== '1') { e.stopPropagation(); e.preventDefault(); go(rotTo(rot, i, n)) } }, true)
    drum.append(el); faceEls.push(el)

    const chip = h('button', { class: 'gg-l gc-chip', role: 'tab', 'data-id': f.id }, f.name)
    chip.style.setProperty('--hue', String(f.hue))
    chip.addEventListener('click', () => go(rotTo(rot, i, n)))
    chips.append(chip); chipEls.push(chip)
  })

  const trunkList = h('div', { class: 'gc-trunk' }, h('h3', { class: 'gc-trunk-h' }, `${trunkB?.title ?? '줄기'} — 원통 축의 커밋`))
  trunk.forEach((c, k) => trunkList.append(commitRow(ctx, c, undefined, { first: k === 0, last: k === trunk.length - 1, trunk: true })))

  const wrap = h('div', { class: `gc${isCalm() ? ' gc-calm' : ''}` }, chips, status, view, trunkList)
  host.append(wrap)

  const apply = () => {
    const R = Math.max(120, Math.min(view.clientWidth * 0.36, 520))
    faces.forEach((_f, i) => {
      const p = cylinderPose(i, n, rot), el = faceEls[i]!
      el.style.transform = `translateX(-50%) translateX(${(p.x * R).toFixed(1)}px) scale(${p.scale.toFixed(3)}) rotateY(${(p.deg * 0.4).toFixed(1)}deg)`
      el.style.zIndex = String(p.z)
      el.style.filter = `brightness(${p.light.toFixed(2)})`
      el.style.opacity = p.depth < 0.15 ? '0' : String(Math.min(1, 0.25 + p.depth).toFixed(2))
      el.style.visibility = p.depth < 0.15 ? 'hidden' : 'visible'
      el.dataset.front = p.front ? '1' : '0'
      el.setAttribute('aria-hidden', p.front ? 'false' : 'true')
      chipEls[i]!.setAttribute('aria-selected', p.front ? 'true' : 'false')
    })
    const fi = frontIndex(rot, n), f = faces[fi]
    status.textContent = f ? `정면: ${f.name} (${fi + 1}/${n}) · 면 사이 ${faceStep(n).toFixed(1)}°` : '열린 가지가 없다'
  }
  const go = (r: number) => { rot = r; apply(); chipEls[frontIndex(rot, n)]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }
  const stepBy = (k: number) => go(Math.round(rot / faceStep(n)) * faceStep(n) + k * faceStep(n))

  // 휠: 한 눈금(≈60px)마다 한 면
  let acc = 0
  const onWheel = (e: WheelEvent) => {
    if (n < 2) return
    e.preventDefault()
    acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(acc) >= 60) { stepBy(Math.sign(acc)); acc = 0 }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stepBy(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBy(-1) } else if (e.key === 'Home') { e.preventDefault(); go(0) }
  }
  // 밀기: 5px 넘게 움직여야 돌리기로 본다(누르기와 가름). 놓으면 가까운 면에 붙는다.
  let drag: { x: number; rot: number; on: boolean } | null = null
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, rot, on: false } }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!drag.on && Math.abs(dx) > 5) { drag.on = true; view.setPointerCapture?.(e.pointerId); wrap.classList.add('gc-dragging') }
    if (drag.on) { rot = drag.rot - dx * 0.3; apply() }
  }
  const onUp = () => {
    if (drag?.on) { wrap.classList.remove('gc-dragging'); go(Math.round(rot / faceStep(n)) * faceStep(n)) }
    drag = null
  }
  view.addEventListener('wheel', onWheel, { passive: false })
  view.addEventListener('keydown', onKey)
  view.addEventListener('pointerdown', onDown)
  view.addEventListener('pointermove', onMove)
  view.addEventListener('pointerup', onUp)
  view.addEventListener('pointercancel', onUp)
  const ro = new ResizeObserver(apply); ro.observe(view)
  apply()
  return () => ro.disconnect()
}
