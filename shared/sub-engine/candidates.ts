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

/** 사람 하나의 판정 — 후보(cand) · 제외 사유가 남는 탈락(exclude) · 조용히 빠짐(quiet, 사유 글만). 후보 계산과 whyNot 이 이 한 함수를 같이 쓴다. */
type Verdict =
  | { v: 'cand'; group: Group; reason: Reason; trackName?: string }
  | { v: 'exclude'; code: ExcludeCode; detail?: string }
  | { v: 'quiet'; why: string }

type Person = CandInput['people'][number]
const fmtMin = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')

/** 질의 하나에 대한 판정기를 만든다(점심 학년·점심 칸 합집합은 한 번만 센다) */
function makeJudge(input: CandInput, q: SubQuery): ((p: Person) => Verdict) | null {
  const target = input.tracks.find((t) => t.name === q.trackName)
  if ((!target && q.trackName !== '') || q.endMin <= q.startMin) return null // 없는 반이거나 빈 시각 — 후보 없음(던지지 않는다). 반 이름이 빈 글자면 「자기 반 없음」 질의
  const ownHomeroomId = target ? 'homeroom:' + target.name : ''
  const homeroomAbsent = q.absentId == null || q.absentId === ownHomeroomId
  // 점심 급식지도 중인 학년: 그 학년 점심이 질의 시각과 겹치면 그 학년 담임은 조용히 빠진다
  const lunchGrades = new Set<number>()
  for (const t of input.tracks) if (t.grade != null && t.lunch && overlap(q.startMin, q.endMin, t.lunch.startMin, t.lunch.endMin)) lunchGrades.add(t.grade)
  const lunchSlots: { s: number; e: number }[] = []
  for (const t of input.tracks) if (t.lunch && !lunchSlots.some((w) => w.s === t.lunch!.startMin && w.e === t.lunch!.endMin)) lunchSlots.push({ s: t.lunch.startMin, e: t.lunch.endMin })

  return (p) => {
    // 1. 못 나오는 본인 · 교감 · 보조
    if (p.id === q.absentId) return { v: 'exclude', code: 'self' }
    if (p.kind === '교감') return { v: 'exclude', code: 'vp' }
    if (p.kind === '보조' || p.id.startsWith('aux:')) return { v: 'exclude', code: 'aux' }
    // 2. 보결 난 반 담임: 결근자가 담임 본인이거나 모를 때만 제외 — 전담 결근이면 아래에서 A 맨 앞(own)
    const isHomeroom = p.id.startsWith('homeroom:')
    if (p.id === ownHomeroomId && homeroomAbsent) return { v: 'exclude', code: 'own-homeroom-absent' }
    // 3. 그 시각 학교에 없음(본인 결근·종일 복무)
    if (input.absent.some((a) => a.personId === p.id && (a.startMin == null || a.endMin == null || overlap(q.startMin, q.endMin, a.startMin, a.endMin)))) return { v: 'exclude', code: 'away' }
    const busy = input.busy.find((b) => b.personId === p.id && overlap(q.startMin, q.endMin, b.startMin, b.endMin))

    if (isHomeroom) {
      const trackName = p.id.slice('homeroom:'.length)
      const t = input.tracks.find((x) => x.name === trackName)
      if (!t) return { v: 'quiet', why: '담임 반 ' + trackName + ' 이(가) 시간표에 없음' }
      if (p.id === ownHomeroomId) return { v: 'cand', group: 'A', reason: 'own', trackName } // 전담 결근 때 그 반 담임 — 자기 반 보결이니 맨 앞
      if (busy) return { v: 'exclude', code: 'busy', detail: busy.reason }
      if (t.grade != null && lunchGrades.has(t.grade)) return { v: 'quiet', why: t.grade + '학년 점심 급식지도 시간' }
      const lessons = t.lessons.filter((l) => overlap(q.startMin, q.endMin, l.startMin, l.endMin))
      if (lessons.length === 0) return { v: 'cand', group: 'B', reason: 'after-school', trackName }
      if (lessons.every((l) => (l.teacherIds ?? []).length === 0 && l.coIds.length === 0)) return { v: 'quiet', why: '자기 반 ' + trackName + ' 담임 수업 중' }
      if (lessons.some((l) => (l.teacherIds ?? []).length === 0)) { // 담임 수업 + 일부 전담 — 담임이 있어야 하는 칸
        if (lessons.some((l) => (l.teacherIds ?? []).length === 0 && l.coIds.length > 0)) return { v: 'exclude', code: 'homeroom-with-aux' }
        return { v: 'quiet', why: '자기 반 ' + trackName + ' 담임 수업 칸이 겹침' }
      }
      return { v: 'cand', group: 'A', reason: 'homeroom-free', trackName }
    }

    // 전담·비교과: 수업 중이면 뺌
    const teachingTrack = input.tracks.find((t) => t.lessons.some((l) => (l.teacherIds ?? []).includes(p.id) && overlap(q.startMin, q.endMin, l.startMin, l.endMin)))
    if (teachingTrack) return { v: 'quiet', why: '그 시각 수업 있음 ' + teachingTrack.name }
    if (busy) return { v: 'exclude', code: 'busy', detail: busy.reason }
    if (p.kind === '비교과') return { v: 'cand', group: 'D', reason: 'non-subject' }
    // 전담 점심: 질의가 학교 점심 칸(학년별 점심의 합집합) 중 하나와 겹치면, 나머지 점심 칸 가운데 수업·고정·확정 보결이 안 걸린 칸이 하나는 남아야 밥을 먹는다
    const lunchMiss = lunchSlots.some((w) => overlap(q.startMin, q.endMin, w.s, w.e)) && !lunchSlots.some((w) => !overlap(q.startMin, q.endMin, w.s, w.e)
      && !input.tracks.some((t) => t.lessons.some((l) => (l.teacherIds ?? []).includes(p.id) && overlap(w.s, w.e, l.startMin, l.endMin)))
      && !input.busy.some((b) => b.personId === p.id && overlap(w.s, w.e, b.startMin, b.endMin))
      && !input.taken.some((x) => x.personId === p.id && overlap(w.s, w.e, x.startMin, x.endMin)))
    if (lunchMiss) return { v: 'exclude', code: 'lunch-miss' }
    return { v: 'cand', group: 'C', reason: 'specialist' }
  }
}

