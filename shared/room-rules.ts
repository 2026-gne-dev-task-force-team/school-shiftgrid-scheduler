/**
 * 특별실 칸 규칙 (설계 ① 6절). 서버·DB 없이 도는 순수 판정 — 브라우저 그림과 서버 판정이 같은 모듈을 쓴다.
 *   고정 층: 시간표 배치 + 주간 고정 사용. 있으면 칸 통째 잠금(정원 무관).
 *   변동 층: 예약. 선착순·승인 없음. 같은 방 같은 시각의 자리 번호 충돌은 DB 유일 제약이 최종으로 막고, 여기는 사전 판정과 자리 고르기.
 *   교시는 학년 기준으로 고르고(화면), 충돌은 시각(분)으로 본다(여기). 시각은 분 정수.
 *   취소는 본인과 교감·교무·관리자만. 지나간 날짜는 아무도 못 지운다(관리자도).
 * 운영 앱 rooms.ts 의 roomDay·reserve·취소·빈 방 찾기·timeLabels 에서 DB·HTTP 를 걷어 낸 것.
 */
import { seoulDay, toHHMM } from './clock.ts'

export interface Room { id: string; name: string; capacity: number; resourceKey: string | null; active: boolean; sort: number; note: string }
/** 동아리 등 주간 고정 사용. 요일 0=월 */
export interface RoomFixed { id: string; roomId: string; dayIndex: number; startMin: number; endMin: number; label: string }
/** 기간 차단. fromMin·toMin 중 하나라도 null 이면 종일 */
export interface RoomBlock { id: string; roomId: string; startDate: string; endDate: string; fromMin: number | null; toMin: number | null; reason: string }
/** 시간표 파일이 그 방(resourceKey)에 잡은 정규 배치 */
export interface ResourceCell { resourceKey: string; dayIndex: number; startMin: number; endMin: number; label: string }
export interface Reservation {
  id: string; roomId: string; date: string; startMin: number; endMin: number
  slotNo: number; trackName: string; userId: string; userName: string; note: string
}
/** 그날 수업 시각 한 칸(전 학년 합집합의 한 원소) */
export interface TimeSpan { startMin: number; endMin: number }

export interface CellFixed { label: string; source: 'timetable' | 'manual' }
export interface CellReservation { id: string; trackName: string; userName: string; userId: string; note: string; mine: boolean }
export interface Cell {
  dayIndex: number; date: string; startMin: number; endMin: number
  fixed: CellFixed[]; blocked: string | null; reservations: CellReservation[]
  capacity: number; free: number; past: boolean; schoolDay: boolean
}
export interface RoomDay { schoolDay: boolean; offReason?: string; cells: Cell[] }

/** 하루 판정에 필요한 입력. 쉬는 날이면 schoolDay=false 로 넘긴다(칸 없음) */
export interface RoomDayInput {
  room: Room
  date: string
  dayIndex: number
  schoolDay: boolean
  offReason?: string
  /** 그날 수업 시각 합집합 */
  times: TimeSpan[]
  resourceCells?: ResourceCell[]
  fixed?: RoomFixed[]
  blocks?: RoomBlock[]
  /** 그 방·그 날의 예약 행 */
  reservations?: Reservation[]
  /** 지금 보는 계정(mine 표시용) */
  me: string
  /** 오늘 "YYYY-MM-DD" (todayOf) */
  today: string
}

/** 지금(epoch ms)의 서울 날짜 */
export const todayOf = (nowMs: number): string => seoulDay(nowMs).date

const ov = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

const dateMs = (date: string) => Date.parse(date + 'T00:00:00Z')
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** 그 날짜가 속한 주의 월요일 (달력 날짜 계산이라 UTC 로 한다 — 시간대 영향 없음) */
export function mondayOf(date: string): string {
  const d = new Date(dateMs(date))
  return isoOf(dateMs(date) - ((d.getUTCDay() + 6) % 7) * 86400000)
}
export const addDays = (date: string, n: number): string => isoOf(dateMs(date) + n * 86400000)

