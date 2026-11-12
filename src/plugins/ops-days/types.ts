/**
 * 학사 꼴(1.2v 설계 ① 3·12절) — `calendar`(학사 일정) · `changes`(시간표 변경) 두 목록 칸. ⛔ 실명 금지(시험은 가짜 이름).
 */
export type DaysRole = '관리자' | '교감' | '교무' | '근태담당' | '교사';
export interface DaysViewer { userId: string; role: DaysRole }
/** kind `all` = 그날 학교가 쉼(휴업일) · `event` = 행사. */
export interface CalendarEvent { id: string; date: string; endDate: string; kind: 'all' | 'event'; title: string }
export interface TimetableChange { id: string; date: string; classKey: string; period: number; subject: string; note: string; createdBy: string }
export interface DaysPart { calendar: CalendarEvent[]; changes: TimetableChange[] }
