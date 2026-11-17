/**
 * 1,820 정답지용 어댑터 — shiftgrid(확정본) 한 벌을 읽어 건마다 그날 입력(CandInput)과 질의를 만든다.
 * 정답지는 「부재·확정·교감」 그날 자료가 없는 순수 시간표 대조라 busy 는 주간 블록(weeklyBlocks)만 쓴다.
 * 사람 이름은 정답지 쪽 꼴을 따른다: 담임 = 반 이름("3-4"), 전담·비교과 = 에이전트 이름.
 */
import type { CandInput, CandLesson, CandTrack } from './candidates.ts'
import type { CanonAdapter, CanonCase } from './canon.ts'

interface Slot { index: number; label?: string; start: string; end: string; kind?: string; assignable?: boolean }
interface Grid {
  agents: { id: string; name: string; role: string }[]
  specs: { id: string; lessonsPerDay?: Record<string, number>; slots: Slot[] }[]
  tracks: { name: string; specId: string; grade: number | null }[]
  assignments: { trackId?: string; dayIndex: number; slotIndex: number; agentId: string; coAgentId?: string; label?: string }[]
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
      const lunch = slots.find((s) => s.kind === 'lunch') ?? slots.find((s) => (s.label ?? '').includes('점심'))
      // 그날 수업 칸 = 수업 슬롯(lessonsPerDay 반영) + 배치가 있는 슬롯. 배치가 없는 수업 칸은 담임 수업(빈 칸 = 담임)
      const lessonSlots = slots.filter((s) => s.assignable !== false && (s.kind ?? 'lesson') === 'lesson')
      const perDay = spec?.lessonsPerDay?.[String(dayIndex)]
      const idx = new Set((perDay == null ? lessonSlots : lessonSlots.slice(0, perDay)).map((s) => s.index))
      const cell = new Map<number, string[]>()
      const coCell = new Map<number, string[]>() // 보조·협력 인력(coAgentId) — 담임 칸이면 coIds, 전담 칸이면 그 전담과 함께 수업 중
      for (const a of g.assignments) {
        if (a.trackId !== idOfTrack.get(t.name) || a.dayIndex !== dayIndex) continue
        if (!slots.some((x) => x.index === a.slotIndex)) continue
        idx.add(a.slotIndex)
        const ids = cell.get(a.slotIndex) ?? []
        if (a.agentId !== '__homeroom__') ids.push(a.agentId)
        cell.set(a.slotIndex, ids)
        if (a.coAgentId && a.coAgentId !== '__homeroom__') coCell.set(a.slotIndex, [...(coCell.get(a.slotIndex) ?? []), a.coAgentId])
      }
      const lessons: CandLesson[] = [...idx].map((i) => slots.find((x) => x.index === i)!).sort((x, y) => toMin(x.start) - toMin(y.start))
        .map((s) => ({ startMin: toMin(s.start), endMin: toMin(s.end), subject: null, coIds: coCell.get(s.index) ?? [], teacherIds: cell.get(s.index) ?? [] }))
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

/** 편성 앱 확정본 모양 만들기 — 담임 배치(`__homeroom__`)를 모두 빼고 수업 슬롯 이름을 「N」·빈 글자로 바꾼다(운영 앱 시험과 같다). 원본은 안 고친다. */
export function bareGrid(json: unknown): unknown {
  const g = json as Grid
  return {
    ...g,
    assignments: g.assignments.filter((a) => a.agentId !== '__homeroom__'),
    specs: g.specs.map((s) => ({ ...s, slots: s.slots.map((sl, i) => ({ ...sl, label: sl.kind === 'lunch' ? '점심' : i % 2 ? String(parseInt(sl.label ?? '')) : '' })) })),
  }
}

/** 정규화 — 수업 슬롯 이름을 「N교시」로(「3」→「3교시」 · 빈 이름 → 순서대로), kind 가 없으면 점심/수업으로 추정. 운영 앱 normalizeShiftgridDoc 과 같은 뜻. */
export function normalizeGrid(json: unknown): unknown {
  const g = json as Grid
  return {
    ...g,
    specs: g.specs.map((sp) => {
      let n = 0
      const slots = [...sp.slots].sort((a, b) => a.index - b.index).map((s) => {
        const label = (s.label ?? '').trim()
        const kind = s.kind ?? (label.includes('점심') ? 'lunch' : s.assignable ? 'lesson' : 'other')
        if (!s.assignable || kind !== 'lesson') return { ...s, label, kind }
        n++
        const m = /^\s*(\d+)\s*(교시)?\s*$/.exec(label)
        return { ...s, kind, label: m ? m[1] + '교시' : label === '' ? n + '교시' : label }
      })
      return { ...sp, slots }
    }),
  }
}
