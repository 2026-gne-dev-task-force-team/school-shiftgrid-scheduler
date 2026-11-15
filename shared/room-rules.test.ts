import { describe, expect, it } from 'vitest'
import { toMin } from './clock.ts'
import {
  addDays, decideCancel, decideReserve, fixedDuplicates, freeRooms, mondayOf, myReservations, overlapWarnings, roomDay, timeLabels, todayOf,
  type Reservation, type Room, type RoomBlock, type RoomDayInput, type RoomFixed,
} from './room-rules.ts'

// 운영 앱 rooms.test.ts 의 시나리오를 순수 함수로 옮긴 것. 마법약실 정원 1, 운동장 정원 2.
// 월 09:00 마법약실은 고정 사용 '5-3 마법약'. 2026-10-26(월) 기준.
const MON = '2026-10-26', TODAY = '2026-10-20'
const t = (a: string, b: string) => ({ startMin: toMin(a), endMin: toMin(b) })
const TIMES = [t('09:00', '09:40'), t('09:50', '10:30'), t('10:40', '11:20'), t('11:30', '12:10'), t('12:20', '13:00'), t('13:10', '13:50')]
const science: Room = { id: 'r1', name: '마법약실', capacity: 1, resourceKey: null, active: true, sort: 0, note: '' }
const field: Room = { id: 'r2', name: '운동장', capacity: 2, resourceKey: null, active: true, sort: 1, note: '' }
const fixedRows: RoomFixed[] = [{ id: 'f1', roomId: 'r1', dayIndex: 0, startMin: toMin('09:00'), endMin: toMin('09:40'), label: '5-3 마법약(교사05)' }]

let seq = 0
const R = (room: Room, startMin: number, slotNo: number, trackName: string, userId: string, date = MON): Reservation =>
  ({ id: 'x' + ++seq, roomId: room.id, date, startMin, endMin: startMin + 40, slotNo, trackName, userId, userName: userId + '교사', note: '' })
const base = (room: Room, extra: Partial<RoomDayInput> = {}): RoomDayInput =>
  ({ room, date: MON, dayIndex: 0, schoolDay: true, times: TIMES, fixed: fixedRows, me: 'gamja', today: TODAY, ...extra })
const at = (s: string) => toMin(s)
const reserve = (room: Room, date: string, start: string, track: string, reservations: Reservation[] = [], extra: Partial<RoomDayInput> = {}) =>
  decideReserve({ ...base(room, extra), reservations }, { date, startMin: at(start), trackName: track })

describe('칸 만들기', () => {
  it('고정 칸은 잠기고 free 0, 옆 칸은 비어 있다', () => {
    const d = roomDay(base(science))
    const c9 = d.cells.find((c) => c.startMin === at('09:00'))!
    expect(c9.fixed[0]).toMatchObject({ label: '5-3 마법약(교사05)', source: 'manual' })
    expect(c9.free).toBe(0)
    expect(d.cells.find((c) => c.startMin === at('09:50'))!.free).toBe(1)
    expect(d.cells.length).toBeGreaterThan(5)
  })
  it('시간표 배치(resourceKey)도 고정이고, 분 단위로 겹치면 잠근다 · 정원 큰 방도 통째 잠금', () => {
    const room = { ...field, resourceKey: 'k' }
    const d = roomDay(base(room, { fixed: [], resourceCells: [{ resourceKey: 'k', dayIndex: 0, startMin: at('09:30'), endMin: at('09:55'), label: '정규' }, { resourceKey: 'k', dayIndex: 1, startMin: at('10:40'), endMin: at('11:20'), label: '화요일' }, { resourceKey: 'z', dayIndex: 0, startMin: at('10:40'), endMin: at('11:20'), label: '남의 방' }] }))
    expect(d.cells.map((c) => c.fixed.map((f) => f.source))).toEqual([['timetable'], ['timetable'], [], [], [], []])
    expect(d.cells[0].free).toBe(0)
    expect(d.cells[2].free).toBe(2)
  })
  it('쉬는 날은 칸 없음', () => {
    expect(roomDay(base(science, { schoolDay: false, offReason: '공휴일' }))).toEqual({ schoolDay: false, offReason: '공휴일', cells: [] })
  })
  it('차단: 시각 겹침만 free 0, 시각 없으면 종일, 기간 밖은 무관', () => {
    const blk = (extra: Partial<RoomBlock>): RoomBlock => ({ id: 'b', roomId: 'r1', startDate: MON, endDate: MON, fromMin: at('13:10'), toMin: at('14:40'), reason: '방과후', ...extra })
    const c = (b: RoomBlock) => roomDay(base(science, { blocks: [b] })).cells
    expect(c(blk({})).map((x) => x.blocked)).toEqual([null, null, null, null, null, '방과후'])
    expect(c(blk({ fromMin: null, toMin: null, reason: '' })).every((x) => x.blocked === '차단' && x.free === 0)).toBe(true)
    expect(c(blk({ startDate: '2026-10-27', endDate: '2026-10-28' })).every((x) => x.blocked === null)).toBe(true)
  })
  it('시작이 같은 예약만 그 칸에 들어간다 · 부분 겹침은 막지 않고 경고만', () => {
    const late = { ...TIMES[1], startMin: at('09:50') }
    const times = [t('09:40', '10:20'), late]   // 09:40 칸과 09:50 칸이 겹친다
    const d = roomDay(base(science, { fixed: [], times, reservations: [R(science, at('09:40'), 1, '1-1', 'a')] }))
    expect(d.cells.map((c) => c.free)).toEqual([0, 1])
    expect(overlapWarnings(d.cells)).toEqual([{ startMin: at('09:50'), count: 1 }])
    expect(reserve(science, MON, '09:50', '3-1', [R(science, at('09:40'), 1, '1-1', 'a')], { fixed: [], times }).ok).toBe(true)
  })
  it('mine 표시와 자리 번호 순서', () => {
    const d = roomDay(base(field, { reservations: [R(field, at('09:50'), 2, '4-2', 'goguma'), R(field, at('09:50'), 1, '3-1', 'gamja')] }))
    const c = d.cells.find((x) => x.startMin === at('09:50'))!
    expect(c.reservations.map((r) => [r.trackName, r.mine])).toEqual([['3-1', true], ['4-2', false]])
    expect(c.free).toBe(0)
  })
})

