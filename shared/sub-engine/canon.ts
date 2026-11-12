/**
 * 1,820 대조 틀 — 정답지 건마다 그날 입력을 만들어 새 엔진을 돌리고 A·B·C·X 이름 목록(정렬 일치)을 비교한다.
 * 사유 글자는 비교 안 한다(운영 앱 시험과 같다). 어긋남은 던지지 않고 센다 — 맞추기는 P13.
 */
import { substituteCandidates, type CandInput, type SubQuery, type SubResult } from './candidates'

export interface CanonCase { dayIndex: number; start: string | number; end: string | number; self: string; A: string[]; B: string[]; C: string[]; X: string[] }
export interface CanonDiff { index: number; group: 'A' | 'B' | 'C' | 'X'; missing: string[]; extra: string[] }
export interface CanonReport { total: number; mismatched: number; skipped: number; diffs: CanonDiff[] }

/** 건 → 그날 입력·질의. 입력을 못 만들면 null(그 건은 skipped) */
export type CanonAdapter = (c: CanonCase, index: number) => { input: CandInput; query: SubQuery; nameOf: (id: string) => string } | null

const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b, 'ko'))

export function compareGroup(expected: string[], actual: string[]): { missing: string[]; extra: string[] } {
  const e = sorted(expected), a = sorted(actual)
  const rest = [...a]
  const missing: string[] = []
  for (const x of e) { const i = rest.indexOf(x); if (i < 0) missing.push(x); else rest.splice(i, 1) }
  return { missing, extra: rest }
}

export function runCanon(cases: CanonCase[], adapter: CanonAdapter): CanonReport {
  const rep: CanonReport = { total: 0, mismatched: 0, skipped: 0, diffs: [] }
  cases.forEach((c, index) => {
    let built: ReturnType<CanonAdapter> = null
    try { built = adapter(c, index) } catch { built = null }
    if (!built) { rep.skipped++; return }
    rep.total++
    const r: SubResult = substituteCandidates(built.input, built.query)
    const names = (xs: { id: string }[]) => xs.map((x) => built!.nameOf(x.id))
    const got = { A: names(r.A), B: names(r.B), C: names(r.C), X: names(r.excluded) }
    let bad = false
    for (const g of ['A', 'B', 'C', 'X'] as const) {
      const d = compareGroup(c[g] ?? [], got[g])
      if (d.missing.length || d.extra.length) { bad = true; rep.diffs.push({ index, group: g, ...d }) }
    }
    if (bad) rep.mismatched++
  })
  return rep
}

/** 정답지 JSON({cases:[…]}) 읽기 — 꼴이 틀리면 빈 배열(던지지 않는다) */
export function parseCanon(json: unknown): CanonCase[] {
  const cs = (json as { cases?: unknown })?.cases
  return Array.isArray(cs) ? (cs as CanonCase[]).filter((c) => c && typeof c.dayIndex === 'number' && Array.isArray(c.A)) : []
}
