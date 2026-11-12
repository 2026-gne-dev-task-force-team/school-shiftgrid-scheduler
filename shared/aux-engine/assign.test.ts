import { describe, expect, it } from 'vitest'
import { toMin } from '../clock.ts'
import { checkAssignment, cmpTrack, isAllowedSubject, recommend, type AuxProfile, type DayLesson, type Occupied } from './assign.ts'

const L = (trackName: string, grade: number, a: string, b: string, subject: string | null = '국어', extra: Partial<DayLesson> = {}): DayLesson =>
  ({ trackName, grade, label: '1교시', startMin: toMin(a), endMin: toMin(b), subject, available: true, ...extra })
const aux = (extra: Partial<AuxProfile> = {}): AuxProfile =>
  ({ id: 'a1', name: '보조1', unit: 'period', allowedActivities: [], targetTracks: [], ...extra })
const R = { startMin: toMin('09:00'), endMin: toMin('09:40') }
const lessons = [L('1-1', 1, '09:00', '09:40'), L('1-2', 1, '09:00', '09:40'), L('3-1', 3, '09:00', '09:40'), L('1-10', 1, '09:00', '09:40')]

describe('checkAssignment', () => {
  it('정상 배정', () => {
    expect(checkAssignment({ lessons, aux: aux(), trackName: '1-1', ...R, occupied: [] }).ok).toBe(true)
  })
  it('수업 없음 · 그날 없음 · 허용 교과 밖', () => {
    expect(checkAssignment({ lessons, aux: aux(), trackName: '9-9', ...R, occupied: [] }).ok).toBe(false)
    const off = [L('1-1', 1, '09:00', '09:40', '국어', { available: false, unavailableReason: '체험학습' })]
    expect(checkAssignment({ lessons: off, aux: aux(), trackName: '1-1', ...R, occupied: [] }).reason).toBe('체험학습')
    expect(checkAssignment({ lessons, aux: aux({ allowedActivities: ['수학'] }), trackName: '1-1', ...R, occupied: [] }).reason).toContain('허용 교과')
    expect(isAllowedSubject(aux({ allowedActivities: ['수학'] }), null)).toBe(false)
  })
  it('시각 단위 근무 경계: 딱 맞으면 통과, 1분 벗어나면 실패, 근무일 아님', () => {
    const base = { lessons, trackName: '1-1', ...R, occupied: [] as Occupied[] }
    const fit = aux({ unit: 'clock', workStartMin: R.startMin, workEndMin: R.endMin })
    expect(checkAssignment({ ...base, aux: fit }).ok).toBe(true)
    expect(checkAssignment({ ...base, aux: { ...fit, workEndMin: R.endMin - 1 } }).reason).toBe('근무 시간대 밖')
    expect(checkAssignment({ ...base, aux: aux({ unit: 'clock' }) }).reason).toBe('그 요일은 근무일이 아님')
  })
  it('다른 보조가 겹치면 실패, 맞닿기만 하면 통과, 본인 점유는 무시', () => {
    const occ = (id: string, a: string, b: string): Occupied => ({ auxId: id, auxName: '남', trackName: '1-1', startMin: toMin(a), endMin: toMin(b) })
    const run = (o: Occupied) => checkAssignment({ lessons, aux: aux(), trackName: '1-1', ...R, occupied: [o] }).ok
    expect(run(occ('a2', '09:30', '10:00'))).toBe(false)
    expect(run(occ('a2', '09:40', '10:00'))).toBe(true)
    expect(run(occ('a1', '09:00', '09:40'))).toBe(true)
  })
})

describe('recommend', () => {
  it('빈 입력이면 빈 배열', () => {
    expect(recommend({ lessons: [], aux: aux(), ...R, occupied: [] })).toEqual([])
  })
  it('점수순: 대상 4 > 같은 학년 2 > 앞뒤 1, 동점은 학년·반 숫자순', () => {
    const out = recommend({ lessons, aux: aux({ targetTracks: ['3-1'] }), ...R, occupied: [], originalTrack: '1-1', adjacentTracks: ['1-10'] })
    expect(out.map((c) => c.trackName)).toEqual(['3-1', '1-10', '1-1', '1-2'])
    expect(out.map((c) => c.score)).toEqual([4, 3, 2, 2])
    expect(out[1].reasons).toEqual(['같은 학년', '앞뒤 시각과 같은 반'])
  })
  it('못 가는 반은 빠진다', () => {
    const occupied: Occupied[] = [{ auxId: 'a2', auxName: '남', trackName: '1-1', startMin: R.startMin, endMin: R.endMin }]
    expect(recommend({ lessons, aux: aux(), ...R, occupied }).map((c) => c.trackName)).not.toContain('1-1')
  })
})

describe('cmpTrack', () => {
  it('1-10 이 1-2 앞에 오지 않는다', () => {
    expect(['1-10', '1-2', '10-1'].sort(cmpTrack)).toEqual(['1-2', '1-10', '10-1'])
  })
})