describe('예약 판정', () => {
  it('고정 칸·수업 아닌 시각·지난 날짜·쉬는 날·없는 방은 거절', () => {
    const fx = reserve(science, MON, '09:00', '3-1')
    expect(fx).toMatchObject({ ok: false, status: 409 })
    expect(!fx.ok && fx.error).toContain('고정 수업이 있는 칸')
    expect(reserve(science, MON, '08:00', '3-1')).toMatchObject({ ok: false, status: 400 })
    expect(reserve(science, '2026-09-07', '09:50', '3-1')).toMatchObject({ ok: false, status: 400 })
    const off = reserve(science, '2026-10-27', '09:50', '3-1', [], { schoolDay: false, offReason: '공휴일' })
    expect(off).toMatchObject({ ok: false, status: 400 })
    expect(!off.ok && off.error).toContain('공휴일')
    expect(decideReserve({ ...base(science), room: null }, { date: MON, startMin: at('09:50'), trackName: '3-1' })).toMatchObject({ ok: false, status: 404 })
  })
  it('선착순: 첫 예약은 자리 1, 둘째는 자리 없음, 같은 반 중복도 409', () => {
    const a = reserve(science, MON, '09:50', '3-1')
    expect(a).toMatchObject({ ok: true, slotNo: 1, endMin: at('10:30') })
    const held = [R(science, at('09:50'), 1, '3-1', 'gamja')]
    const b = reserve(science, MON, '09:50', '4-2', held)
    expect(b).toMatchObject({ ok: false, status: 409 })
    expect(!b.ok && b.error).toContain('자리가 없습니다')
    const fh = [R(field, at('09:50'), 1, '3-1', 'gamja')]
    const dup = reserve(field, MON, '09:50', '3-1', fh)
    expect(dup).toMatchObject({ ok: false, status: 409 })
    expect(!dup.ok && dup.error).toContain('이미')
  })
  it('정원 2 운동장은 둘까지, 셋째는 409 · 빈 자리 번호부터 채운다', () => {
    const one = [R(field, at('09:50'), 1, '3-1', 'gamja')]
    expect(reserve(field, MON, '09:50', '4-2', one)).toMatchObject({ ok: true, slotNo: 2 })
    expect(reserve(field, MON, '09:50', '4-3', [...one, R(field, at('09:50'), 2, '4-2', 'goguma')])).toMatchObject({ ok: false, status: 409 })
    // 1번이 취소돼 2번만 남았으면 새 예약은 1번
    expect(reserve(field, MON, '09:50', '4-3', [R(field, at('09:50'), 2, '4-2', 'goguma')])).toMatchObject({ ok: true, slotNo: 1 })
  })
  it('차단된 칸은 사유와 함께 409, 풀리면 통과', () => {
    const blocks: RoomBlock[] = [{ id: 'b', roomId: 'r1', startDate: MON, endDate: MON, fromMin: at('13:10'), toMin: at('14:40'), reason: '방과후' }]
    const r = reserve(science, MON, '13:10', '3-1', [], { blocks })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(!r.ok && r.error).toContain('방과후')
    expect(reserve(science, MON, '12:20', '3-1', [], { blocks }).ok).toBe(true)
    expect(reserve(science, MON, '13:10', '3-1').ok).toBe(true)
  })
  it('동시에 여럿이 같은 칸을 판정하면 같은 자리 1이 나온다(→ DB 유일 제약이 한 명만 통과시킨다)', () => {
    const v = ['6-1', '6-2', '6-3', '6-4', '6-5'].map((tn) => reserve(science, MON, '10:40', tn))
    expect(v.every((x) => x.ok && x.slotNo === 1)).toBe(true)
  })
})

