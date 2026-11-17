import type { Actor, Module, Task } from '../types.ts'
import type { BpEdge, BpModule } from '../data/blueprint-modules.ts'
import { attachActors } from './layer5-match.ts'

// 설계도 도식(R91) — 상자를 줄(tier)별로 손으로 놓고 곡선 화살표를 잇는 순수 계산. 그리는 쪽은 layer5-blueprint.ts.

export const BOX_W = 184, BOX_H = 92, GAP_X = 24, ROW_GAP = 104, PAD = 44
const PITCH = BOX_W + GAP_X

/** 칸 자리 — 줄 안 가로 칸 번호(소수 가능). 5칸 격자 기준. 길게 건너뛰는 화살표가 다른 상자를 덜 지나게 비운 칸을 둔다. */
const COL: Record<string, number> = {
  'v1-editor': 0, 'ops-sub': 1, 'ops-days': 2, 'ops-room': 3, 'ops-aux': 4,
  '코어 5': 0, 'ops-check': 1, 'account-server': 2,
  'server-link': 2.1,
  'supabase/': 0.3,
}
/** 바닥(shared/)처럼 한 줄을 통째로 쓰는 상자. */
const WIDE = new Set(['shared/'])

export interface Box { id: string; x: number; y: number; w: number; h: number }
export interface EdgePath { from: string; to: string; label: string; d: string; lx: number; ly: number; up: boolean }
export interface Graph { width: number; height: number; boxes: Map<string, Box>; edges: EdgePath[] }

const cubic = (a: number, b: number, c: number, d: number, t: number) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d }

/** 상자 놓기 + 화살표 길. 위(0줄) = 판, 아래 = 바닥. 화살표는 쓰는 쪽 → 내주는 쪽. */
export function layoutGraph(mods: BpModule[], edges: BpEdge[]): Graph {
  const cols = Math.max(5, ...mods.map((m) => (COL[m.id] ?? 0) + 1))
  const width = PAD * 2 + cols * PITCH - GAP_X
  const tiers = [...new Set(mods.map((m) => m.tier))].sort((a, b) => a - b)
  const rowY = (tier: number) => PAD + tiers.indexOf(tier as never) * (BOX_H + ROW_GAP)
  const boxes = new Map<string, Box>()
  mods.forEach((m) => {
    const y = rowY(m.tier)
    if (WIDE.has(m.id)) boxes.set(m.id, { id: m.id, x: PAD, y, w: width - PAD * 2, h: BOX_H })
    else {
      // 칸 자리가 없는 새 모듈은 그 줄의 남는 칸 끝에 붙인다.
      const col = COL[m.id] ?? mods.filter((o) => o.tier === m.tier).indexOf(m)
      boxes.set(m.id, { id: m.id, x: PAD + col * PITCH, y, w: BOX_W, h: BOX_H })
    }
  })
  const cx = (b: Box) => b.x + b.w / 2

  // 상자 한 변에 닿는 화살표가 여럿이면 그 변을 고르게 나눈다(상대 쪽 x 순서대로).
  const ports = new Map<string, number>()
  const spread = (key: string, list: { k: string; other: number }[], b: Box) => {
    const sorted = [...list].sort((p, q) => p.other - q.other)
    const span = Math.min(b.w * 0.7, 36 * sorted.length)
    sorted.forEach((p, i) => ports.set(`${key}|${p.k}`, sorted.length === 1 ? cx(b) : cx(b) - span / 2 + (span * i) / (sorted.length - 1)))
  }
  const ek = (e: BpEdge) => `${e.from}>${e.to}`
  for (const b of boxes.values()) {
    const outs = edges.filter((e) => e.from === b.id && boxes.has(e.to))
    const ins = edges.filter((e) => e.to === b.id && boxes.has(e.from))
    const other = (e: BpEdge, end: string) => ({ k: ek(e), other: cx(boxes.get(end)!) })
    const below = (id: string) => boxes.get(id)!.y > b.y
    const wideIn = WIDE.has(b.id) ? [] : ins // 넓은 상자는 들어오는 쪽 x 그대로 닿으니 나누지 않는다
    spread(`${b.id}:bottom`, [...outs.filter((e) => below(e.to)).map((e) => other(e, e.to)), ...wideIn.filter((e) => below(e.from)).map((e) => other(e, e.from))], b)
    spread(`${b.id}:top`, [...outs.filter((e) => !below(e.to)).map((e) => other(e, e.to)), ...wideIn.filter((e) => !below(e.from)).map((e) => other(e, e.from))], b)
  }

  const outIndex = new Map<string, number>()
  const paths: EdgePath[] = []
  for (const e of edges) {
    const s = boxes.get(e.from), t = boxes.get(e.to)
    if (!s || !t) continue
    const up = t.y < s.y
    const x1 = ports.get(`${s.id}:${up ? 'top' : 'bottom'}|${ek(e)}`) ?? cx(s)
    const y1 = up ? s.y : s.y + s.h
    // 넓은 바닥 상자는 위에서 곧장 내려 닿는다(쓰는 쪽 x 그대로).
    const x2 = WIDE.has(t.id) ? Math.min(Math.max(x1, t.x + 12), t.x + t.w - 12) : (ports.get(`${t.id}:${up ? 'bottom' : 'top'}|${ek(e)}`) ?? cx(t))
    const y2 = up ? t.y + t.h : t.y
    const ym = (y1 + y2) / 2
    const d = `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`
    // 이름표는 쓰는 쪽 바로 곁 — 같은 상자에서 나가는 n번째는 한 칸씩 더 내려(올려) 겹치지 않게.
    const i = outIndex.get(`${s.id}:${up}`) ?? 0
    outIndex.set(`${s.id}:${up}`, i + 1)
    const target = y1 + (up ? -1 : 1) * Math.min(30 + i * 22, Math.abs(y2 - y1) - 12)
    let lo = 0, hi = 1
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; const y = cubic(y1, ym, ym, y2, mid); if ((up ? y > target : y < target)) lo = mid; else hi = mid }
    paths.push({ from: e.from, to: e.to, label: e.label, d, lx: cubic(x1, x1, x2, x2, lo), ly: target, up })
  }
  const height = PAD * 2 + tiers.length * (BOX_H + ROW_GAP) - ROW_GAP
  return { width, height, boxes, edges: paths }
}

