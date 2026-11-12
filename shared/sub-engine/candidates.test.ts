import { describe, expect, it } from 'vitest'
import { substituteCandidates } from './candidates'
import { sample } from './sample'

describe('substituteCandidates', () => {
  it('전담 결근: 그 반 담임이 A 맨 앞(own), 전담은 C, 비교과는 D', () => {
    const r = substituteCandidates(sample(), { trackName: '1-1', startMin: 540, endMin: 580, absentId: 'S1' })
    expect(r.A.map((c) => c.id)).toEqual(['homeroom:1-1'])
    expect(r.A[0].reason).toBe('own')
    expect(r.C.map((c) => c.id)).toEqual(['S2'])
    expect(r.D.map((c) => c.id)).toEqual(['N1'])
    expect(r.excluded.map((e) => e.code).sort()).toEqual(['aux', 'homeroom-with-aux', 'self', 'vp'])
  })
  it('결근자를 모르거나 담임 본인이면 그 반 담임은 제외', () => {
    const r = substituteCandidates(sample(), { trackName: '1-1', startMin: 590, endMin: 630, absentId: 'homeroom:1-1' })
    expect(r.excluded.find((e) => e.id === 'homeroom:1-1')?.code).toBe('self')
    expect(substituteCandidates(sample(), { trackName: '1-1', startMin: 590, endMin: 630, absentId: null }).excluded.some((e) => e.code === 'own-homeroom-absent')).toBe(true)
  })
  it('자기 반 수업이 없는 담임은 B 하교 후 · 전담만 든 칸의 담임은 A 담임 공강', () => {
    const r = substituteCandidates(sample(), { trackName: '1-1', startMin: 600, endMin: 620, absentId: 'homeroom:1-1' })
    // 3-1 은 그 시각 S2 전담 수업 → 담임 공강 A
    expect(r.A.map((c) => c.id)).toEqual(['homeroom:3-1'])
    const late = substituteCandidates(sample(), { trackName: '1-1', startMin: 640, endMin: 660, absentId: 'homeroom:1-1' })
    expect(late.B.map((c) => c.id)).toEqual(['homeroom:3-1'])
  })
  it('보조만 든 칸의 담임은 제외 · 급식지도 중 학년 담임은 조용히 빠진다', () => {
    const r = substituteCandidates(sample(), { trackName: '1-1', startMin: 540, endMin: 580, absentId: 'S1' })
    expect(r.A.some((c) => c.id === 'homeroom:3-1')).toBe(false)
    const lunch = substituteCandidates(sample(), { trackName: '3-1', startMin: 735, endMin: 770, absentId: 'S2' })
    expect(lunch.A.concat(lunch.B).some((c) => c.id === 'homeroom:1-1')).toBe(false)
    expect(lunch.excluded.some((e) => e.id === 'homeroom:1-1')).toBe(false)
  })
  it('금지칸·종일 복무는 제외, 같은 시각 맡은 보결은 busyWith 로 표시', () => {
    const inp = sample()
    inp.busy.push({ personId: 'N1', startMin: 500, endMin: 600, reason: '회의' })
    inp.absent.push({ personId: 'homeroom:1-1', startMin: null, endMin: null })
    inp.taken.push({ personId: 'S2', startMin: 540, endMin: 580, trackName: '2-1' })
    const r = substituteCandidates(inp, { trackName: '3-1', startMin: 540, endMin: 580, absentId: 'homeroom:3-1' })
    expect(r.excluded.find((e) => e.id === 'N1')).toMatchObject({ code: 'busy', detail: '회의' })
    expect(r.excluded.find((e) => e.id === 'homeroom:1-1')?.code).toBe('away')
    expect(r.C.find((c) => c.id === 'S2')?.busyWith).toBe('2-1')
  })
  it('없는 반·빈 시각은 던지지 않고 빈 결과', () => {
    expect(substituteCandidates(sample(), { trackName: '9-9', startMin: 540, endMin: 580, absentId: null }).A).toEqual([])
    expect(substituteCandidates(sample(), { trackName: '1-1', startMin: 580, endMin: 540, absentId: null }).C).toEqual([])
  })
})
