// 2층 깃 그래프 — 가지를 시간 칸·줄(레인)에 얹는 계산(순수). 그리기는 layers/layer2-branches.ts.
import type { Branch, BoardEvent } from '../types.ts'

/** from·to = 시간 칸 번호. open = 아직 안 합침(끝이 열림, to 는 마지막 커밋 칸). */
export interface Span { id: string; from: number; to: number; open: boolean }

/** 겹치지 않는 가지는 같은 줄을 다시 쓴다. 줄 0 은 줄기라 1부터. 열린 가지는 그 줄을 끝까지 차지한다. */
export function assignLanes(spans: Span[]): Map<string, number> {
  const ends: number[] = [] // 줄마다 마지막 가지가 끝난 칸(열림이면 무한)
  const out = new Map<string, number>()
  for (const s of [...spans].sort((a, b) => a.from - b.from || a.to - b.to)) {
    let i = ends.findIndex((e) => e < s.from)
    if (i < 0) i = ends.push(0) - 1
    ends[i] = s.open ? Infinity : s.to
    out.set(s.id, i + 1)
  }
  return out
}

/** 가지·사건 → 시간 칸. 칸 = 관련 시각을 줄 세운 순번(1부터, 0 은 맨 앞 여백). 생김 시각이 없으면 그 가지의 첫 기록 한 칸 앞. */
export function graphSpans(branches: Branch[], events: BoardEvent[]): { spans: Span[]; cols: number } {
  const work = branches.filter((b) => !b.trunk)
  const evs = events.filter((e) => e.subject_type === 'branch')
  const timesOf = (b: Branch) => [...evs.filter((e) => e.subject_id === b.id).map((e) => e.ts), b.updated_at]
  const all = [...new Set(work.flatMap(timesOf))].sort()
  const col = (ts: string) => all.indexOf(ts) + 1
  const spans = work.map((b) => {
    const mine = evs.filter((e) => e.subject_id === b.id)
    const create = mine.find((e) => e.kind === 'branch.create')?.ts
    const to = col(mine.find((e) => e.kind === 'branch.merge')?.ts ?? b.updated_at)
    const from = create ? col(create) : col(timesOf(b).sort()[0]!) - 1
    // 합친 가지는 최소 한 칸 길이(갈라짐 ≠ 합침 자리)
    return { id: b.id, from: b.state === 'merged' ? Math.min(from, to - 1) : Math.min(from, to), to, open: b.state === 'live' }
  })
  return { spans, cols: all.length }
}
