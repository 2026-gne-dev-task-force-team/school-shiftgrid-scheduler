/**
 * 보결 후보 계산 — buildDayInput 결과를 받아 결강 칸마다 후보 목록(A~D)과 제외 사유를 내는 순수 함수.
 * 규칙 원천: 운영 앱 엔진 substituteCandidates 요지(설계 대조 5-1절). 사람마다 위에서 아래로 처음 걸리는 것이 답이다.
 * 던지지 않는다 · DB·Date·fetch 없음 · 시각은 분 정수 [start,end) · 사람은 id 문자열(담임 `homeroom:<반>`).
 * ⚠️ 운영 앱 원문 코드는 이 기기에 없어 대조 문서의 문장에서 옮겼다 — 어긋남은 canon 대조(P13)가 잡는다.
 */
import type { DayInput, DayLesson } from './day-input'

/** 수업 칸 — teacherIds 가 비면 담임 수업(빈칸 = 담임). 운영 앱 꼴 그대로 선택 필드로 둔다. */
export interface CandLesson extends DayLesson { teacherIds?: string[] }
export interface CandTrack { name: string; grade: number | null; lessons: CandLesson[]; lunch: { startMin: number; endMin: number } | null }
export interface CandInput extends Omit<DayInput, 'tracks'> { tracks: CandTrack[] }

export interface SubQuery {
  trackName: string
  startMin: number
  endMin: number
  /** 못 나오는 사람 id. 모르면 null */
  absentId: string | null
}

export type ExcludeCode =
  | 'self' | 'vp' | 'aux' | 'own-homeroom-absent' | 'away' | 'busy'
  | 'homeroom-with-aux' | 'homeroom-free-absent' | 'lunch-miss'
export type Group = 'A' | 'B' | 'C' | 'D'
export type Reason = 'own' | 'homeroom-free' | 'after-school' | 'specialist' | 'non-subject'

export interface Candidate { id: string; name: string; kind: string; trackName?: string; reason: Reason; busyWith?: string }
export interface Excluded { id: string; name: string; kind: string; code: ExcludeCode; detail?: string }
export interface SubResult { A: Candidate[]; B: Candidate[]; C: Candidate[]; D: Candidate[]; excluded: Excluded[] }

const overlap = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

