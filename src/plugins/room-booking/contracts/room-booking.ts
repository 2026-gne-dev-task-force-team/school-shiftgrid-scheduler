/**
 * 🔴 약속 「room-booking」 0.1.0 — 방 예약 조각이 내놓는 명령 id(글자 상수뿐 · 함수 0).
 *   다른 조각(특별실 예약 길잡이 등)은 명령 id 를 글자로 부르지 않고 host.modules.use<RoomBooking>('room-booking').cmd.book 으로 받는다
 *   (남의 contracts 값 import ⛔ · 톱니 cmdIdString).
 *   ⚠️ 매니페스트(index.ts contributes.commands)의 id 와 한 벌이어야 한다.
 */
export const CMD = {
    open: 'room-booking.open',
    new: 'room-booking.new',
    props: 'room-booking.props',
    book: 'room-booking.book',
} as const;

export interface RoomBooking {
    readonly version: 1;
    /** 명령 id 상수 — host.commands.run(roomBooking.cmd.book). */
    readonly cmd: typeof CMD;
}
