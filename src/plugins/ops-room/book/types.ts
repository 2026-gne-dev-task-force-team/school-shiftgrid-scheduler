/**
 * 특별실 꼴(1.2v 설계 ① 6절) — `rooms` 칸(방·고정·차단) + 예약 행 `room_reservation`. ⛔ 실명 금지(시험은 가짜 이름).
 */
import type { Room, RoomBlock, RoomFixed } from '../../../../shared/room-rules.ts';
/** 방·고정·차단 꼴은 칸 규칙 정본(`shared/room-rules.ts`)의 것을 쓴다(R111). */
export type { Room, RoomBlock, RoomFixed };
/** `rooms` 칸 전체 + 시간표 배치(방 id·요일·시각) — 서버가 두 칸을 열어 준 뒤의 꼴. */
export interface RoomsPart { rooms: Room[]; fixed: RoomFixed[]; blocks: RoomBlock[]; timetable: RoomFixed[] }

export interface ReservationBody { userId: string; userName: string; note: string }
export interface ReservationRow {
    id: string; projectId: string; roomId: string; date: string; startMin: number; endMin: number;
    slotNo: number; trackName: string; createdAt: string; body: ReservationBody;
}
/** 저장 요청 — 자리 번호는 화면이 정하지 않는다(저장 창구가 고른다, R111). */
export type ReservationRequest = Omit<ReservationRow, 'slotNo'> & { slotNo?: never };
/** 보는 사람·역할 꼴은 권한표 한 장(`shared/roles.ts`)의 것을 쓴다. */
export type { Role, Viewer } from '../../../../shared/roles.ts';
