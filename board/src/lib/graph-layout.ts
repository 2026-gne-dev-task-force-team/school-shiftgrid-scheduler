// 커밋 그래프 자리 배치(순수) — `git log --graph` 처럼 위가 최신인 세로 줄(행)과 가지 레일(레인)에 커밋을 앉힌다.
// 그리기는 layers/layer2-branches.ts. 입력은 새것→옛것 순서(부모는 항상 자식보다 아래 행).
import type { Branch, GraphCommit } from '../types.ts'

export interface GNode { sha: string; row: number; lane: number }
/** bend: 레일이 바뀌는 곡선이 어느 끝에서 꺾이나(child = 자식 쪽 · parent = 부모 쪽 · none = 같은 레일). open = 부모가 목록 밖(더 옛 기록으로 이어짐). */
export interface GEdge {
  from: string; to: string; fromRow: number; fromLane: number; toRow: number; toLane: number
  bend: 'child' | 'parent' | 'none'; colorLane: number; open: boolean
}
export interface GLayout { nodes: GNode[]; edges: GEdge[]; lanes: number }

/**
 * 레일 배정. 열린 칸(slot)마다 「다음에 올 커밋의 해시」를 기다린다.
 * - 커밋은 자기를 기다리는 가장 왼쪽 레일에 앉고, 나머지 기다리던 레일은 거기서 합쳐진다.
 * - 첫 부모는 같은 레일을 이어 받고, 다른 부모(머지)는 이미 기다리는 레일이 있으면 거기로, 없으면 새 레일을 연다.
 * - trunk 가 주어지면 그 해시를 0번 레일이 먼저 기다린다(줄기가 늘 맨 왼쪽).
 */
export function layoutGraph(commits: Pick<GraphCommit, 'sha' | 'parents'>[], trunk?: string): GLayout {
  const slots: (string | null)[] = trunk ? [trunk] : []
  const nodes: GNode[] = [], pos = new Map<string, GNode>()
  const free = () => { const i = slots.indexOf(null); return i >= 0 ? i : slots.push(null) - 1 }
  commits.forEach((c, row) => {
    let lane = slots.indexOf(c.sha)
    if (lane < 0) { lane = free() }
    slots.forEach((s, i) => { if (s === c.sha && i !== lane) slots[i] = null })
    slots[lane] = null
    const [first, ...rest] = c.parents
    if (first !== undefined) slots[lane] = first
    for (const p of rest) if (!slots.includes(p)) slots[free()] = p
    const n = { sha: c.sha, row, lane }
    nodes.push(n); pos.set(c.sha, n)
  })
  // 선: 부모를 기다리던 칸 위치를 추적하지 않고, 자식 레일→부모 레일로 잇는다(합치는 곳 아래 레일은 비어 있다)
  const edges: GEdge[] = []
  const rows = commits.length
  for (const c of commits) {
    const a = pos.get(c.sha)!
    c.parents.forEach((p, i) => {
      const b = pos.get(p)
      if (!b) { edges.push({ from: c.sha, to: p, fromRow: a.row, fromLane: a.lane, toRow: rows, toLane: a.lane, bend: 'none', colorLane: a.lane, open: true }); return }
      const same = a.lane === b.lane
      // 첫 부모가 다른 레일이면 가지가 줄기로 들어오는 갈림 — 부모 쪽에서 꺾는다. 두 번째 이후 부모는 머지 — 자식 쪽에서 꺾는다.
      edges.push({ from: c.sha, to: p, fromRow: a.row, fromLane: a.lane, toRow: b.row, toLane: b.lane,
        bend: same ? 'none' : i === 0 ? 'parent' : 'child', colorLane: i === 0 ? a.lane : b.lane, open: false })
    })
  }
  return { nodes, edges, lanes: Math.max(0, ...nodes.map((n) => n.lane)) + 1 }
}

/** 레일 색(색상각) — 0번(줄기)은 따로 neon 으로 그리니 1번부터 황금각으로 돌린다. */
export const laneHue = (lane: number): number => (10 + 137.5 * lane) % 360

/** 커밋 기록이 안 실린 판(서버 칸 미적용·구판)용 — 가지 정보만으로 얼개를 만든다: 열린 가지마다 앞선 수만큼 커밋이 줄기 끝에서 갈라져 나온다. */
export function synthGraph(branches: Branch[]): GraphCommit[] {
  const trunk = branches.find((b) => b.trunk)
  const live = branches.filter((b) => !b.trunk && b.state === 'live').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const out: GraphCommit[] = []
  for (const b of live) {
    const n = Math.max(1, b.ahead)
    for (let i = n; i >= 1; i--) {
      out.push({ sha: `${b.id}~${i}`, parents: [i === 1 ? 'trunk~0' : `${b.id}~${i - 1}`], subject: i === n ? b.title : '', at: b.updated_at,
        refs: i === n ? [{ name: b.title, branch_id: b.id }] : [] })
    }
  }
  out.push({ sha: 'trunk~0', parents: [], subject: trunk?.title ?? '줄기', at: trunk?.updated_at ?? '', refs: [{ name: trunk?.title ?? '줄기', branch_id: trunk?.id ?? null }] })
  return out
}
