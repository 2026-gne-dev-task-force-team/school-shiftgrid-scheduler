/**
 * 후보 계산 엔진에 넣을 「그날 입력」 조립 — 이미 꺼낸 값들을 받아 일곱 가지를 정해진 순서로 얹는 순수 함수.
 * 순서가 결과를 바꾼다: ④ 가 수업을 비운 뒤에 ⑤⑥ 을 얹고, ⑦ 은 남은 수업에만 붙는다.
 * DB·fetch·Date.now 없음 — 「오늘」·날짜는 인자로 받는다. 시각은 분 정수(shared/clock.ts), 사람은 id 문자열.
 */

export interface DayLesson { startMin: number; endMin: number; subject: string | null; coIds: string[] }
export interface DayTrack { name: string; grade: number | null; lessons: DayLesson[]; lunch: { startMin: number; endMin: number } | null }
export interface DayPerson { id: string; name: string; kind: string }
export interface Busy { personId: string; startMin: number; endMin: number; reason?: string }
/** startMin·endMin 이 null 이면 종일 */
export interface Absent { personId: string; startMin: number | null; endMin: number | null }
export interface Taken { personId: string; startMin: number; endMin: number; trackName: string }

/** 0번: 그날 시간표에서 뽑은 기본 입력(점심 포함). 이 함수는 복사해서 쓴다. */
export interface BaseDay { tracks: DayTrack[]; people: DayPerson[] }

export interface DayInput { tracks: DayTrack[]; people: DayPerson[]; busy: Busy[]; absent: Absent[]; taken: Taken[] }

export interface FixedItem { dayIndex: number; personId: string; startMin: number; endMin: number; reason?: string }
export interface SlotItem { absentId: string; allDay: boolean; startMin: number; endMin: number; status: string; takerId: string | null; trackName: string }
/** targetKind: all 학교 전체 · grade 학년 · track 반 */
export interface CalendarItem { kind: string; targetKind: 'all' | 'grade' | 'track'; targetValue: string }
/** period 없으면 반 전체 없음, 있으면 그 반 기준 교시 과목 변경 */
export interface ChangeItem { trackName: string; period: number | null; activityName: string }
export interface ClassSubject { trackName: string; startMin: number; subject: string }
export interface AuxSlot { trackName: string | null; startMin: number; endMin: number; status: string }
export interface AuxStaff { auxId: string; name: string; slots: AuxSlot[] }

export interface DayInputArgs {
  dayIndex: number
  base: BaseDay
  /** ① 교감 사람 id(`user:<id>`)와 이름 */
  vps: { id: string; name: string }[]
  fixed: FixedItem[]
  slots: SlotItem[]
  calendar: CalendarItem[]
  changes: ChangeItem[]
  classSubjects: ClassSubject[]
  /** 그 반 기준 N교시의 시작 분. 없으면 null */
  periodStart: (trackName: string, period: number) => number | null
  /** ⑦ 근태 배정. null 이면 자료 없음(열지 못함) → partial 에 aux */
  aux: AuxStaff[] | null
}

export type DayInputResult =
  | { ok: true; input: DayInput; partial: 'aux'[]; offTracks: string[] }
  | { ok: false; reason: 'school-off'; offReason: string }

export function buildDayInput(a: DayInputArgs): DayInputResult {
  // ④ 의 학교 전체 쉼은 맨 앞에서 거부 — 나머지를 얹을 이유가 없다
  const allOff = a.calendar.find((c) => c.targetKind === 'all')
  if (allOff) return { ok: false, reason: 'school-off', offReason: allOff.kind }

  // 0 + ①
  const tracks: DayTrack[] = a.base.tracks.map((t) => ({ ...t, lessons: t.lessons.map((l) => ({ ...l, coIds: [...l.coIds] })) }))
  const people: DayPerson[] = [...a.base.people, ...a.vps.filter((v) => !a.base.people.some((p) => p.id === v.id)).map((v) => ({ id: v.id, name: v.name, kind: '교감' }))]
  const busy: Busy[] = []
  const absent: Absent[] = []
  const taken: Taken[] = []

  // ②
  for (const f of a.fixed) if (f.dayIndex === a.dayIndex) busy.push({ personId: f.personId, startMin: f.startMin, endMin: f.endMin, reason: f.reason })

  // ③
  for (const s of a.slots) {
    absent.push(s.allDay ? { personId: s.absentId, startMin: null, endMin: null } : { personId: s.absentId, startMin: s.startMin, endMin: s.endMin })
    if (s.status === '확정' && s.takerId) taken.push({ personId: s.takerId, startMin: s.startMin, endMin: s.endMin, trackName: s.trackName })
  }

  // ④ 반 전체 없음 · 학년/반 행사 → 수업 비우고 담임 종일 결근
  const off = new Set<string>()
  for (const c of a.changes) if (c.period == null) off.add(c.trackName)
  for (const c of a.calendar) for (const t of tracks) {
    if ((c.targetKind === 'track' && c.targetValue === t.name) || (c.targetKind === 'grade' && t.grade != null && c.targetValue === String(t.grade))) off.add(t.name)
  }
  for (const t of tracks) if (off.has(t.name)) {
    t.lessons = []; t.lunch = null
    absent.push({ personId: 'homeroom:' + t.name, startMin: null, endMin: null })
  }

  // ⑤ 담임 칸 과목 — 비어 있는 과목만 채운다
  for (const h of a.classSubjects) {
    const l = tracks.find((t) => t.name === h.trackName)?.lessons.find((x) => x.startMin === h.startMin)
    if (l && l.subject == null) l.subject = h.subject
  }

  // ⑥ 교시 과목 변경 — 표시용
  for (const c of a.changes) {
    if (c.period == null) continue
    const start = a.periodStart(c.trackName, c.period)
    const l = start == null ? undefined : tracks.find((t) => t.name === c.trackName)?.lessons.find((x) => x.startMin === start)
    if (l) l.subject = c.activityName
  }

  // ⑦ 보조 — 남은 수업에만. 자료가 없으면 빼고 partial 로 알린다
  const partial: 'aux'[] = []
  if (a.aux == null) partial.push('aux')
  else for (const s of a.aux) for (const sl of s.slots) {
    if (!sl.trackName || sl.status !== 'ok') continue
    const id = 'aux:' + s.auxId
    if (!people.some((p) => p.id === id)) people.push({ id, name: s.name, kind: '보조' })
    const l = tracks.find((t) => t.name === sl.trackName)?.lessons.find((x) => x.startMin < sl.endMin && sl.startMin < x.endMin)
    if (l && !l.coIds.includes(id)) l.coIds.push(id)
  }

  return { ok: true, input: { tracks, people, busy, absent, taken }, partial, offTracks: [...off] }
}