export function substituteCandidates(input: CandInput, q: SubQuery): SubResult {
  const res: SubResult = { A: [], B: [], C: [], D: [], excluded: [] }
  const judge = makeJudge(input, q)
  if (!judge) return res
  const takenBy = (id: string) => input.taken.find((x) => x.personId === id && overlap(q.startMin, q.endMin, x.startMin, x.endMin))
  for (const p of input.people) {
    const v = judge(p)
    if (v.v === 'exclude') res.excluded.push({ id: p.id, name: p.name, kind: p.kind, code: v.code, detail: v.detail })
    else if (v.v === 'cand') {
      const c: Candidate = { id: p.id, name: p.name, kind: p.kind, reason: v.reason }
      if (v.trackName) c.trackName = v.trackName
      const tk = takenBy(p.id)
      if (tk) c.busyWith = tk.trackName
      res[v.group].push(c)
    }
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

const EXCLUDE_TEXT: Record<ExcludeCode, string> = {
  self: '못 나오는 본인', vp: '교감', aux: '보조 인력', 'own-homeroom-absent': '결강 난 반 담임이 본인이거나 결근자를 모름',
  away: '그 시각 학교에 없음(결근·복무)', busy: '고정 일정', 'homeroom-with-aux': '담임 수업 칸에 보조 인력이 함께 있음',
  'homeroom-free-absent': '담임 결근', 'lunch-miss': '점심 칸이 다 막힘',
}

/** 그 교사(사람 id)가 이 질의의 후보에서 빠진 이유 — 사람이 읽는 문장 목록. 후보이면 빈 목록. 후보 계산과 같은 판정기를 쓴다. */
export function whyNot(input: CandInput, q: SubQuery, personId: string): string[] {
  const judge = makeJudge(input, q)
  if (!judge) return [!input.tracks.some((t) => t.name === q.trackName) && q.trackName !== '' ? '질의한 반 ' + q.trackName + ' 이(가) 없음' : '질의 시각이 비었음(' + fmtMin(q.startMin) + '~' + fmtMin(q.endMin) + ')']
  const p = input.people.find((x) => x.id === personId)
  if (!p) return ['명단에 없는 사람']
  const v = judge(p)
  if (v.v === 'cand') return []
  if (v.v === 'quiet') return [v.why]
  return [EXCLUDE_TEXT[v.code] + (v.detail ? ' ' + v.detail : '')]
}
