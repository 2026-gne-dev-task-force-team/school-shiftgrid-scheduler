/**
 * 권한표 한 장(R112) — 「동작 → 역할 목록」. 역할 판정은 전부 `can(roles, action)` 하나로 한다.
 *   · 한 사람이 역할을 여럿 가진다(`roles[]`, 예: 교사 겸 교무). 하나라도 표에 있으면 통과.
 *   · 관리자는 늘 통과 — 단 `ADMIN_EXCLUDED` 에 적은 동작은 빼고(지금 동작 보존, 아래 주석).
 *   · 「본인이면 된다」(내 예약 취소·내가 넣은 변경 지우기 등)는 표가 아니라 각 기능에 남는다.
 *   · 역할을 하나로 몰지 않는다 — 기능마다 다르다(특별실 관리 3역할 · 보결 관리 4역할 · 근태 마감 해제 관리자만).
 * 서버·DB 없이 도는 순수 모듈 — 화면 가림과 저장 판정이 같은 표를 쓴다.
 */

export const ROLES = ['관리자', '교감', '교무', '보결관리자', '근태담당', '교사'] as const
export type Role = (typeof ROLES)[number]

/** 동작 → 그 동작을 할 수 있는 역할(관리자는 따로 늘 통과). 값은 운영 앱·지금 코드에서 그대로 옮겼다. */
export const PERMISSIONS = {
  /** 특별실: 방 관리 화면 · `rooms` 칸(방·고정·차단) 쓰기 */
  'room.manage': ['교감', '교무'],
  /** 특별실: 예약의 누른 계정 id·메모 보기 */
  'room.seeDetail': ['교감', '교무'],
  /** 특별실: 남의 예약 취소 */
  'room.cancelAny': ['교감', '교무'],
  /** 보결: 관리 화면 · 삭제 · 확정 되돌리기 */
  'sub.manage': ['교감', '교무', '보결관리자'],
  /** 보결: 감사 칸(올린 계정·누른 계정) 보기 */
  'sub.seeAudit': ['교감', '교무', '보결관리자'],
  /** 보결: 남이 맡은 보결 맡기 취소 */
  'sub.cancelAny': ['교감', '교무', '보결관리자'],
  /** 보결: 지정 */
  'sub.assign': ['교감', '교무'],
  /** 보결: 강제 지정 */
  'sub.force': ['보결관리자'],
  /** 보결: 지난 날 삭제·되돌리기·맡기 취소 — 관리자만 */
  'sub.past': [],
  /** 학사: `calendar` 칸 쓰기 */
  'days.calendar': ['교감', '교무', '근태담당'],
  /** 학사: `changes` 칸 아무 줄이나 고치기·지우기(교사는 본인 줄 넣기·지우기만 — 기능 쪽 규칙) */
  'days.changesAny': ['교감', '교무', '근태담당'],
  /** 학사: 담임 과목 불러오기 「반영」(`classSubjects` 저장) — 운영 앱 class-import = 교무·교감 + 관리자 */
  'days.classSubjects': ['교감', '교무'],
  /** 근태: `aux` 칸 쓰기 */
  'aux.edit': ['근태담당'],
  /** 근태: 월 마감 해제 — 관리자만 */
  'aux.reopenMonth': [],
} as const satisfies Record<string, readonly Role[]>
export type Action = keyof typeof PERMISSIONS

/**
 * 관리자 통과에서 뺀 동작. 근태 칸은 지금 「근태담당만」이고 관리자는 마감 해제만 한다
 * (시험 `ops-aux/month/month.test.ts` 「관리자는 해제 말고는 못 고친다」) — 그 동작을 그대로 지킨다.
 */
export const ADMIN_EXCLUDED: ReadonlySet<Action> = new Set<Action>(['aux.edit'])

/** 이 역할들 중 하나라도 이 동작을 할 수 있나. */
export function can(roles: readonly Role[], action: Action): boolean {
  if (roles.includes('관리자') && !ADMIN_EXCLUDED.has(action)) return true
  const allowed: readonly Role[] = PERMISSIONS[action]
  return roles.some((r) => allowed.includes(r))
}

/** 칸별 쓰기 역할 — 칸 이름(꾸러미 → 목록) → 동작. 목록에 없는 칸은 아무도 못 쓴다(관리자 포함, 표에 먼저 적는다). */
export const LIST_WRITE = {
  rooms: { rooms: 'room.manage', fixed: 'room.manage', blocks: 'room.manage' },
  days: { calendar: 'days.calendar', changes: 'days.changesAny', classSubjects: 'days.classSubjects' },
  aux: { staff: 'aux.edit', conditions: 'aux.edit', base: 'aux.edit', day: 'aux.edit', exceptions: 'aux.edit', monthClose: 'aux.edit' },
} as const satisfies Record<string, Record<string, Action>>
export type WritePart = keyof typeof LIST_WRITE

export function canWrite(roles: readonly Role[], part: WritePart, list: string): boolean {
  const action = (LIST_WRITE[part] as Record<string, Action>)[list]
  return action !== undefined && can(roles, action)
}

/**
 * 보는 사람 — 네 꾸러미(특별실·보결·학사·근태)가 함께 쓰는 꼴 하나.
 *   `loggedIn`·`projectId` 가 없으면 로그인 안 함·프로젝트 없음으로 본다(특별실·보결의 줄 공개 판정).
 *   학사·근태는 로그인 뒤에만 뜨는 화면이라 둘을 보지 않는다.
 *   역할은 `roles[]`. 옛 저장 자료·옛 호출의 `role` 하나짜리도 받는다 — `rolesOf` 가 `[role]` 로 감싼다.
 */
export interface Viewer {
  loggedIn?: boolean
  projectId?: string
  userId: string | null
  /** 계정에 이어진 교사 ref(보결 맡기·맡은 이 본인 판정). 없으면 null·생략. */
  personRef?: string | null
  /** 보는 사람 이름(있으면) — 올린 이·맡은 이 이름칸에 쓴다. */
  name?: string
  roles?: readonly Role[]
  /** 옛 꼴(역할 하나). 새 코드는 `roles` 를 쓴다. */
  role?: Role
}

/** 보는 사람의 역할 목록 — `roles` 와 옛 `role` 을 합친다. */
export function rolesOf(v: Pick<Viewer, 'roles' | 'role'>): readonly Role[] {
  if (!v.role) return v.roles ?? []
  return v.roles?.includes(v.role) ? v.roles : [...(v.roles ?? []), v.role]
}

/** 보는 사람이 이 동작을 할 수 있나 — `can(rolesOf(v), action)`. */
export const viewerCan = (v: Pick<Viewer, 'roles' | 'role'>, action: Action): boolean => can(rolesOf(v), action)
