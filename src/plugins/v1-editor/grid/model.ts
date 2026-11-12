/**
 * 읽기 격자 — 「문서 + 그날 변경 → 칸 표」 순수 함수(설계 ① 2절 · P10d).
 * 반 × 교시 표를 만든다. 학교 전체 쉼이면 표가 없다(ok:false). 반 전체 없음·교시 과목 변경·보결은 칸에 얹어 표시한다.
 * DB·fetch·Date.now 없음 — 날짜는 인자("YYYY-MM-DD"). 얹는 순서와 뜻은 shared/sub-engine/day-input.ts ④⑥ 과 같다.
 * 입력 doc 은 읽기만 한다(복사 없이 훑는다).
 */
import type { Doc } from '../legacy/types/doc'
import type { Slot, TimetableSpec, Track } from '../legacy/types/schema'
import { isHomeroomAgent } from '../legacy/types/schema'
import { lessonSlots, periodOfLabel, seoulDay, toMin, type ClockSlot } from '../../../../shared/clock'
import type { CalendarItem, ChangeItem } from '../../../../shared/sub-engine/day-input'

/** 보결 한 건(확정된 것만 넘긴다). startMin·endMin 과 겹치는 그 반 수업의 교사가 takerName 으로 바뀐다. */
export interface SubstituteItem { trackName: string; startMin: number; endMin: number; takerName: string; absentName?: string }

/** 그날 바뀐 것 — 전부 선택 */
export interface DayOverlay {
  calendar?: CalendarItem[]
  changes?: ChangeItem[]
  substitutes?: SubstituteItem[]
}

/** normal 평소 · homeroom 담임 수업(빈 칸) · changed 과목 변경 · sub 보결 · off 반 전체 없음 · none 그날 그 교시 없음 */
export type CellStatus = 'normal' | 'homeroom' | 'changed' | 'sub' | 'off' | 'none'

export interface GridCell {
  status: CellStatus
  startMin: number | null
  endMin: number | null
  subject: string | null
  teacher: string | null
  coTeacher: string | null
  room: string | null
  /** 바뀐 칸이면 원래 값 */
  was?: { subject?: string | null; teacher?: string | null }
}

export interface GridRow { trackId: string; trackName: string; grade: number | null; off: boolean; cells: GridCell[] }

export type GridTable =
  | { ok: true; date: string; dayIndex: number; periods: number[]; rows: GridRow[]; timetableName: string | null }
  | { ok: false; reason: 'school-off'; offReason: string }
  | { ok: false; reason: 'weekend' | 'no-timetable'; date: string }

const NONE: GridCell = { status: 'none', startMin: null, endMin: null, subject: null, teacher: null, coTeacher: null, room: null }

const toClock = (slots: Slot[]): ClockSlot[] =>
  slots.map((s) => ({ label: s.label, startMin: toMin(s.start), endMin: toMin(s.end), assignable: s.assignable, kind: s.kind === 'lesson' || s.kind === 'lunch' || s.kind === 'break' ? s.kind : undefined }))

/** 날짜에 적용되는 시간표 — 기간이 맞는 것 중 priority 큰 쪽(같으면 목록에서 먼저) */
export function activeTimetable(doc: Doc, date: string) {
  let best: Doc['timetables'][number] | null = null
  for (const t of doc.timetables) if (t.startDate <= date && date <= t.endDate && (!best || t.priority > best.priority)) best = t
  return best
}

export function buildGrid(doc: Doc, date: string, overlay: DayOverlay = {}): GridTable {
  const calendar = overlay.calendar ?? [], changes = overlay.changes ?? [], subs = overlay.substitutes ?? []
  const allOff = calendar.find((c) => c.targetKind === 'all')
  if (allOff) return { ok: false, reason: 'school-off', offReason: allOff.kind }

  const dayIndex = seoulDay(Date.parse(date + 'T00:00:00+09:00')).dayIndex
  if (dayIndex < 0 || dayIndex > 4) return { ok: false, reason: 'weekend', date }
  const tt = activeTimetable(doc, date)
  if (!tt) return { ok: false, reason: 'no-timetable', date }

  const specs = new Map<string, TimetableSpec>(doc.specs.map((s) => [s.id, s]))
  const agents = new Map(doc.agents.map((a) => [a.id, a.name]))
  const acts = new Map(doc.activities.map((a) => [a.id, a.name]))
  const rooms = new Map(doc.resources.map((r) => [r.id, r.name]))
  const byCell = new Map<string, Doc['assignments']>()
  for (const a of doc.assignments) {
    if (a.timetableId !== tt.id || a.dayIndex !== dayIndex) continue
    const k = a.trackId + ':' + a.slotIndex
    byCell.set(k, [...(byCell.get(k) ?? []), a])
  }
  const offByName = (t: Track) => changes.some((c) => c.trackName === t.name && c.period == null) ||
    calendar.some((c) => (c.targetKind === 'track' && c.targetValue === t.name) || (c.targetKind === 'grade' && t.grade != null && c.targetValue === String(t.grade)))

  const periodSet = new Set<number>()
  const withPeriods = doc.tracks.map((t) => {
    const spec = specs.get(t.specId ?? '') ?? specs.get(tt.specId)
    const clock = spec ? toClock(spec.slots) : []
    const n = spec?.lessonsPerDay?.[dayIndex]
    const lpd = n == null ? undefined : Object.assign([] as number[], { [dayIndex]: n })
    const lessons = !spec || spec.activeDays.includes(dayIndex) ? lessonSlots(clock, dayIndex, lpd) : []
    const items = lessons.map((l, i) => ({ l, slotIndex: spec!.slots[clock.indexOf(l)]!.index, period: periodOfLabel(l.label) ?? i + 1 }))
    for (const it of items) periodSet.add(it.period)
    return { t, items }
  })
  const periods = [...periodSet].sort((a, b) => a - b)

  const rows: GridRow[] = withPeriods.map(({ t, items }) => {
    const off = offByName(t)
    const cells = periods.map((p): GridCell => {
      const it = items.find((x) => x.period === p)
      if (!it) return NONE
      const base = { startMin: it.l.startMin, endMin: it.l.endMin }
      if (off) return { ...NONE, status: 'off', ...base }
      const a = byCell.get(t.id + ':' + it.slotIndex)?.[0]
      const homeroom = !a || isHomeroomAgent(a.agentId)
      let cell: GridCell = {
        status: homeroom ? 'homeroom' : 'normal', ...base,
        subject: (a?.activityId ? acts.get(a.activityId) : undefined) ?? a?.label ?? null,
        teacher: homeroom ? t.homeroomName ?? null : (a.agentId ? agents.get(a.agentId) ?? null : null),
        coTeacher: a?.coAgentId ? (isHomeroomAgent(a.coAgentId) ? t.homeroomName ?? null : agents.get(a.coAgentId) ?? null) : null,
        room: a?.resourceId ? rooms.get(a.resourceId) ?? null : null,
      }
      const ch = changes.find((c) => c.trackName === t.name && c.period === p)
      if (ch) cell = { ...cell, status: 'changed', subject: ch.activityName, was: { ...cell.was, subject: cell.subject } }
      const sb = subs.find((s) => s.trackName === t.name && s.startMin < it.l.endMin && it.l.startMin < s.endMin)
      if (sb) cell = { ...cell, status: 'sub', teacher: sb.takerName, was: { ...cell.was, teacher: cell.teacher } }
      return cell
    })
    return { trackId: t.id, trackName: t.name, grade: t.grade ?? null, off, cells }
  })

  return { ok: true, date, dayIndex, periods, rows, timetableName: tt.name }
}
