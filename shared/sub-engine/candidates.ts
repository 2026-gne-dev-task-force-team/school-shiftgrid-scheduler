/**
 * 보결 후보 계산 — buildDayInput 결과를 받아 결강 칸마다 후보 목록(A~D)과 제외 사유를 내는 순수 함수.
 * 원문: 운영 앱 엔진 `packages/engine/src/substitute.ts` 의 substituteCandidates (선생님이 보내신 코드 · R103).
 * 규칙·순서·사유 글자를 그대로 옮기고 1.2v 입력 꼴에만 맞췄다:
 *   - 담임은 kind·trackName 대신 id `homeroom:<반>` 으로 가린다
 *   - 학교 점심 칸(lunchTimes)은 따로 받지 않고 반별 lunch 를 시작 시각으로 합친다(원문 subDayFromDoc 과 같은 합집합)
 *   - lessons.teacherIds 는 선택 필드(없으면 빈 목록 = 담임 칸) · busy.reason 이 없으면 「고정 일정」
 *   - 질의의 trackName 빈 글자는 원문의 null(전체 보기)과 같다
 *   - 1.2v 에서 더한 것 하나: 없는 반이거나 시각이 비면 빈 결과(던지지 않는다)
 *   - 원문이 조용히 넘기는 사람(continue)은 whyNot 이 문장을 내도록 판정기 한 함수로 묶었다 — 후보 결과는 원문과 같다
 *
 *   A 담임  = 그 시각 자기 반이 전담 수업 중인 담임 (보결이 난 반 담임은 맨 앞 — 전담이 못 나온 경우)
 *   B 담임  = 학생을 이미 하교시킨 담임 (참고용)
 *   C 전담  = 그 시각 수업이 없는 전담
 *   D 비교과 = 상담·사서·보건·기초학력 (직무가 없으면 '확인 후 배정')
 *
 *   빼는 것: 급식지도 중인 담임, 고정일정에 걸린 사람, 그 시간에 학교에 없는 사람(본인 보결·종일 복무),
 *           자기 반에 들어올 전담이 결근인 담임(그 반 보결이 찼으면 다시 후보), 점심을 못 먹게 되는 전담,
 *           교감, 보조 인력(스포츠강사·원어민 — 담임이 함께 있어야 하는 반의 담임도 묶인다)
 *
 * 순서: 사람은 입력 people 순서 그대로 나온다(원문은 반 정렬 순 담임 → 에이전트 순). 이름순으로 다시 늘어놓지 않는다.
 * 원문과 같이 서버가 얹는 것(교감 사람·고정일정·근태 보조)은 day-input.ts 몫이다.
 * 던지지 않는다 · DB·Date·fetch 없음 · 시각은 분 정수 [start,end).
 */
import type { DayInput, DayLesson, DayPerson } from './day-input'

/** 수업 칸 — teacherIds 가 비면 담임 수업(빈칸 = 담임). 운영 앱 꼴 그대로 선택 필드로 둔다. */
export interface CandLesson extends DayLesson { teacherIds?: string[] }
export interface CandTrack { name: string; grade: number | null; lessons: CandLesson[]; lunch: { startMin: number; endMin: number } | null }
/** role: 비교과 직무(상담교사 등) — D 칸 사유로 쓴다 */
export interface CandPerson extends DayPerson { role?: string }
export interface CandInput extends Omit<DayInput, 'tracks' | 'people'> { tracks: CandTrack[]; people: CandPerson[] }

export interface SubQuery {
  /** 보결이 난 반. null·빈 글자면 전체 보기 */
  trackName: string | null
  startMin: number
  endMin: number
  /** 못 나오는 사람 id. 전담이면 그 반 담임이 첫 후보가 된다. 모르면 null */
  absentId: string | null
}

export interface Candidate { id: string; name: string; kind: string; trackName?: string; reason: string; busyWith?: string }
export interface SubResult { A: Candidate[]; B: Candidate[]; C: Candidate[]; D: Candidate[]; excluded: Candidate[] }

type Range = { startMin: number; endMin: number }
const ov = (a: Range, b: Range) => a.startMin < b.endMin && b.startMin < a.endMin
const fmt = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
const HR = 'homeroom:'

