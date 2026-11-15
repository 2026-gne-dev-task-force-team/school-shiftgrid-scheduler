// 번들 → 시간 틀(FrameInput). 번들에 시간표(doc)가 없으면 null(부른 쪽이 기존 값으로 떨어진다). 순수 함수.
import type { FrameCell, FrameInput, FrameSlot } from '../import/frame.ts'
import type { Bundle } from './types.ts'

interface Slot { index: number; label: string; start: string; end: string; assignable?: boolean; kind?: string }
interface Spec { id: string; slots: Slot[]; lessonsPerDay?: number[] }
interface Track { id: string; name: string; grade?: number | null; specId?: string; homeroomName?: string }
interface Timetable { id: string; specId: string; startDate: string; endDate?: string; priority: number }
interface Assignment { timetableId: string; trackId: string; dayIndex: number; slotIndex: number; activityId?: string; agentId?: string }
interface Doc { specs: Spec[]; tracks: Track[]; timetables: Timetable[]; assignments?: Assignment[]; activities?: { id: string; name: string }[] }

const HOMEROOM = '__homeroom__'
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** `date`(YYYY-MM-DD)를 덮는 시간표 기준으로 틀을 만든다. 덮는 게 없으면 우선순위 가장 높은 것. */
export function frameInputFromBundle(bundle: Bundle | null | undefined, date?: string): FrameInput | null {
  const doc = bundle?.parts.doc as Partial<Doc> | undefined
  if (!doc || !Array.isArray(doc.tracks) || !Array.isArray(doc.specs) || doc.specs.length === 0) return null
  const tts = arr<Timetable>(doc.timetables).slice().sort((a, b) => b.priority - a.priority)
  const tt = (date ? tts.find((t) => t.startDate <= date && (!t.endDate || date <= t.endDate)) : undefined) ?? tts[0]

  const slots: Record<string, FrameSlot[]> = {}
  const lessonsPerDay: Record<string, Record<string, number>> = {}
  for (const s of doc.specs) {
    slots[s.id] = arr<Slot>(s.slots).map((x) => ({ idx: x.index, start: x.start, end: x.end, label: x.label, assignable: x.assignable !== false, kind: x.kind ?? 'lesson' }))
    if (Array.isArray(s.lessonsPerDay)) lessonsPerDay[s.id] = Object.fromEntries(s.lessonsPerDay.map((n, i) => [String(i), n]))
  }
  const tracks = doc.tracks.map((t) => ({
    name: t.name, grade: t.grade ?? null, homeroomName: t.homeroomName ?? null,
    specKey: (t.specId ?? tt?.specId ?? null) as string | null,
  })).filter((t) => t.specKey == null || slots[t.specKey])
  const nameOf = (id?: string) => doc.activities?.find((a) => a.id === id)?.name ?? null
  const trackById = new Map(doc.tracks.map((t) => [t.id, t] as const))
  const cells: FrameCell[] = []
  for (const a of arr<Assignment>(doc.assignments)) {
    if (!tt || a.timetableId !== tt.id) continue
    const t = trackById.get(a.trackId)
    if (!t) continue
    cells.push({ trackName: t.name, dayIndex: a.dayIndex, idx: a.slotIndex, specialist: !!a.agentId && a.agentId !== HOMEROOM, subject: nameOf(a.activityId) })
  }
  return { tracks, slots, lessonsPerDay, cells }
}
