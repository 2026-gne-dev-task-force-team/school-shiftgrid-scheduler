/**
 * 1,820 정답지용 어댑터 — shiftgrid(확정본) 한 벌을 읽어 건마다 그날 입력(CandInput)과 질의를 만든다.
 * 정답지는 「부재·확정·교감」 그날 자료가 없는 순수 시간표 대조라 busy 는 주간 블록(weeklyBlocks)만 쓴다.
 * 사람 이름은 정답지 쪽 꼴을 따른다: 담임 = 반 이름("3-4"), 전담·비교과 = 에이전트 이름.
 */
import type { CandInput, CandLesson, CandTrack } from './candidates'
import type { CanonAdapter, CanonCase } from './canon'

interface Slot { index: number; start: string; end: string; kind: string }
interface Grid {
  agents: { id: string; name: string; role: string }[]
  specs: { id: string; slots: Slot[] }[]
  tracks: { name: string; specId: string; grade: number | null }[]
  assignments: { trackId?: string; dayIndex: number; slotIndex: number; agentId: string; label?: string }[]
  weeklyBlocks: { dayIndex: number; from: string; to: string; targets: { kind: string; id: string }[]; name?: string }[]
}

export const toMin = (hhmm: string | number): number => {
  if (typeof hhmm === 'number') return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** shiftgrid JSON → 대조 어댑터. 꼴이 안 맞으면 null(그 건은 skipped) */
export function makeGridAdapter(json: unknown): CanonAdapter {
  const g = json as Grid
  const agentName = new Map(g.agents.map((a) => [a.id, a.name]))
  const trackByName = new Map(g.tracks.map((t) => [t.name, t]))
  const idOfTrack = new Map(g.tracks.map((t) => [t.name, 't-' + t.name]))
  const kindOf = (role: string) => (role === '비교과' ? '비교과' : '전담')

  const build = (dayIndex: number): CandInput => {
    const tracks: CandTrack[] = g.tracks.map((t) => {
      const spec = g.specs.find((s) => s.id === t.specId)
      const slots = spec?.slots ?? []
      const lunch = slots.find((s) => s.kind === 'lunch')
      const lessons: CandLesson[] = []
      for (const a of g.assignments) {
        if (a.trackId !== idOfTrack.get(t.name) || a.dayIndex !== dayIndex) continue
        const s = slots.find((x) => x.index === a.slotIndex)
        if (!s) continue
        lessons.push({ startMin: toMin(s.start), endMin: toMin(s.end), subject: a.label ?? null, coIds: [], teacherIds: a.agentId === '__homeroom__' ? [] : [a.agentId] })
      }
      return { name: t.name, grade: t.grade, lessons, lunch: lunch ? { startMin: toMin(lunch.start), endMin: toMin(lunch.end) } : null }
    })
    const people: CandInput['people'] = [
      ...g.tracks.map((t) => ({ id: 'homeroom:' + t.name, name: t.name, kind: '담임' })),
      ...g.agents.map((a) => ({ id: a.id, name: a.name, kind: kindOf(a.role) })),
    ]
    const busy: CandInput['busy'] = []
    for (const b of g.weeklyBlocks ?? []) {
      if (b.dayIndex !== dayIndex) continue
      for (const t of b.targets) if (t.kind === 'agent') busy.push({ personId: t.id, startMin: toMin(b.from), endMin: toMin(b.to), reason: b.name })
    }
    return { tracks, people, busy, absent: [], taken: [] }
  }

  const cache = new Map<number, CandInput>()
  return (c: CanonCase) => {
    if (c.self != null && !trackByName.has(c.self)) return null
    let input = cache.get(c.dayIndex)
    if (!input) { input = build(c.dayIndex); cache.set(c.dayIndex, input) }
    const nameOf = (id: string) => (id.startsWith('homeroom:') ? id.slice('homeroom:'.length) : agentName.get(id) ?? id)
    return { input, query: { trackName: c.self ?? '', startMin: toMin(c.start), endMin: toMin(c.end), absentId: c.self == null ? null : 'homeroom:' + c.self }, nameOf }
  }
}
