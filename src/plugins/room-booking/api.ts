/**
 * 🔴 room-booking 인터페이스 모듈 — manifest.provides['room-booking'] 와 짝. host.modules.use<RoomBooking>('room-booking') 가 이걸 받는다.
 */
import { CMD } from './contracts/room-booking';
import type { RoomBooking } from './contracts/room-booking';

export const roomBookingApi: RoomBooking = { version: 1, cmd: CMD };
