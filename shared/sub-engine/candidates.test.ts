import { describe, expect, it } from 'vitest'
import { substituteCandidates, whyNot, type CandInput } from './candidates'

/**
 * 원문 substitute.test.ts 의 「동적 규칙」을 합성 표본으로 옮긴 시험 + R103 선생님이 짚은 네 경우(①~④).
 * 이름은 전부 가짜다(⛔ 실명).
 *
 *   반    점심       09:00~09:40          09:50~10:30
 *   1-1   12:00      전담 S1              담임
 *   1-2   12:00      전담 S2              전담 S1
 *   2-1   12:50      담임                 전담 S2
 *   2-2   12:50      보조 aux:1 (담임 칸)  담임
 *   3-1   13:40      전담 S3 + 협력 S4    담임
 */
function day(): CandInput {
  const L = (startMin: number, teacherIds: string[] = [], coIds: string[] = []) => ({ startMin, endMin: startMin + 40, subject: null, teacherIds, coIds })
  return {
    tracks: [
      { name: '1-1', grade: 1, lunch: { startMin: 720, endMin: 760 }, lessons: [L(540, ['S1']), L(590)] },
      { name: '1-2', grade: 1, lunch: { startMin: 720, endMin: 760 }, lessons: [L(540, ['S2']), L(590, ['S1'])] },
      { name: '2-1', grade: 2, lunch: { startMin: 770, endMin: 810 }, lessons: [L(540), L(590, ['S2'])] },
      { name: '2-2', grade: 2, lunch: { startMin: 770, endMin: 810 }, lessons: [L(540, [], ['aux:1']), L(590)] },
      { name: '3-1', grade: 3, lunch: { startMin: 820, endMin: 860 }, lessons: [L(540, ['S3'], ['S4']), L(590)] },
    ],
    people: [
      { id: 'homeroom:1-1', name: '하일', kind: '담임' },
      { id: 'homeroom:1-2', name: '하이', kind: '담임' },
      { id: 'homeroom:2-1', name: '두일', kind: '담임' },
      { id: 'homeroom:2-2', name: '두이', kind: '담임' },
      { id: 'homeroom:3-1', name: '가삼', kind: '담임' },
      { id: 'S1', name: '영어샘', kind: '전담' },
      { id: 'S2', name: '음악샘', kind: '전담' },
      { id: 'S3', name: '체육샘', kind: '전담' },
      { id: 'S4', name: '협력샘', kind: '전담' },
      { id: 'S5', name: '과학샘', kind: '전담' },
      { id: 'S6', name: '미술샘', kind: '전담' },
      { id: 'N1', name: '상담샘', kind: '비교과', role: '상담교사' },
      { id: 'N2', name: '사서샘', kind: '비교과' },
      { id: 'vp', name: '교감샘', kind: '교감' },
      { id: 'aux:1', name: '튜터', kind: '보조' },
    ],
    busy: [{ personId: 'S5', startMin: 540, endMin: 580, reason: '교무회의' }],
    absent: [], taken: [],
  }
}
const q = { trackName: '1-1', startMin: 540, endMin: 580, absentId: 'homeroom:1-1' } // 1-1 담임 결근 · 09:00
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)
const everyone = (r: ReturnType<typeof substituteCandidates>) => ids([...r.A, ...r.B, ...r.C, ...r.D, ...r.excluded])

