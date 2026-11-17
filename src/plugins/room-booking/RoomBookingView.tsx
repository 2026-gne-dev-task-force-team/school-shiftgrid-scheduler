/**
 * 방 예약 화면 — 예약하기 · 빈 방 찾기 · 내 예약(+취소) 세 구역을 한 화면에. 일은 `bookings.ts`, 자료는 달력 일정 + rooms 약속뿐.
 *   🔴 여기엔 저장소가 없다(예약 = 달력 「예약 목록」의 일정) · 방 속성은 rooms 에서 읽는다.
 */
import { useEffect, useState } from 'react';
import { Button, Field, NumberInput, TextInput } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar } from '../calendar/contracts/calendar';
import type { Rooms } from '../rooms/contracts/rooms';
import { RoomEmptyHelp } from './RoomEmptyNotice';
import { bookRoom, bookingsOn, cancelBooking, findFreeRooms, myBookings, type BookingDeps } from './bookings';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const span = (s: string, e: string) => `${s.slice(0, 10)} ${s.slice(11, 16)}~${e.slice(11, 16)}`;

export function RoomBookingView({ host }: { host: PluginHost }) {
    const calendar = host.modules.use<Calendar>('calendar');
    const nodes = host.modules.use<NodesApi>('nodes');
    const rooms = host.modules.use<Rooms>('rooms');
    const [, bump] = useState(0);
    const [form, setForm] = useState({ date: today(), start: '09:40', end: '10:20', name: '', booker: '' });
    const [headcount, setHeadcount] = useState<number | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    useEffect(() => {
        const a = nodes?.subscribe(() => bump((n) => n + 1));
        const b = rooms?.onChange(() => bump((n) => n + 1));
        return () => { a?.dispose(); b?.dispose(); };
    }, [nodes, rooms]);
    if (!calendar || !nodes || !rooms) return <div className="p-3 text-body text-muted">달력·방 목록 플러그인이 꺼져 있습니다.</div>;
    const deps: BookingDeps = { calendar, nodes, rooms };
    const set = (k: keyof typeof form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null); };

    const free = findFreeRooms(deps, form.date, form.start, form.end, headcount, today());
    const dayRows = bookingsOn(deps, form.date);
    const mine = myBookings(deps, form.booker, today());
    const book = (roomId: string) => {
        const r = bookRoom(deps, { roomId, ...form, headcount }, today());
        setMsg(r.ok ? '예약했습니다.' : r.reason);
    };

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3" data-room-booking>
            <Field label="날짜"><TextInput value={form.date} onChange={(e) => set('date')(e.target.value)} placeholder="2026-11-12" /></Field>
            <div className="flex flex-wrap gap-2">
                <Field label="시작"><TextInput value={form.start} onChange={(e) => set('start')(e.target.value)} /></Field>
                <Field label="끝"><TextInput value={form.end} onChange={(e) => set('end')(e.target.value)} /></Field>
                <Field label="인원(명)"><NumberInput value={headcount} min={0} suffix="명" placeholder="적지 않음" onChange={(n) => { setHeadcount(n === null ? null : Math.max(0, Math.round(n))); setMsg(null); }} /></Field>
            </div>
            <Field label="예약 이름(반·용도)"><TextInput value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="1-1" /></Field>
            <Field label="예약자(나)"><TextInput value={form.booker} onChange={(e) => set('booker')(e.target.value)} placeholder="가상 선생님" /></Field>
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">빈 방</h3>
            {free.length === 0 && (
                <RoomEmptyHelp host={host} lead="쓸 수 있는 방이 없습니다." />
            )}
            {free.map((room) => (
                <div key={room.id} className="flex flex-wrap gap-2 items-center text-small" data-free-room={room.id}>
                    <span>{room.name}</span>
                    <Button variant="solid" tone="accent" onClick={() => book(room.id)}>{`${room.name} 예약`}</Button>
                </div>
            ))}
            <h3 className="text-small">그날 예약 {dayRows.length}건 · 내 예약 {mine.length}건</h3>
            {dayRows.map((b) => (
                <div key={b.occ.eventId + b.start} className="text-small" data-day-row>{`${b.roomName} · ${span(b.start, b.end)} · ${b.name}`}</div>
            ))}
            <h3 className="text-small">내 예약</h3>
            {mine.length === 0 && <p className="text-small">{form.booker.trim() ? '내 예약이 없습니다.' : '예약자 이름을 적으면 내 예약이 보입니다.'}</p>}
            {mine.map((b) => (
                <div key={b.occ.eventId + b.start} className="flex flex-wrap gap-2 items-center text-small" data-my-row>
                    <span>{`${b.roomName} · ${span(b.start, b.end)} · ${b.name}`}</span>
                    <Button variant="outline" onClick={() => { const r = cancelBooking(deps, b, today()); setMsg(r.ok ? '취소했습니다.' : r.reason); }}>취소</Button>
                </div>
            ))}
        </div>
    );
}
