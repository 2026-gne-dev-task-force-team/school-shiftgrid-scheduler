/**
 * 칸 규칙 다리(R111) — 판정은 정본 `shared/room-rules.ts` 한 곳에 있다. 여기는 플러그인 꼴(RoomsPart·ReservationRow)을
 * 정본 입력으로 옮기기만 한다. 플러그인은 요청 시각(시작~끝) 한 칸만 놓고 보므로 times 는 그 한 칸, 쉬는 날 판정은 없다(schoolDay=true).
 */
import { dayIndexOf, freeRooms as freeRoomsOf, type Cell, type Reservation, type Room, type RoomDayInput } from '../../../../shared/room-rules.ts';
import type { ReservationRow, RoomsPart } from './types';

export const toRuleRow = (r: ReservationRow): Reservation => ({
    id: r.id, roomId: r.roomId, date: r.date, startMin: r.startMin, endMin: r.endMin, slotNo: r.slotNo,
    trackName: r.trackName, userId: r.body.userId, userName: r.body.userName, note: r.body.note,
});

/** 정본 판정 입력 — 방·날짜 빼고. 시간표 배치(timetable)도 방 id 로 잡혀 있어 고정 사용과 같이 넘긴다. */
export function ruleInput(part: RoomsPart, date: string, startMin: number, endMin: number, rows: readonly ReservationRow[], me = '', today = ''): Omit<RoomDayInput, 'room' | 'date'> {
    return {
        dayIndex: dayIndexOf(date), schoolDay: true, times: [{ startMin, endMin }],
        fixed: [...part.fixed, ...part.timetable], blocks: part.blocks, reservations: rows.map(toRuleRow), me, today,
    };
}

/** 빈 방 찾기 — 그 날짜·시각에 자리가 남은 방(켜진 방만, sort 순). */
export function freeRooms(part: RoomsPart, date: string, startMin: number, endMin: number, rows: readonly ReservationRow[]): { room: Room; cell: Cell }[] {
    const rooms = part.rooms.filter((r) => r.active).sort((a, b) => a.sort - b.sort);
    return freeRoomsOf(rooms, date, startMin, () => ruleInput(part, date, startMin, endMin, rows)).rooms.filter((x) => x.cell.free > 0);
}
