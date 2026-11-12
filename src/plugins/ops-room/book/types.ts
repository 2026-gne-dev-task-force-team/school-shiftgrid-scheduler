/**
 * 특별실 꼴(1.2v 설계 ① 6절) — `rooms` 칸(방·고정·차단) + 예약 행 `room_reservation`. ⛔ 실명 금지(시험은 가짜 이름).
 */
export interface Room { id: string; name: string; capacity: number; resourceKey: string | null; active: boolean; sort: number; note: string }
export interface RoomFixed { id: string; roomId: string; dayIndex: number; startMin: number; endMin: number; label: string }
export interface RoomBlock { id: string; roomId: string; startDate: string; endDate: string; fromMin: number | null; toMin: number | null; reason: string }
/** `rooms` 칸 전체 + 시간표 배치(방 id·요일·시각) — 서버가 두 칸을 열어 준 뒤의 꼴. */
export interface RoomsPart { rooms: Room[]; fixed: RoomFixed[]; blocks: RoomBlock[]; timetable: RoomFixed[] }

export interface ReservationBody { userId: string; userName: string; note: string }
export interface ReservationRow {
    id: string; projectId: string; roomId: string; date: string; startMin: number; endMin: number;
    slotNo: number; trackName: string; createdAt: string; body: ReservationBody;
}
export type Role = '관리자' | '교감' | '교무' | '교사';
export interface Viewer { loggedIn: boolean; projectId: string; userId: string | null; role: Role }