/** 한 방의 한 날짜 칸들. 칸마다 고정·차단·예약·빈자리 (6-1) */
export function roomDay(inp: RoomDayInput): RoomDay {
  if (!inp.schoolDay) return { schoolDay: false, offReason: inp.offReason, cells: [] }
  const { room, date, dayIndex: di } = inp
  const ttFixed = room.resourceKey ? (inp.resourceCells ?? []).filter((c) => c.resourceKey === room.resourceKey && c.dayIndex === di) : []
  const manual = (inp.fixed ?? []).filter((f) => f.roomId === room.id && f.dayIndex === di)
  const blocks = (inp.blocks ?? []).filter((b) => b.roomId === room.id && b.startDate <= date && b.endDate >= date)
  const resv = (inp.reservations ?? []).filter((r) => r.roomId === room.id && r.date === date).sort((a, b) => a.slotNo - b.slotNo)
  const past = date < inp.today
  const cells: Cell[] = inp.times.map((t) => {
    const fixed: CellFixed[] = [
      ...ttFixed.filter((c) => ov(c.startMin, c.endMin, t.startMin, t.endMin)).map((c) => ({ label: c.label, source: 'timetable' as const })),
      ...manual.filter((c) => ov(c.startMin, c.endMin, t.startMin, t.endMin)).map((c) => ({ label: c.label, source: 'manual' as const })),
    ]
    const b = blocks.find((x) => x.fromMin == null || x.toMin == null || ov(x.fromMin, x.toMin, t.startMin, t.endMin))
    // 예약은 시작 시각이 칸과 같은 행만 (부분 겹침은 막지 않는다 — overlapWarnings)
    const reservations = resv.filter((x) => x.startMin === t.startMin)
      .map((x) => ({ id: x.id, trackName: x.trackName, userName: x.userName, userId: x.userId, note: x.note, mine: x.userId === inp.me }))
    const used = (fixed.length ? room.capacity : 0) + reservations.length   // 고정이 있으면 그 칸은 통째로 잠근다
    return {
      dayIndex: di, date, startMin: t.startMin, endMin: t.endMin, fixed, blocked: b ? (b.reason || '차단') : null, reservations,
      capacity: room.capacity, free: b ? 0 : Math.max(0, room.capacity - used), past, schoolDay: true,
    }
  })
  return { schoolDay: true, cells }
}

/** 주간표 경고용: 시작은 다르지만 시각이 겹치는 칸에 예약이 있는 경우 「겹치는 칸에 예약 n건」(막지 않는다) */
export function overlapWarnings(cells: Cell[]): { startMin: number; count: number }[] {
  const out: { startMin: number; count: number }[] = []
  for (const c of cells) {
    const n = cells.filter((o) => o !== c && ov(o.startMin, o.endMin, c.startMin, c.endMin)).reduce((s, o) => s + o.reservations.length, 0)
    if (n > 0) out.push({ startMin: c.startMin, count: n })
  }
  return out
}

export type ReserveRequest = { date: string; startMin: number; trackName: string; note?: string }
export type ReserveVerdict =
  | { ok: true; slotNo: number; endMin: number }
  | { ok: false; status: 400 | 404 | 409; error: string }

/** 예약 판정 순서 (6-2): 방 → 지난 날 → 쉬는 날 → 칸 시각 → 차단 → 고정 → 같은 반 → 빈 자리 번호(1부터) → 없으면 409.
 *  inp.room 이 null 이면(없는 방) 404. 자리 번호는 그 칸의 기존 예약이 쓴 번호를 뺀 가장 작은 수 */
export function decideReserve(inp: Omit<RoomDayInput, 'room' | 'date' | 'dayIndex'> & { room: Room | null; dayIndex: number }, req: ReserveRequest): ReserveVerdict {
  const fail = (status: 400 | 404 | 409, error: string): ReserveVerdict => ({ ok: false, status, error })
  const { room } = inp
  if (!room) return fail(404, '없는 방입니다')
  if (req.date < inp.today) return fail(400, '지나간 날짜는 예약할 수 없습니다')
  const day = roomDay({ ...inp, room, date: req.date })
  if (!day.schoolDay) return fail(400, '그날은 수업이 없습니다' + (day.offReason ? ' (' + day.offReason + ')' : ''))
  const cell = day.cells.find((c) => c.startMin === req.startMin)
  if (!cell) return fail(400, toHHMM(req.startMin) + ' 는 수업 시각이 아닙니다')
  if (cell.blocked) return fail(409, '그 시각은 막혀 있습니다 (' + cell.blocked + ')')
  if (cell.fixed.length) return fail(409, '고정 수업이 있는 칸입니다 (' + cell.fixed.map((f) => f.label).join(', ') + ')')
  if (cell.reservations.some((r) => r.trackName === req.trackName)) return fail(409, req.trackName + ' 은 이미 이 칸을 예약했습니다')
  const taken = new Set((inp.reservations ?? []).filter((r) => r.roomId === room.id && r.date === req.date && r.startMin === req.startMin).map((r) => r.slotNo))
  for (let slot = 1; slot <= room.capacity; slot++) if (!taken.has(slot)) return { ok: true, slotNo: slot, endMin: cell.endMin }
  return fail(409, '그 시각 ' + room.name + ' 은 자리가 없습니다')
}

