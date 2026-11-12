import { describe, expect, it } from 'vitest'
import { clockOfPeriod, clockOfSlot, dismissalMin, labelAt, lessonSlots, lunchSlot, overlaps, periodOfLabel, seoulDay, toHHMM, toMin, type ClockSlot } from './clock.ts'

const S = (label: string, a: string, b: string, extra: Partial<ClockSlot> = {}): ClockSlot =>
  ({ label, startMin: toMin(a), endMin: toMin(b), assignable: true, ...extra })
const slots: ClockSlot[] = [
  S('1교시', '09:00', '09:40'), S('2교시', '09:50', '10:30'), S('3교시', '10:40', '11:20'), S('4교시', '11:30', '12:10'),
  S('점심', '12:10', '13:00', { kind: 'lunch', assignable: false }), S('5교시', '13:00', '13:40'),
]

describe('toMin / toHHMM', () => {
  it('경계', () => {
    expect(toMin('00:00')).toBe(0)
    expect(toMin('23:59')).toBe(1439)
    expect(toMin(' 9:05 ')).toBe(545)
    expect(toHHMM(0)).toBe('00:00')
    expect(toHHMM(1439)).toBe('23:59')
    expect(toHHMM(toMin('12:20'))).toBe('12:20')
  })
  it('잘못된 문자열은 던진다', () => {
    for (const bad of ['', '9', '9:5', '24:00', '12:60', 'ab:cd', '12:00:00', '-1:00']) expect(() => toMin(bad)).toThrow('시각 형식')
  })
})

describe('교시·점심', () => {
  it('overlaps 는 반열림 — 끝=시작은 안 겹친다, 요일이 다르면 안 겹친다', () => {
    const r = (d: number, a: number, b: number) => ({ dayIndex: d, startMin: a, endMin: b })
    expect(overlaps(r(0, 0, 10), r(0, 10, 20))).toBe(false)
    expect(overlaps(r(0, 0, 11), r(0, 10, 20))).toBe(true)
    expect(overlaps(r(0, 0, 11), r(1, 10, 20))).toBe(false)
  })
  it('periodOfLabel', () => {
    expect(periodOfLabel('3교시')).toBe(3)
    expect(periodOfLabel('3')).toBe(3)
    expect(periodOfLabel('점심')).toBeNull()
  })
  it('lessonSlots 는 점심 제외, lessonsPerDay 는 앞에서 n개', () => {
    expect(lessonSlots(slots, 0).map((s) => s.label)).toEqual(['1교시', '2교시', '3교시', '4교시', '5교시'])
    expect(lessonSlots(slots, 2, [5, 5, 3]).map((s) => s.label)).toEqual(['1교시', '2교시', '3교시'])
  })
  it('lunchSlot 은 kind 우선, 없으면 라벨', () => {
    expect(lunchSlot(slots)?.label).toBe('점심')
    expect(lunchSlot([S('점심시간', '12:00', '13:00')])?.label).toBe('점심시간')
    expect(lunchSlot([S('1교시', '09:00', '09:40')])).toBeNull()
  })
  it('clockOfPeriod 는 점심이 끼어도 라벨로 찾고, 없는 교시는 null', () => {
    expect(clockOfPeriod(slots, 1, 5)).toEqual({ dayIndex: 1, startMin: toMin('13:00'), endMin: toMin('13:40') })
    expect(clockOfPeriod(slots, 1, 6)).toBeNull()
    expect(clockOfPeriod(slots, 1, 5, [5, 4])).toBeNull()
  })
  it('dismissalMin', () => {
    expect(dismissalMin(slots, 0, toMin('09:00'))).toBe(toMin('13:40'))
    expect(dismissalMin(slots, 0, toMin('09:00'), [3])).toBe(toMin('11:20'))
    expect(dismissalMin(slots, 0, toMin('09:00'), [0])).toBe(toMin('09:00'))
  })
  it('labelAt — 교시 · 점심 · 어디도 아님', () => {
    const at = (a: string, b: string) => labelAt(slots, { dayIndex: 0, startMin: toMin(a), endMin: toMin(b) })
    expect(at('11:35', '11:50')).toBe('4교시')
    expect(at('12:20', '12:40')).toBe('점심')
    expect(at('08:00', '08:50')).toBeNull()
    expect(clockOfSlot(slots[0], 3)).toEqual({ dayIndex: 3, startMin: 540, endMin: 580 })
  })
})

describe('seoulDay', () => {
  const t = (iso: string) => seoulDay(Date.parse(iso))
  it('서울 08:59 와 09:00 은 UTC 날짜 경계를 건너도 서울 날짜는 같다', () => {
    expect(t('2026-11-11T23:59:00Z')).toEqual({ date: '2026-11-12', dayIndex: 3 }) // 서울 08:59
    expect(t('2026-11-12T00:00:00Z')).toEqual({ date: '2026-11-12', dayIndex: 3 }) // 서울 09:00
  })
  it('서울 자정에서 날짜·요일이 넘어간다', () => {
    expect(t('2026-11-12T14:59:00Z')).toEqual({ date: '2026-11-12', dayIndex: 3 }) // 서울 23:59 목
    expect(t('2026-11-12T15:00:00Z')).toEqual({ date: '2026-11-13', dayIndex: 4 }) // 서울 00:00 금
    expect(t('2026-11-15T00:00:00Z').dayIndex).toBe(6) // 일
  })
})
