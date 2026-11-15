/**
 * 근태 꼴(1.2v 설계 ① 7절) — `aux` 칸 중 staff·conditions·base·day 묶음. exceptions·monthClose 는 P23 몫.
 * ⛔ 실명 금지(시험은 `강사01` 꼴). 시각은 분 정수(startMin).
 */
export type AuxRole = '관리자' | '교감' | '교무' | '근태담당' | '교사';
export interface AuxViewer { userId: string; role: AuxRole }
export type AuxKind = '기초학력' | '한국어' | '디지털튜터' | '자원봉사' | '기타';
export interface AuxStaff { id: string; name: string; kind: AuxKind; unit: 'clock' | 'period'; active: boolean; allowedActivities: string[]; targetTracks: string[] }
/** 요일(0=월~4=금)별 근무 — 시각 단위면 시작·종료 분, 교시 단위면 교시 수. id = `${staffId}:${dow}`. */
export interface AuxCondition { id: string; staffId: string; dow: number; workStartMin: number | null; workEndMin: number | null; periods: number | null }
/** 기본 배정 (보조, 요일, 시작). id = `${staffId}:${dow}:${startMin}`. */
export interface AuxBase { id: string; staffId: string; dow: number; startMin: number; endMin: number; classKey: string }
/** 날짜별 배정 (보조, 날짜, 시작). `classKey` 비면 「지원 불가」. */
export interface AuxDay { id: string; staffId: string; date: string; startMin: number; endMin: number; classKey: string; source: 'reassign' | 'manual' | 'none' }
export interface AuxPart { staff: AuxStaff[]; conditions: AuxCondition[]; base: AuxBase[]; day: AuxDay[] }