export const MANAGER_ROLES = ['관리자', '교무', '교감'] as const
export type CancelVerdict = { ok: true } | { ok: false; status: 400 | 403 | 404; error: string }

/** 취소: 없는 예약 404 → 남의 것(관리자·교무·교감 제외) 403 → 지난 날 400(관리자 예외 없음) */
export function decideCancel(res: Pick<Reservation, 'userId' | 'date'> | null, user: { id: string; roles: string[] }, today: string): CancelVerdict {
  if (!res) return { ok: false, status: 404, error: '없는 예약입니다' }
  const manager = user.roles.some((k) => (MANAGER_ROLES as readonly string[]).includes(k))
  if (res.userId !== user.id && !manager) return { ok: false, status: 403, error: '남의 예약은 취소할 수 없습니다' }
  if (res.date < today) return { ok: false, status: 400, error: '지나간 예약은 취소할 수 없습니다' }
  return { ok: true }
}

/** 빈 방 찾기: 날짜·시작 시각 → 방마다 그 칸(그 시각 칸이 없는 방은 뺀다) */
export function freeRooms(rooms: Room[], date: string, startMin: number, mk: (room: Room) => Omit<RoomDayInput, 'room' | 'date'>): { schoolDay: boolean; offReason?: string; rooms: { room: Room; cell: Cell }[] } {
  const out: { room: Room; cell: Cell }[] = []
  let schoolDay = true, offReason: string | undefined
  for (const room of rooms) {
    const d = roomDay({ ...mk(room), room, date })
    schoolDay = d.schoolDay; offReason = d.offReason
    const cell = d.cells.find((c) => c.startMin === startMin)
    if (cell) out.push({ room, cell })
  }
  return { schoolDay, offReason, rooms: out }
}

/** 내 예약: 오늘(from) 이후 본인 행, 날짜·시각 순 */
export function myReservations(all: Reservation[], me: string, from: string): Reservation[] {
  return all.filter((r) => r.userId === me && r.date >= from).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
}

/** 고정 사용은 (방, 요일, 시작) 이 겹치면 안 된다 — 칸 PUT 때 같은 규칙. 겹치는 쌍의 id 를 돌려준다 */
export function fixedDuplicates(list: RoomFixed[]): [string, string][] {
  const seen = new Map<string, string>(), out: [string, string][] = []
  for (const f of list) {
    const k = `${f.roomId}|${f.dayIndex}|${f.startMin}`
    const prev = seen.get(k)
    if (prev) out.push([prev, f.id]); else seen.set(k, f.id)
  }
  return out
}

/** 시간 틀마다 그 시각이 몇 교시인지 (화면 줄 머리). specs 는 학년군 이름(정렬됨), labels 는 specs 순서, 없으면 '—' */
export function timeLabels(slots: Record<string, { label: string; startMin: number; endMin: number }[]>): { startMin: number; endMin: number; labels: string[] }[] {
  const specs = Object.keys(slots).sort()
  const by = new Map<number, { endMin: number; labels: Map<string, string> }>()
  for (const k of specs) for (const s of slots[k]) {
    if (!by.has(s.startMin)) by.set(s.startMin, { endMin: s.endMin, labels: new Map() })
    by.get(s.startMin)!.labels.set(k, s.label)
  }
  return [...by.entries()].sort(([a], [b]) => a - b).map(([startMin, x]) => ({ startMin, endMin: x.endMin, labels: specs.map((k) => x.labels.get(k) ?? '—') }))
}
