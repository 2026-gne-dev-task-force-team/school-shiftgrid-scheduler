/**
 * 보조 인력 배정 판정과 재배정 추천.
 *
 *   필수  그 시각이 근무 시간대 안 (시각 단위인 사람만. 교시 단위는 원래 들어가던 시각 그대로라 따로 보지 않는다)
 *   필수  그 반 그 시각의 과목이 허용 교과 (허용 교과가 비어 있으면 전부)
 *   필수  그 반 그 시각에 다른 보조 인력이 없음
 *   우선  대상 학반 · 원래 반과 같은 학년 · 앞뒤 시각과 같은 반
 *
 * 전부 분 정수(startMin) 기준이다. 순수 함수만 있다. 하루 시간표(lessons)는 호출하는 쪽이 날짜에 맞춰 만들어 넘긴다.
 * 보조 배정은 그날 입력에서 `aux:<id>` 로 붙는다(sub-engine/day-input.ts).
 */
import { overlaps } from '../clock.ts'

/** 어느 날 어느 반의 수업 칸 하나 */
export interface DayLesson {
  trackName: string
  grade: number | null
  label: string
  startMin: number
  endMin: number
  /** 그날 실제 과목 (시간표 변경 반영) */
  subject: string | null
  /** false 면 그 반이 그 칸에 없음 (체험학습·휴업) */
  available: boolean
  unavailableReason?: string
}

export interface AuxProfile {
  id: string
  name: string
  unit: 'clock' | 'period'
  /** 시각 단위인 사람의 그 요일 근무 시작·종료(분). 교시 단위면 null */
  workStartMin?: number | null
  workEndMin?: number | null
  allowedActivities: string[]
  targetTracks: string[]
}

/** 같은 날 다른 보조 인력이 들어가 있는 칸 */
export interface Occupied { auxId: string; auxName: string; trackName: string; startMin: number; endMin: number }

export interface Candidate {
  trackName: string
  grade: number | null
  label: string
  subject: string | null
  startMin: number
  endMin: number
  score: number
  /** 우선순위를 준 이유 (화면에 보인다) */
  reasons: string[]
}

export interface CheckResult { ok: boolean; reason?: string; lesson?: DayLesson }

type Range = { startMin: number; endMin: number }
// 하루 안의 칸끼리만 비교하므로 요일은 고정값 0 이면 된다
const overlap = (a: Range, b: Range) => overlaps({ dayIndex: 0, startMin: a.startMin, endMin: a.endMin }, { dayIndex: 0, startMin: b.startMin, endMin: b.endMin })

export function isAllowedSubject(aux: Pick<AuxProfile, 'allowedActivities'>, subject: string | null): boolean {
  if (aux.allowedActivities.length === 0) return true
  return subject != null && aux.allowedActivities.includes(subject)
}

/** 그 반 그 시각에 이 사람이 들어갈 수 있나. 못 가면 이유 한 문장 */
export function checkAssignment(args: {
  lessons: DayLesson[]; aux: AuxProfile; trackName: string; startMin: number; endMin: number; occupied: Occupied[]
}): CheckResult {
  const { lessons, aux, trackName, startMin, endMin, occupied } = args
  const range = { startMin, endMin }
  const lesson = lessons.find((l) => l.trackName === trackName && overlap(l, range))
  if (!lesson) return { ok: false, reason: trackName + ' 은 그 시각에 수업이 없음' }
  if (!lesson.available) return { ok: false, reason: lesson.unavailableReason ?? trackName + ' 은 그날 수업 없음', lesson }
  if (!isAllowedSubject(aux, lesson.subject)) return { ok: false, reason: '허용 교과가 아님 (' + (lesson.subject ?? '과목 없음') + ')', lesson }
  if (aux.unit === 'clock') {
    if (aux.workStartMin == null || aux.workEndMin == null) return { ok: false, reason: '그 요일은 근무일이 아님', lesson }
    if (startMin < aux.workStartMin || endMin > aux.workEndMin) return { ok: false, reason: '근무 시간대 밖', lesson }
  }
  const other = occupied.find((o) => o.auxId !== aux.id && o.trackName === trackName && overlap(o, range))
  if (other) return { ok: false, reason: '다른 보조 인력이 있음 (' + other.auxName + ')', lesson }
  return { ok: true, lesson }
}

/**
 * 그 시각에 이 사람이 갈 수 있는 반을 점수순으로.
 *   originalTrack   원래 들어가던 반 (같은 학년 우선의 기준)
 *   adjacentTracks  그날 앞뒤 시각에 들어가는 반들 (이동 최소 우선)
 */
export function recommend(args: {
  lessons: DayLesson[]; aux: AuxProfile; startMin: number; endMin: number; occupied: Occupied[]
  originalTrack?: string | null; adjacentTracks?: string[]
}): Candidate[] {
  const { lessons, aux, startMin, endMin, occupied } = args
  const range = { startMin, endMin }
  const origGrade = args.originalTrack ? lessons.find((l) => l.trackName === args.originalTrack)?.grade ?? null : null
  const adjacent = new Set(args.adjacentTracks ?? [])
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const l of lessons) {
    if (!overlap(l, range) || seen.has(l.trackName)) continue
    seen.add(l.trackName)
    if (!checkAssignment({ lessons, aux, trackName: l.trackName, startMin, endMin, occupied }).ok) continue
    const reasons: string[] = []
    let score = 0
    // 4 · 2 · 1 — 셋이 겹쳐도 순서가 뒤집히지 않는 무게
    if (aux.targetTracks.includes(l.trackName)) { score += 4; reasons.push('대상 학반') }
    if (origGrade != null && l.grade === origGrade) { score += 2; reasons.push('같은 학년') }
    if (adjacent.has(l.trackName)) { score += 1; reasons.push('앞뒤 시각과 같은 반') }
    out.push({ trackName: l.trackName, grade: l.grade, label: l.label, subject: l.subject, startMin: l.startMin, endMin: l.endMin, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score || cmpTrack(a.trackName, b.trackName))
}

/** "3-2" 를 학년·반 숫자로 비교. 1-10 이 1-2 앞에 오지 않게 */
export function cmpTrack(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number)
  return (pa[0] - pb[0]) || (pa[1] - pb[1]) || a.localeCompare(b)
}
