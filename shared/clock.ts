/**
 * 시각 변환 — 시각은 분 정수(startMin)로 다루고, 문자열 변환은 이 파일 한 곳에서만 한다.
 * 순수 함수만 있다(Deno·브라우저 공용 — Intl 외 환경 API 없음). 운영 앱 clock 과 같은 뜻을 따른다.
 */

/** 요일 0=월 … 4=금 과 분 단위 시각 범위. [startMin, endMin) */
export interface ClockRange { dayIndex: number; startMin: number; endMin: number }

/** 시간 틀 칸(분 정수 꼴). kind 가 없으면 수업으로 본다. */
export interface ClockSlot {
  label: string
  startMin: number
  endMin: number
  assignable?: boolean
  kind?: 'lesson' | 'lunch' | 'break'
}

export const DAY_NAMES = ['월', '화', '수', '목', '금'] as const

/** "HH:mm" → 분. 0~23시·0~59분 밖이면 던진다(운영 앱은 범위를 안 봤다 — 경계 입력에서 조용히 틀리지 않게 조인다). */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('시각 형식이 아닙니다: ' + hhmm)
  return Number(m[1]) * 60 + Number(m[2])
}

/** 분 → "HH:mm" */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

/** 두 범위가 같은 요일에 시간이 포개지나 */
export function overlaps(a: ClockRange, b: ClockRange): boolean {
  return a.dayIndex === b.dayIndex && a.startMin < b.endMin && b.startMin < a.endMin
}

/** 슬롯 라벨 "N교시"·"N" 에서 N. 교시가 아니면 null */
export function periodOfLabel(label: string): number | null {
  const m = /^(\d+)(교시)?$/.exec(label.trim())
  return m ? Number(m[1]) : null
}

/** 그 요일 수업 칸들. 점심·쉬는 칸은 빼고, lessonsPerDay 가 있으면 앞에서부터 그 수만큼만. */
export function lessonSlots(slots: ClockSlot[], dayIndex: number, lessonsPerDay?: number[]): ClockSlot[] {
  const lessons = slots.filter((s) => s.assignable && (s.kind ?? 'lesson') === 'lesson')
  const n = lessonsPerDay?.[dayIndex]
  return n == null ? lessons : lessons.slice(0, n)
}

/** 점심 칸. 없으면 null */
export function lunchSlot(slots: ClockSlot[]): ClockSlot | null {
  return slots.find((s) => s.kind === 'lunch') ?? slots.find((s) => s.label.includes('점심')) ?? null
}

/** 슬롯 하나의 시각 범위 */
export function clockOfSlot(slot: ClockSlot, dayIndex: number): ClockRange {
  return { dayIndex, startMin: slot.startMin, endMin: slot.endMin }
}

/** 그 요일 N교시의 시각 범위. 그날 그 교시가 없으면(하교 뒤) null. 교시는 슬롯 index 가 아니라 라벨로 찾는다(점심이 끼어 학년마다 다르다). */
export function clockOfPeriod(slots: ClockSlot[], dayIndex: number, period: number, lessonsPerDay?: number[]): ClockRange | null {
  const s = lessonSlots(slots, dayIndex, lessonsPerDay).find((x) => periodOfLabel(x.label) === period)
  return s ? clockOfSlot(s, dayIndex) : null
}

/** 그 요일 마지막 수업이 끝나는 분(하교). 수업이 없으면 dayStartMin. */
export function dismissalMin(slots: ClockSlot[], dayIndex: number, dayStartMin: number, lessonsPerDay?: number[]): number {
  const ls = lessonSlots(slots, dayIndex, lessonsPerDay)
  return ls.length === 0 ? dayStartMin : Math.max(...ls.map((s) => s.endMin))
}

/** 시각 범위가 몇 교시인가(화면 표시용). 수업 칸과 겹치면 그 라벨, 점심이면 점심 라벨, 아니면 null */
export function labelAt(slots: ClockSlot[], range: ClockRange, lessonsPerDay?: number[]): string | null {
  for (const s of lessonSlots(slots, range.dayIndex, lessonsPerDay)) if (overlaps(clockOfSlot(s, range.dayIndex), range)) return s.label
  const l = lunchSlot(slots)
  return l && overlaps(clockOfSlot(l, range.dayIndex), range) ? l.label : null
}

const seoulFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })

/** 시각(epoch ms)의 서울 날짜 "YYYY-MM-DD"와 요일(0=월 … 6=일). 서울은 UTC+9 고정(서머타임 없음). */
export function seoulDay(epochMs: number): { date: string; dayIndex: number } {
  const p = Object.fromEntries(seoulFmt.formatToParts(epochMs).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, dayIndex: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) }
}