export function substituteCandidates(input: CandInput, q: SubQuery): SubResult {
  const res: SubResult = { A: [], B: [], C: [], D: [], excluded: [] }
  const target = input.tracks.find((t) => t.name === q.trackName)
  if (!target || q.endMin <= q.startMin) return res // 반이 없거나 빈 시각 — 후보 없음(던지지 않는다)

  const ownHomeroomId = 'homeroom:' + target.name
  const homeroomAbsent = q.absentId == null || q.absentId === ownHomeroomId
  // 점심 급식지도 중인 학년: 그 학년 점심이 질의 시각과 겹치면 그 학년 담임은 조용히 빠진다
  const lunchGrades = new Set<number>()
  for (const t of input.tracks) if (t.grade != null && t.lunch && overlap(q.startMin, q.endMin, t.lunch.startMin, t.lunch.endMin)) lunchGrades.add(t.grade)

  const exclude = (p: { id: string; name: string; kind: string }, code: ExcludeCode, detail?: string) => res.excluded.push({ id: p.id, name: p.name, kind: p.kind, code, detail })
  const takenBy = (id: string) => input.taken.find((x) => x.personId === id && overlap(q.startMin, q.endMin, x.startMin, x.endMin))

  for (const p of input.people) {
    const cand = (group: Group, reason: Reason, trackName?: string) => {
      const c: Candidate = { id: p.id, name: p.name, kind: p.kind, reason }
      if (trackName) c.trackName = trackName
      const tk = takenBy(p.id)
      if (tk) c.busyWith = tk.trackName
      res[group].push(c)
    }
    // 1. 못 나오는 본인 · 교감 · 보조
    if (p.id === q.absentId) { exclude(p, 'self'); continue }
    if (p.kind === '교감') { exclude(p, 'vp'); continue }
    if (p.kind === '보조' || p.id.startsWith('aux:')) { exclude(p, 'aux'); continue }
    // 2. 보결 난 반 담임: 결근자가 담임 본인이거나 모를 때만 제외 — 전담 결근이면 아래에서 A 맨 앞(own)
    const isHomeroom = p.id.startsWith('homeroom:')
    if (p.id === ownHomeroomId && homeroomAbsent) { exclude(p, 'own-homeroom-absent'); continue }
    // 3. 그 시각 학교에 없음(본인 결근·종일 복무)
    if (input.absent.some((a) => a.personId === p.id && (a.startMin == null || a.endMin == null || overlap(q.startMin, q.endMin, a.startMin, a.endMin)))) { exclude(p, 'away'); continue }
    const busy = input.busy.find((b) => b.personId === p.id && overlap(q.startMin, q.endMin, b.startMin, b.endMin))

    if (isHomeroom) {
      const trackName = p.id.slice('homeroom:'.length)
      const t = input.tracks.find((x) => x.name === trackName)
      if (!t) continue
      if (p.id === ownHomeroomId) { // 전담 결근 때 그 반 담임 — 자기 반 보결이니 맨 앞
        cand('A', 'own', trackName); continue
      }
      if (busy) { exclude(p, 'busy', busy.reason); continue }
      if (t.grade != null && lunchGrades.has(t.grade)) continue // 급식지도 중 — 조용히 뺌
      const lessons = t.lessons.filter((l) => overlap(q.startMin, q.endMin, l.startMin, l.endMin))
      if (lessons.length === 0) { cand('B', 'after-school', trackName); continue }
      if (lessons.every((l) => (l.teacherIds ?? []).length === 0 && l.coIds.length === 0)) continue // 담임 수업 중 — 뺌
      if (lessons.some((l) => (l.teacherIds ?? []).length === 0)) { // 담임 수업 + 일부 전담 — 담임이 있어야 하는 칸
        if (lessons.some((l) => (l.teacherIds ?? []).length === 0 && l.coIds.length > 0)) { exclude(p, 'homeroom-with-aux'); }
        continue
      }
      cand('A', 'homeroom-free', trackName)
      continue
    }

    // 전담·비교과: 수업 중이면 뺌
    const teaching = input.tracks.some((t) => t.lessons.some((l) => (l.teacherIds ?? []).includes(p.id) && overlap(q.startMin, q.endMin, l.startMin, l.endMin)))
    if (teaching) continue
    if (busy) { exclude(p, 'busy', busy.reason); continue }
    if (p.kind === '비교과') { cand('D', 'non-subject'); continue }
    // 전담: 질의 시각이 자기 수업 반의 점심과 겹치면 점심을 못 먹게 된다
    const lunchMiss = input.tracks.some((t) => t.lunch != null && overlap(q.startMin, q.endMin, t.lunch.startMin, t.lunch.endMin) && t.lessons.some((l) => (l.teacherIds ?? []).includes(p.id) && overlap(t.lunch!.startMin - 60, t.lunch!.endMin + 60, l.startMin, l.endMin)))
    if (lunchMiss) { exclude(p, 'lunch-miss'); continue }
    cand('C', 'specialist')
  }
  // 정렬: A 맨 앞은 own, 나머지는 이름순(운영 앱 시험은 이름 목록 정렬 일치로 비교한다)
  for (const g of ['A', 'B', 'C', 'D'] as const) res[g].sort((a, b) => (a.reason === 'own' ? -1 : 0) - (b.reason === 'own' ? -1 : 0) || a.name.localeCompare(b.name, 'ko'))
  return res
}

/** 결강 칸 하나 = 질의 하나. 결강 목록(absent × 그 사람의 수업 칸)을 칸마다 풀어 후보를 낸다. */
export interface AbsentSlot { trackName: string; startMin: number; endMin: number; absentId: string | null }
export function candidatesForSlots(input: CandInput, slots: AbsentSlot[]): { slot: AbsentSlot; result: SubResult }[] {
  return slots.map((slot) => ({ slot, result: substituteCandidates(input, slot) }))
}