/** 이름표 너비 어림(jsdom 엔 글자 재기가 없다) — 한글 11px · 나머지 6.6px. */
export const labelWidth = (s: string) => [...s].reduce((w, c) => w + (/[ㄱ-힝]/.test(c) ? 11 : 6.6), 0) + 12

const CODE = /\b[PDF]\d+[a-z]?\b/g
const codesIn = (s: string | null | undefined) => (s ?? '').match(CODE) ?? []
const firstWord = (s: string) => s.trim().split(/\s+/)[0].replace(/\/$/, '')

/** 판 번호(P13a)가 모듈의 판 목록(P13)에 드나 — P1 이 P10a 를 먹지 않게 다음 글자가 숫자면 아니다. */
export const codeHits = (code: string, task: string) => code === task || (code.startsWith(task) && /^[a-z]$/.test(code.slice(task.length)))

/** 현황판 자료 칸(data.modules) → 설계 ① 모듈 id. 1) 이름·메모의 판 번호 2) 집 이름 첫 낱말(shared · server-link) 3) 부모 집을 따라. */
export function linkModules(dataMods: Module[], bp: BpModule[]): Map<string, string> {
  const out = new Map<string, string>()
  const byCode = (m: Module) => { for (const c of codesIn(`${m.name} ${m.note ?? ''}`)) { const hit = bp.find((b) => b.tasks.some((t) => codeHits(c, t))); if (hit) return hit.id } return null }
  const byName = (m: Module) => bp.find((b) => firstWord(b.id) === firstWord(m.name) || firstWord(b.id) === m.id.replace(/^h-/, ''))?.id ?? null
  for (const m of dataMods) if (!m.parent) { const id = byName(m) ?? byCode(m); if (id) out.set(m.id, id) }
  for (const m of dataMods) if (m.parent) { const id = byCode(m) ?? out.get(m.parent) ?? null; if (id) out.set(m.id, id) }
  return out
}

/** 모듈 상태 — 맞춘 판(방)이 있으면 그것으로(전부 완성 = 완성 · 하나라도 손댐 = 짓는 중), 없으면 집 상태, 그것도 없으면 계획. */
export function stateOf(bpId: string, dataMods: Module[], link: Map<string, string>): Module['state'] {
  const mine = dataMods.filter((m) => link.get(m.id) === bpId)
  const rooms = mine.filter((m) => m.parent)
  if (rooms.length) return rooms.every((r) => r.state === 'built') ? 'built' : rooms.some((r) => r.state !== 'plan') ? 'build' : 'plan'
  return mine[0]?.state ?? 'plan'
}

/** 일함·막힘 캐릭터를 설계 ① 모듈에 붙인다. 자료 칸으로 못 맞추면 일감 제목의 판 번호로 한 번 더, 그래도 없으면 lost. */
export function crewByModule(actors: Actor[], dataMods: Module[], tasks: Pick<Task, 'id' | 'title'>[], bp: BpModule[], link: Map<string, string>) {
  const { byRoom, lost: lost0 } = attachActors(actors, dataMods, tasks)
  const by = new Map<string, Actor[]>(), lost: Actor[] = []
  const put = (id: string, a: Actor) => by.set(id, [...(by.get(id) ?? []), a])
  const byTitle = (a: Actor) => {
    const t = tasks.find((x) => x.id === a.task_id)
    for (const c of codesIn(`${a.task_id ?? ''} ${t?.title ?? ''}`)) { const hit = bp.find((b) => b.tasks.some((k) => codeHits(c, k))); if (hit) return hit.id }
    return null
  }
  for (const [room, list] of byRoom) for (const a of list) { const id = link.get(room) ?? byTitle(a); if (id) put(id, a); else lost.push(a) }
  for (const a of lost0) { const id = byTitle(a); if (id) put(id, a); else lost.push(a) }
  return { by, lost }
}
