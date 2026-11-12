import { describe, expect, it } from 'vitest'
import { buildDayInput, type DayInputArgs } from './day-input'

const lesson = (startMin: number) => ({ startMin, endMin: startMin + 40, subject: null, coIds: [] as string[] })
const mk = (over: Partial<DayInputArgs> = {}): DayInputArgs => ({
  dayIndex: 1,
  base: {
    tracks: [
      { name: '1-1', grade: 1, lessons: [lesson(540), lesson(590)], lunch: { startMin: 700, endMin: 740 } },
      { name: '2-1', grade: 2, lessons: [lesson(540)], lunch: null },
    ],
    people: [{ id: 'homeroom:1-1', name: 'A', kind: '담임' }],
  },
  vps: [{ id: 'user:7', name: 'V' }],
  fixed: [], slots: [], calendar: [], changes: [], classSubjects: [],
  periodStart: (_t, p) => (p === 1 ? 540 : p === 2 ? 590 : null),
  aux: [],
  ...over,
})
const ok = (a: DayInputArgs) => {
  const r = buildDayInput(a)
  if (!r.ok) throw new Error('거부됨')
  return r
}

describe('buildDayInput', () => {
  it('① 교감이 사람에 든다', () => {
    expect(ok(mk()).input.people.find((p) => p.id === 'user:7')?.kind).toBe('교감')
  })
  it('② 그 요일 고정 일정만 busy', () => {
    const r = ok(mk({ fixed: [{ dayIndex: 1, personId: 'p', startMin: 1, endMin: 2 }, { dayIndex: 2, personId: 'q', startMin: 1, endMin: 2 }] }))
    expect(r.input.busy.map((b) => b.personId)).toEqual(['p'])
  })
  it('③ absent 와 확정만 taken', () => {
    const r = ok(mk({ slots: [
      { absentId: 'a', allDay: true, startMin: 540, endMin: 580, status: '확정', takerId: 't', trackName: '1-1' },
      { absentId: 'b', allDay: false, startMin: 590, endMin: 630, status: '대기', takerId: 'u', trackName: '1-1' },
    ] }))
    expect(r.input.absent).toEqual([{ personId: 'a', startMin: null, endMin: null }, { personId: 'b', startMin: 590, endMin: 630 }])
    expect(r.input.taken).toEqual([{ personId: 't', startMin: 540, endMin: 580, trackName: '1-1' }])
  })
  it('④ 학년 행사는 수업을 비우고 담임 종일 결근', () => {
    const r = ok(mk({ calendar: [{ kind: '행사', targetKind: 'grade', targetValue: '2' }] }))
    expect(r.input.tracks[1].lessons).toEqual([])
    expect(r.input.absent).toContainEqual({ personId: 'homeroom:2-1', startMin: null, endMin: null })
    expect(r.offTracks).toEqual(['2-1'])
  })
  it('④ 로 비운 수업에 ⑤⑥⑦ 이 안 붙는다', () => {
    const r = ok(mk({
      changes: [{ trackName: '1-1', period: null, activityName: '체험' }, { trackName: '1-1', period: 1, activityName: '미술' }],
      classSubjects: [{ trackName: '1-1', startMin: 540, subject: '국어' }],
      aux: [{ auxId: '3', name: 'X', slots: [{ trackName: '1-1', startMin: 540, endMin: 580, status: 'ok' }] }],
    }))
    expect(r.input.tracks[0].lessons).toEqual([])
    expect(r.input.tracks[0].lunch).toBeNull()
  })
  it('⑤ 과목은 빈 곳만, ⑥ 이 덮는다', () => {
    const r = ok(mk({
      classSubjects: [{ trackName: '1-1', startMin: 540, subject: '국어' }, { trackName: '1-1', startMin: 590, subject: '수학' }],
      changes: [{ trackName: '1-1', period: 2, activityName: '음악' }],
    }))
    expect(r.input.tracks[0].lessons.map((l) => l.subject)).toEqual(['국어', '음악'])
  })
  it('⑦ 보조 coIds 와 사람 추가', () => {
    const r = ok(mk({ aux: [{ auxId: '3', name: 'X', slots: [{ trackName: '1-1', startMin: 550, endMin: 560, status: 'ok' }, { trackName: '1-1', startMin: 590, endMin: 630, status: 'no' }] }] }))
    expect(r.input.tracks[0].lessons.map((l) => l.coIds)).toEqual([['aux:3'], []])
    expect(r.input.people.some((p) => p.id === 'aux:3' && p.kind === '보조')).toBe(true)
    expect(r.partial).toEqual([])
  })
  it('aux 입력이 없으면 partial', () => {
    const r = ok(mk({ aux: null }))
    expect(r.partial).toEqual(['aux'])
    expect(r.input.tracks[0].lessons[0].coIds).toEqual([])
  })
  it('학교 전체 쉼이면 거부', () => {
    const r = buildDayInput(mk({ calendar: [{ kind: '휴업일', targetKind: 'all', targetValue: '' }] }))
    expect(r).toEqual({ ok: false, reason: 'school-off', offReason: '휴업일' })
  })
  it('입력을 바꾸지 않는다', () => {
    const a = mk({ calendar: [{ kind: 'x', targetKind: 'track', targetValue: '1-1' }] })
    ok(a)
    expect(a.base.tracks[0].lessons).toHaveLength(2)
  })
})
