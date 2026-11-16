import { describe, expect, it } from 'vitest'
import { can, canWrite, PERMISSIONS, ROLES, rolesOf, type Action, type Role } from './roles.ts'

/** 동작마다 허용 역할 — R112 직전 코드에서 그대로 옮긴 기대값(표를 고치면 여기도 고친다). */
const EXPECT: Record<Action, Role[]> = {
  'room.manage': ['관리자', '교감', '교무'],
  'room.seeDetail': ['관리자', '교감', '교무'],
  'room.cancelAny': ['관리자', '교감', '교무'],
  'sub.manage': ['관리자', '교감', '교무', '보결관리자'],
  'sub.seeAudit': ['관리자', '교감', '교무', '보결관리자'],
  'sub.cancelAny': ['관리자', '교감', '교무', '보결관리자'],
  'sub.assign': ['관리자', '교감', '교무'],
  'sub.force': ['관리자', '보결관리자'],
  'sub.past': ['관리자'],
  'days.calendar': ['관리자', '교감', '교무', '근태담당'],
  'days.changesAny': ['관리자', '교감', '교무', '근태담당'],
  'days.classSubjects': ['관리자', '교감', '교무'],
  'aux.edit': ['근태담당'],
  'aux.reopenMonth': ['관리자'],
}

describe('권한표 shared/roles.ts', () => {
  it('표의 동작과 기대값의 동작이 같다', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(EXPECT).sort())
  })
  for (const [action, allowed] of Object.entries(EXPECT) as [Action, Role[]][]) {
    it(`${action}: 허용 ${allowed.join('·')} · 그 밖은 거부`, () => {
      for (const r of ROLES) expect([r, can([r], action)]).toEqual([r, allowed.includes(r)])
    })
  }
  it('역할 없음은 늘 거부', () => {
    for (const a of Object.keys(EXPECT) as Action[]) expect(can([], a)).toBe(false)
  })
  it('두 역할(교사+교무) 계정은 하나라도 맞으면 통과 — 담임 과목 반영 가능', () => {
    expect(can(['교사', '교무'], 'days.classSubjects')).toBe(true)
    expect(can(['교사', '근태담당'], 'days.classSubjects')).toBe(false)
    expect(can(['교무', '근태담당'], 'aux.edit')).toBe(true)
  })
  it('옛 role 하나짜리 입력은 [role] 로 감싼다 · roles 와 합친다', () => {
    expect(rolesOf({ role: '교무' })).toEqual(['교무'])
    expect(rolesOf({ roles: ['교사'], role: '교무' })).toEqual(['교사', '교무'])
    expect(rolesOf({ roles: ['교무'], role: '교무' })).toEqual(['교무'])
    expect(rolesOf({})).toEqual([])
  })
  it('칸별 쓰기 역할 — 표에 없는 칸은 관리자도 거부', () => {
    expect(canWrite(['근태담당'], 'days', 'calendar')).toBe(true)
    expect(canWrite(['교사'], 'days', 'calendar')).toBe(false)
    expect(canWrite(['관리자'], 'aux', 'day')).toBe(false)
    expect(canWrite(['교감'], 'rooms', 'blocks')).toBe(true)
    expect(canWrite(['관리자'], 'rooms', 'nope')).toBe(false)
  })
})