describe('substituteCandidates (원문 substitute.ts 이식)', () => {
  it('기본: A 는 사람 순서 그대로(이름순 아님) · C 수업 없는 전담 · D 비교과는 직무 또는 「확인 후 배정」', () => {
    const r = substituteCandidates(day(), q)
    expect(ids(r.A)).toEqual(['homeroom:1-2', 'homeroom:3-1']) // 이름순이면 가삼(3-1)이 앞
    expect(r.A.map((x) => x.reason)).toEqual(['음악샘 수업 중', '체육샘/협력샘 수업 중'])
    expect(r.A[0].trackName).toBe('1-2')
    expect(ids(r.C)).toEqual(['S6'])
    expect(r.D.map((x) => [x.id, x.reason])).toEqual([['N1', '상담교사'], ['N2', '확인 후 배정']])
  })
  it('① 자기 반 전담이 결근한 담임은 제외 — 그 반 보결이 확정되면 다시 A(대신 수업)', () => {
    const inp = day()
    inp.absent.push({ personId: 'S2', startMin: 540, endMin: 580 })
    const r1 = substituteCandidates(inp, q)
    expect(ids(r1.A)).not.toContain('homeroom:1-2')
    expect(r1.excluded.find((x) => x.id === 'homeroom:1-2')?.reason).toBe('음악샘 결근 · 우리 반 수업을 봐야 함')
    inp.taken.push({ personId: 'S6', startMin: 540, endMin: 580, trackName: '1-2' })
    const r2 = substituteCandidates(inp, q)
    expect(r2.A.find((x) => x.id === 'homeroom:1-2')?.reason).toBe('음악샘 결근 · 미술샘 선생님이 대신 수업')
    expect(r2.C.find((x) => x.id === 'S6')?.busyWith).toBe('1-2')
  })
  it('① 전담이 못 나오면 그 반 담임이 A 맨 앞(우리 반 · 이 시간 공강) · 결근한 전담은 어디에도 없다', () => {
    const inp = day()
    inp.absent.push({ personId: 'S1', startMin: 540, endMin: 580 })
    const r = substituteCandidates(inp, { trackName: '1-1', startMin: 540, endMin: 580, absentId: 'S1' })
    expect(r.A[0]).toMatchObject({ id: 'homeroom:1-1', trackName: '1-1', reason: '우리 반 · 이 시간 공강' })
    expect(ids(r.A)).toEqual(['homeroom:1-1', 'homeroom:1-2', 'homeroom:3-1'])
    expect(ids([...r.A, ...r.C])).not.toContain('S1')
  })
  it('② 전담 점심: 질의가 점심 칸이면 남은 점심 칸이 하나라도 비어야 C — 다 막히면 사유와 함께 제외', () => {
    const lq = { trackName: '2-1', startMin: 720, endMin: 760, absentId: 'S2' } // 1학년 점심 칸
    expect(ids(substituteCandidates(day(), lq).C)).toContain('S6')
    const inp = day()
    inp.taken.push({ personId: 'S6', startMin: 770, endMin: 810, trackName: '2-2' }) // 남은 둘 중 하나만 막힘 → 아직 후보
    expect(ids(substituteCandidates(inp, lq).C)).toContain('S6')
    inp.busy.push({ personId: 'S6', startMin: 820, endMin: 860, reason: '출장' }) // 둘 다 막힘
    const r = substituteCandidates(inp, lq)
    expect(ids(r.C)).not.toContain('S6')
    expect(r.excluded.find((x) => x.id === 'S6')?.reason).toBe('점심 시간이 없어짐 (12:50 2-2 보결, 13:40 출장)')
  })
  it('③ 협력수업 중인 전담은 수업 중 — C 에도 제외에도 없다', () => {
    const r = substituteCandidates(day(), q)
    expect(everyone(r)).not.toContain('S4')
    expect(whyNot(day(), q, 'S4')).toEqual(['그 시각 수업 있음 3-1'])
  })
  it('④ 본인(결근한 그 반 담임)·교감·보조 인력은 제외 목록에도 안 넣는다', () => {
    const r = substituteCandidates(day(), q)
    for (const id of ['homeroom:1-1', 'vp', 'aux:1']) expect(everyone(r)).not.toContain(id)
    // 누가 못 나오는지 모를 때도 그 반 담임은 빠진다
    expect(everyone(substituteCandidates(day(), { ...q, absentId: null }))).not.toContain('homeroom:1-1')
  })
  it('보조 인력만 든 반의 담임은 묶인다(「담임이 함께」) · 자기 반 담임 수업 중이면 조용히 빠진다', () => {
    const r = substituteCandidates(day(), q)
    expect(r.excluded.find((x) => x.id === 'homeroom:2-2')?.reason).toBe('튜터 수업 · 담임이 함께 들어가는 시간')
    expect(everyone(r)).not.toContain('homeroom:2-1')
  })
  it('그 시각에 본인 보결이 올라 있는 사람은 빠지고(교시 단위) 다른 교시에는 다시 나온다', () => {
    const inp = day()
    inp.absent.push({ personId: 'homeroom:3-1', startMin: 540, endMin: 580 })
    expect(substituteCandidates(inp, q).excluded.find((x) => x.id === 'homeroom:3-1')?.reason).toContain('학교에 없음')
    expect(substituteCandidates(inp, { ...q, startMin: 590, endMin: 630 }).excluded.some((x) => x.id === 'homeroom:3-1')).toBe(false)
  })
  it('종일 복무는 하루 전부 빠진다 · 고정일정은 사유와 함께 빠진다', () => {
    const inp = day()
    inp.absent.push({ personId: 'S6', startMin: null, endMin: null })
    const r = substituteCandidates(inp, q)
    expect(r.excluded.find((x) => x.id === 'S6')?.reason).toBe('이 날 종일 복무')
    expect(r.excluded.find((x) => x.id === 'S5')?.reason).toBe('교무회의')
  })
  it('같은 시각에 이미 다른 보결을 맡은 사람은 busyWith 가 붙는다', () => {
    const inp = day()
    inp.taken.push({ personId: 'homeroom:3-1', startMin: 540, endMin: 580, trackName: '2-1' })
    expect(substituteCandidates(inp, q).A.find((x) => x.id === 'homeroom:3-1')?.busyWith).toBe('2-1')
  })
  it('하교한 반 담임은 B · 급식지도 중인 반 담임은 조용히 빠진다', () => {
    const late = substituteCandidates(day(), { ...q, startMin: 640, endMin: 680 })
    expect(ids(late.B)).toEqual(['homeroom:1-2', 'homeroom:2-1', 'homeroom:2-2', 'homeroom:3-1'])
    const lq = { trackName: '3-1', startMin: 720, endMin: 760, absentId: 'homeroom:3-1' }
    expect(everyone(substituteCandidates(day(), lq))).not.toContain('homeroom:1-2')
    expect(whyNot(day(), lq, 'homeroom:1-2')).toEqual(['1-2 점심 급식지도 시간'])
  })
  it('반 없이(전체 보기) 물으면 아무 담임도 「보결 난 반」으로 빠지지 않는다', () => {
    const r = substituteCandidates(day(), { trackName: null, startMin: 590, endMin: 630, absentId: null })
    expect(ids(r.A)).toEqual(['homeroom:1-2', 'homeroom:2-1'])
    expect(ids(substituteCandidates(day(), { trackName: '', startMin: 590, endMin: 630, absentId: null }).A)).toEqual(ids(r.A))
  })
  it('없는 반·빈 시각은 던지지 않고 빈 결과(1.2v 에서 더한 것)', () => {
    expect(substituteCandidates(day(), { trackName: '9-9', startMin: 540, endMin: 580, absentId: null }).A).toEqual([])
    expect(substituteCandidates(day(), { trackName: '1-1', startMin: 580, endMin: 540, absentId: null }).C).toEqual([])
  })
})
