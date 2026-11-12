/** 칸 규칙(설계 6-1) — 화면 그림·예약 판정이 같이 쓰는 순수 함수. */
import type { ReservationRow, RoomsPart } from './types';

export const overlapMin = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;

export function dayIndexOf(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 월=0
}

export type CellState = { kind: 'locked'; why: string } | { kind: 'blocked'; why: string } | { kind: 'open'; free: number; taken: number };

/** 한 칸(방·날짜·시작~끝)의 상태. 고정이 하나라도 있으면 통째 잠금, 차단이면 빈자리 0, 아니면 정원 − 예약(시작 시각 같은 행만). */
export function cellState(part: RoomsPart, roomId: string, date: string, startMin: number, endMin: number, reservations: readonly ReservationRow[]): CellState | null {
    const room = part.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    const day = dayIndexOf(date);
    const fixed = [...part.fixed, ...part.timetable].find((f) => f.roomId === roomId && f.dayIndex === day && overlapMin(f.startMin, f.endMin, startMin, endMin));
    if (fixed) return { kind: 'locked', why: '고정 수업이 있는 칸' };
    const blk = part.blocks.find((b) => b.roomId === roomId && b.startDate <= date && date <= b.endDate && (b.fromMin === null || b.toMin === null || overlapMin(b.fromMin, b.toMin, startMin, endMin)));
    if (blk) return { kind: 'blocked', why: blk.reason ? `막힌 칸 — ${blk.reason}` : '막힌 칸' };
    const taken = reservations.filter((r) => r.roomId === roomId && r.date === date && r.startMin === startMin).length;
    return { kind: 'open', free: Math.max(0, room.capacity - taken), taken };
}

/** 빈 방 찾기 — 그 날짜·시작 시각에 자리가 남은 방(켜진 방만, sort 순). */
export function freeRooms(part: RoomsPart, date: string, startMin: number, endMin: number, reservations: readonly ReservationRow[]) {
    return part.rooms.filter((r) => r.active).sort((a, b) => a.sort - b.sort)
        .map((room) => ({ room, cell: cellState(part, room.id, date, startMin, endMin, reservations) }))
        .filter((x) => x.cell?.kind === 'open' && x.cell.free > 0);
}
