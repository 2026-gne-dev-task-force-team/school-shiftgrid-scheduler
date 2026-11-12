import { useEffect, useState } from 'react';
import { Button, Field, TextInput } from '../../pane-ui-system';
import { applyVisibility, bookRoom, cancelReservation, canCancel, freeRooms, getRoomSource, getViewer, mine, type BookCtx, type ReservationRow, type RoomSource, type RoomsPart } from './book';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const mm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const liveCtx = (): BookCtx => ({ viewer: getViewer(), userName: '', today: today(), now: () => new Date().toISOString(), newId: () => crypto.randomUUID() });

/** 특별실 예약 — 날짜·시각 → 빈 방 목록 → 반 적고 「예약」 · 내 예약 목록 + 「취소」. */
export function RoomView({ source, ctx, initial }: { source?: RoomSource; ctx?: BookCtx; initial?: { date?: string; start?: string; end?: string; trackName?: string } }) {
    const src = source ?? getRoomSource();
    const c = ctx ?? liveCtx();
    const [form, setForm] = useState({ date: today(), start: '09:40', end: '10:20', trackName: '', ...initial });
    const [part, setPart] = useState<RoomsPart | null>(null);
    const [rows, setRows] = useState<ReservationRow[]>([]);
    const [msg, setMsg] = useState<string | null>(null);
    const reload = async () => { setPart(await src.loadPart()); setRows(await src.loadReservations(form.date)); };
    useEffect(() => { void reload(); }, [form.date]); // eslint-disable-line react-hooks/exhaustive-deps
    const set = (k: keyof typeof form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null); };

    const toMin = (s: string) => { const m = /^(\d{2}):(\d{2})$/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
    const free = part ? freeRooms(part, form.date, toMin(form.start), toMin(form.end), rows) : [];
    const book = async (roomId: string) => {
        const r = await bookRoom(src, { roomId, ...form, note: '' }, c);
        setMsg(r.ok ? '예약했습니다.' : r.message);
        await reload();
    };
    const cancel = async (row: ReservationRow) => {
        const r = await cancelReservation(src, row, c);
        setMsg(r.ok ? '취소했습니다.' : r.message);
        await reload();
    };
    const visible = applyVisibility(rows, c.viewer);
    const myRows = mine(rows, c.viewer);

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <Field label="날짜"><TextInput value={form.date} onChange={(e) => set('date')(e.target.value)} placeholder="2026-11-12" /></Field>
            <div className="flex gap-2">
                <Field label="시작"><TextInput value={form.start} onChange={(e) => set('start')(e.target.value)} /></Field>
                <Field label="끝"><TextInput value={form.end} onChange={(e) => set('end')(e.target.value)} /></Field>
            </div>
            <Field label="반"><TextInput value={form.trackName} onChange={(e) => set('trackName')(e.target.value)} placeholder="1-1" /></Field>
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">빈 방</h3>
            {free.length === 0 && <p className="text-small">자리가 남은 방이 없습니다.</p>}
            {free.map(({ room, cell }) => (
                <div key={room.id} className="flex gap-2 items-center text-small">
                    <span>{room.name} (빈자리 {cell?.kind === 'open' ? cell.free : 0})</span>
                    <Button variant="solid" tone="accent" onClick={() => void book(room.id)}>{`${room.name} 예약`}</Button>
                </div>
            ))}
            <h3 className="text-small">그날 예약 {visible.length}건 · 내 예약 {myRows.length}건</h3>
            {visible.map((r) => (
                <div key={r.id} className="flex gap-2 items-center text-small">
                    <span>{part?.rooms.find((x) => x.id === r.roomId)?.name} {mm(r.startMin)} {r.trackName} 반 ({r.slotNo}번)</span>
                    {canCancel(rows.find((x) => x.id === r.id) as ReservationRow, c.viewer) && <Button variant="ghost" onClick={() => void cancel(rows.find((x) => x.id === r.id) as ReservationRow)}>취소</Button>}
                </div>
            ))}
        </div>
    );
}

export function RoomPanel() { return <RoomView />; }
