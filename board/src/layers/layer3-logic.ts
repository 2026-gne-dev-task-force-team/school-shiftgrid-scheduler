import type { Task } from '../types.ts'
import { showReason } from './layer4-logic.ts'

export type ChipState = 'blocked' | 'work' | 'wait'
export interface LaneChip { id: string; title: string; kind: string; state: ChipState }

const ORDER: Record<ChipState, number> = { blocked: 0, work: 1, wait: 2 }

/** 일감 하나의 칩 상태 — 막힘(이유 있는 대기) · 하는 중 · 대기. 끝난 일감은 칩이 없다. */
export const chipState = (t: Task): ChipState => (showReason(t) ? 'blocked' : t.column === 'work' ? 'work' : 'wait')

/** 레인의 칩 목록 — 끝난 것 빼고, 막힘 → 하는 중 → 대기 순, 같으면 번호순. */
export function laneChips(tasks: Task[], laneId: string): LaneChip[] {
  return tasks
    .filter((t) => t.lane_id === laneId && t.column !== 'done')
    .map((t) => ({ id: t.id, title: t.title, kind: t.kind, state: chipState(t) }))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id))
}

/** 바뀐 칩 번호들 — 이전 상태표에 없던 것(새로 생김) 또는 상태가 달라진 것. prev 가 undefined 면(첫 그림) 없음. */
export function changedChips(prev: Map<string, ChipState> | undefined, chips: LaneChip[]): Set<string> {
  const out = new Set<string>()
  if (prev) for (const c of chips) if (prev.get(c.id) !== c.state) out.add(c.id)
  return out
}
