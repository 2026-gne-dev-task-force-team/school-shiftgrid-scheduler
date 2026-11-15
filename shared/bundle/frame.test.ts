import { describe, expect, it } from 'vitest'
import { TimeFrame } from '../import/frame.ts'
import { frameInputFromBundle } from './frame.ts'
import { getBundle, loadBundle, setBundle, subscribeBundle } from './store.ts'
import type { Bundle } from './types.ts'

export const sampleBundle = (): Bundle => ({
  bundleVersion: 1,
  versions: {},
  parts: {
    doc: {
      specs: [{ id: 'sp1', slots: [
        { index: 0, label: '1교시', start: '08:50', end: '09:30' },
        { index: 1, label: '2교시', start: '09:40', end: '10:20' },
        { index: 2, label: '점심', start: '12:00', end: '12:50', assignable: false, kind: 'lunch' },
      ], lessonsPerDay: [2, 2, 2, 2, 2] }],
      tracks: [{ id: 't1', name: '7-1', grade: 7, specId: 'sp1' }],
      timetables: [{ id: 'tt', specId: 'sp1', startDate: '2026-03-01', priority: 1 }],
      assignments: [{ timetableId: 'tt', trackId: 't1', dayIndex: 0, slotIndex: 0, activityId: 'a1', agentId: 'ag' }],
      activities: [{ id: 'a1', name: '과학' }],
    },
  },
})

describe('frameInputFromBundle', () => {
  it('번들 값으로 시간 틀이 나온다', () => {
    const f = new TimeFrame(frameInputFromBundle(sampleBundle())!)
    expect(f.periodOfTrack('7-1', 2)).toEqual({ start: '09:40', end: '10:20' })
    expect(f.lunchOf('7-1')).toBe('12:00')
    expect(f.lessonsOf('7-1', 0)[0]).toMatchObject({ subject: '과학', specialist: true })
  })
  it('번들 없음·시간표 없음이면 null', () => {
    expect(frameInputFromBundle(null)).toBeNull()
    expect(frameInputFromBundle({ bundleVersion: 1, parts: {}, versions: {} })).toBeNull()
  })
})

describe('store', () => {
  it('loadBundle 은 덩어리만 들이고 구독자에게 알린다', () => {
    let n = 0
    const off = subscribeBundle(() => { n++ })
    expect(loadBundle('{').ok).toBe(false)
    expect(getBundle()).toBeNull()
    expect(loadBundle(sampleBundle()).ok).toBe(true)
    expect(n).toBe(1)
    setBundle(null)
    off()
  })
})