/** 사람 하나의 판정 — 후보 칸(A·B·C·D·own) · 제외(excluded) · 조용히 빠짐(quiet, whyNot 문장만) */
type Verdict =
  | { v: 'A' | 'B' | 'C' | 'D' | 'own' | 'excluded'; reason: string }
  | { v: 'quiet'; why: string }

/** 질의 하나에 대한 판정기. 없는 반·빈 시각이면 null */
function makeJudge(input: CandInput, q: SubQuery): ((p: CandPerson) => Verdict) | null {
  const qTrack = q.trackName || null
  if ((qTrack != null && !input.tracks.some((t) => t.name === qTrack)) || q.endMin <= q.startMin) return null
  const range = { startMin: q.startMin, endMin: q.endMin }
  const byId = new Map(input.people.map((p) => [p.id, p]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const isAux = (id: string) => byId.get(id)?.kind === '보조'
  const { absent, taken } = input
  const tIds = (l: CandLesson) => l.teacherIds ?? []
  // 학교 점심 칸 = 반별 점심을 시작 시각으로 합친 것 (원문 subDayFromDoc 의 lunchTimes)
  const lunchMap = new Map<number, Range>()
  for (const t of input.tracks) if (t.lunch) lunchMap.set(t.lunch.startMin, { startMin: t.lunch.startMin, endMin: t.lunch.endMin })
  const lunchTimes = [...lunchMap.values()].sort((a, b) => a.startMin - b.startMin)

  const awayNow = (id: string) => absent.some((a) => a.personId === id && a.startMin != null && ov({ startMin: a.startMin, endMin: a.endMin! }, range))
  const allDay = (id: string) => absent.some((a) => a.personId === id && a.startMin == null)
  const gone = (id: string) => awayNow(id) || allDay(id)
  const coveredBy = (track: string) => taken.find((t) => t.trackName === track && ov(t, range))?.personId

  // 그 시각에 수업 중인 사람 (전담·협력)
  const teachingAt = (id: string, r: Range) =>
    input.tracks.find((t) => t.lessons.some((l) => ov(l, r) && (tIds(l).includes(id) || l.coIds.includes(id))))
  const blockAt = (id: string, r: Range) => input.busy.find((b) => b.personId === id && ov(b, r))
  const blockWhy = (b: { reason?: string }) => b.reason ?? '고정 일정'

  /** 전담이 점심 칸에 들어가면 그날 밥 먹을 다른 점심 칸이 남는가. 안 남으면 사유 */
  const lunchGone = (id: string): string => {
    if (!lunchTimes.some((l) => ov(l, range))) return ''
    const why: string[] = []
    const free = lunchTimes.filter((l) => !ov(l, range)).some((l) => {
      const t = teachingAt(id, l)
      if (t) { why.push(fmt(l.startMin) + ' ' + t.name + ' 수업'); return false }
      const b = blockAt(id, l)
      if (b) { why.push(fmt(l.startMin) + ' ' + blockWhy(b)); return false }
      const h = taken.find((x) => x.personId === id && ov(x, l))
      if (h) { why.push(fmt(l.startMin) + ' ' + h.trackName + ' 보결'); return false }
      return true
    })
    return free ? '' : '점심 시간이 없어짐 (' + why.join(', ') + ')'
  }

  return (p) => {
    if (p.kind === '보조') return { v: 'quiet', why: '보조 인력 — 보결 후보 목록에 넣지 않음' }
    if (p.kind === '교감') return { v: 'quiet', why: '교감 — 보결 후보 목록에 넣지 않음' }
    const cls = p.id.startsWith(HR) ? p.id.slice(HR.length) : undefined
    // 보결이 난 그 반 담임. 본인이 못 나오는 것이거나 누가 못 나오는지 모르면 뺀다
    if (cls && cls === qTrack && (!q.absentId || q.absentId === p.id)) return { v: 'quiet', why: '보결이 난 반 담임 — 본인이 못 나오거나 결근자를 모름' }
    if (gone(p.id)) return { v: 'excluded', reason: allDay(p.id) ? '이 날 종일 복무' : '이 교시에 본인 보결이 올라 있음 · 이 시간에는 학교에 없음' }
    if (cls) {
      const t = input.tracks.find((x) => x.name === cls)
      if (!t) return { v: 'quiet', why: '담임 반 ' + cls + ' 이(가) 시간표에 없음' }
      const blk = blockAt(p.id, range) // 담임의 고정일정(부장회의 등)
      if (blk) return { v: 'excluded', reason: blockWhy(blk) }
      if (t.lunch && ov(t.lunch, range)) return { v: 'quiet', why: cls + ' 점심 급식지도 시간' }
      const lesson = t.lessons.find((l) => ov(l, range))
      if (!lesson) return { v: 'B', reason: '학생 하교 후' } // 하교
      const all = [...tIds(lesson), ...lesson.coIds]
      if (all.length === 0) return { v: 'quiet', why: '자기 반 ' + cls + ' 담임 수업 중' }
      const solo = all.filter((id) => !isAux(id))
      if (solo.length === 0) return { v: 'excluded', reason: all.map(nameOf).join('/') + ' 수업 · 담임이 함께 들어가는 시간' }
      if (cls === qTrack) return { v: 'own', reason: '우리 반 · 이 시간 공강' } // 전담이 못 나와서 생긴 보결
      const here = solo.filter((id) => !gone(id))
      if (here.length === 0) {
        const by = coveredBy(cls)
        if (by) return { v: 'A', reason: solo.map(nameOf).join('/') + ' 결근 · ' + nameOf(by) + ' 선생님이 대신 수업' }
        return { v: 'excluded', reason: solo.map(nameOf).join('/') + ' 결근 · 우리 반 수업을 봐야 함' }
      }
      return { v: 'A', reason: here.map(nameOf).join('/') + ' 수업 중' }
    }
    const teaching = teachingAt(p.id, range)
    if (teaching) return { v: 'quiet', why: '그 시각 수업 있음 ' + teaching.name } // 수업 중 — 어느 칸에도 안 나온다
    const b = blockAt(p.id, range)
    if (b) return { v: 'excluded', reason: blockWhy(b) }
    if (p.kind === '전담') {
      const lunch = lunchGone(p.id)
      if (lunch) return { v: 'excluded', reason: lunch }
      return { v: 'C', reason: '이 시간 수업 없음' }
    }
    return { v: 'D', reason: p.role ?? '확인 후 배정' }
  }
}

export function substituteCandidates(input: CandInput, q: SubQuery): SubResult {
  const out: SubResult = { A: [], B: [], C: [], D: [], excluded: [] }
  const judge = makeJudge(input, q)
  if (!judge) return out
  const range = { startMin: q.startMin, endMin: q.endMin }
  const own: Candidate[] = []
  for (const p of input.people) {
    const v = judge(p)
    if (v.v === 'quiet') continue
    const c: Candidate = { id: p.id, name: p.name, kind: p.kind, reason: v.reason }
    if (p.id.startsWith(HR)) c.trackName = p.id.slice(HR.length)
    const t = input.taken.find((x) => x.personId === p.id && ov(x, range))
    if (t) c.busyWith = t.trackName
    if (v.v === 'own') own.push(c)
    else out[v.v].push(c)
  }
  out.A = own.concat(out.A)
  return out
}

/** 결강 칸 하나 = 질의 하나. 결강 목록(absent × 그 사람의 수업 칸)을 칸마다 풀어 후보를 낸다. */
export interface AbsentSlot { trackName: string; startMin: number; endMin: number; absentId: string | null }
export function candidatesForSlots(input: CandInput, slots: AbsentSlot[]): { slot: AbsentSlot; result: SubResult }[] {
  return slots.map((slot) => ({ slot, result: substituteCandidates(input, slot) }))
}

/** 그 교사(사람 id)가 이 질의의 후보에서 빠진 이유 — 사람이 읽는 문장 목록. 후보이면 빈 목록. 후보 계산과 같은 판정기를 쓴다. */
export function whyNot(input: CandInput, q: SubQuery, personId: string): string[] {
  const judge = makeJudge(input, q)
  if (!judge) return [q.trackName && !input.tracks.some((t) => t.name === q.trackName) ? '질의한 반 ' + q.trackName + ' 이(가) 없음' : '질의 시각이 비었음(' + fmt(q.startMin) + '~' + fmt(q.endMin) + ')']
  const p = input.people.find((x) => x.id === personId)
  if (!p) return ['명단에 없는 사람']
  const v = judge(p)
  if (v.v === 'quiet') return [v.why]
  if (v.v === 'excluded') return [v.reason]
  return []
}