describe('빈 방 · 내 예약 · 취소', () => {
  const rooms = [science, field]
  const held = [R(science, at('09:50'), 1, '3-1', 'gamja'), R(field, at('09:50'), 1, '3-1', 'gamja'), R(field, at('09:50'), 2, '4-2', 'goguma')]
  const mk = (room: Room) => ({ ...base(room), reservations: held })
  it('빈 방 검색: 09:50 에는 둘 다 차 있고 11:30 엔 둘 다 빈다 · 없는 시각은 뺀다', () => {
    expect(freeRooms(rooms, MON, at('09:50'), mk).rooms.map((x) => x.cell.free)).toEqual([0, 0])
    expect(freeRooms(rooms, MON, at('11:30'), mk).rooms.map((x) => x.cell.free)).toEqual([1, 2])
    expect(freeRooms(rooms, MON, at('08:00'), mk).rooms).toEqual([])
    const off = freeRooms(rooms, MON, at('09:50'), (r) => ({ ...base(r), schoolDay: false, offReason: '공휴일' }))
    expect(off).toEqual({ schoolDay: false, offReason: '공휴일', rooms: [] })
  })
  it('내 예약은 오늘 이후 본인 것만, 날짜·시각 순', () => {
    const all = [...held, R(science, at('10:40'), 1, '6-1', 'gamja'), R(science, at('09:50'), 1, '옛', 'gamja', '2026-10-01'), R(science, at('09:50'), 1, '먼', 'gamja', '2026-10-27')]
    expect(myReservations(all, 'gamja', TODAY).map((r) => [r.date, r.trackName])).toEqual([[MON, '3-1'], [MON, '3-1'], [MON, '6-1'], ['2026-10-27', '먼']])
  })
  it('취소: 남의 것은 403, 교무·관리자·교감은 됨, 본인은 됨, 지난 날은 관리자도 400, 없으면 404', () => {
    const x = { userId: 'goguma', date: MON }
    expect(decideCancel(x, { id: 'gamja', roles: ['교사'] }, TODAY)).toMatchObject({ ok: false, status: 403 })
    for (const role of ['교무', '관리자', '교감']) expect(decideCancel(x, { id: 'a', roles: [role] }, TODAY).ok).toBe(true)
    expect(decideCancel(x, { id: 'goguma', roles: ['교사'] }, TODAY).ok).toBe(true)
    expect(decideCancel({ ...x, date: '2026-10-19' }, { id: 'a', roles: ['관리자'] }, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(decideCancel(null, { id: 'a', roles: ['관리자'] }, TODAY)).toMatchObject({ ok: false, status: 404 })
  })
})

describe('보조 규칙', () => {
  it('시간 줄 머리: 학년군별 교시, 없는 칸은 —', () => {
    const slots = {
      's-1-2': [{ label: '3교시', startMin: at('11:30'), endMin: at('12:10') }, { label: '점심', startMin: at('12:20'), endMin: at('13:00') }],
      's-3-4': [{ label: '4교시', startMin: at('12:20'), endMin: at('13:00') }],
      's-5-6': [{ label: '5교시', startMin: at('12:20'), endMin: at('13:00') }],
    }
    const tl = timeLabels(slots)
    expect(tl.map((x) => x.startMin)).toEqual([at('11:30'), at('12:20')])
    expect(tl[0].labels).toEqual(['3교시', '—', '—'])
    expect(tl[1].labels).toEqual(['점심', '4교시', '5교시'])
  })
  it('날짜 계산과 서울 오늘', () => {
    expect(mondayOf('2026-10-28')).toBe(MON)
    expect(mondayOf('2026-11-01')).toBe(MON)   // 일요일은 그 주 월요일로
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(todayOf(Date.parse('2026-10-26T16:00:00Z'))).toBe('2026-10-27')   // UTC 16시 = 서울 다음날 01시
  })
  it('고정 사용 중복(방·요일·시작)', () => {
    const f = (id: string, roomId: string, dayIndex: number, s: string): RoomFixed => ({ id, roomId, dayIndex, startMin: at(s), endMin: at(s) + 40, label: '' })
    expect(fixedDuplicates([f('a', 'r1', 0, '09:00'), f('b', 'r1', 0, '09:00'), f('c', 'r2', 0, '09:00'), f('d', 'r1', 1, '09:00')])).toEqual([['a', 'b']])
  })
})
