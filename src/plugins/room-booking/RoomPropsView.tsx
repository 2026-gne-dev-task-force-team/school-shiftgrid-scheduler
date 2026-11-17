/**
 * 방 속성 화면 — 방마다 「정원·쓰는 방·고정 사용·차단 시간」을 한 줄씩 보인다.
 *   🔴 값은 rooms 의 ext['room-booking'] 에만 있다(읽기 roomProps · 쓰기 setRoomProps) — 여기엔 저장소가 없다.
 *   고정 사용·차단 시간은 ext 에서 읽어 보여 주기만 한다(쓰기 창구는 rooms 약속에 아직 없다 — R128 R2 가 정원·열쇠·켜짐·순서까지만 연다).
 */
import { useEffect, useState } from 'react';
import { Field, NumberInput, Toggle } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Room, Rooms } from '../rooms/contracts/rooms';
import { readRuleCells } from './rules';

const WD = '월화수목금토일';
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function RoomRow({ rooms, room }: { rooms: Rooms; room: Room }) {
    const p = rooms.roomProps(room.id);
    const { fixed, blocks } = readRuleCells(room, room.id);
    return (
        <section className="flex flex-col gap-2 border-b border-border p-3" data-room-row={room.id}>
            <div className="text-body font-medium text-text">{room.name}</div>
            <Field label="정원(명)">
                <NumberInput value={p.capacity ?? null} min={0} suffix="명" placeholder="제한 없음"
                    onChange={(n) => rooms.setRoomProps(room.id, { capacity: n === null ? null : Math.max(0, Math.round(n)) })} />
            </Field>
            <Field label="쓰는 방">
                <Toggle checked={p.active} onChange={(v) => rooms.setRoomProps(room.id, { active: v })} label="쓰는 방" />
            </Field>
            <Field label="고정 사용">
                <span className="text-body text-text" data-room-fixed>
                    {fixed.length ? fixed.map((f) => `${WD[f.dayIndex]} ${hm(f.startMin)}~${hm(f.endMin)}${f.label ? ` ${f.label}` : ''}`).join(' · ') : '없음'}
                </span>
            </Field>
            <Field label="차단 시간">
                <span className="text-body text-text" data-room-blocks>
                    {blocks.length ? blocks.map((b) => `${b.startDate}~${b.endDate}${b.fromMin !== null && b.toMin !== null ? ` ${hm(b.fromMin)}~${hm(b.toMin)}` : ' 종일'}${b.reason ? ` ${b.reason}` : ''}`).join(' · ') : '없음'}
                </span>
            </Field>
        </section>
    );
}

export function RoomPropsView({ host }: { host: PluginHost }) {
    const rooms = host.modules.use<Rooms>('rooms');
    const [, bump] = useState(0);
    useEffect(() => { const d = rooms?.onChange(() => bump((n) => n + 1)); return () => d?.dispose(); }, [rooms]);
    if (!rooms) return <div className="p-3 text-body text-muted">방 목록 플러그인이 꺼져 있습니다.</div>;
    const all = rooms.lists().flatMap((l) => rooms.roomsIn(l.id));
    if (!all.length) return <div className="p-3 text-body text-muted" data-room-empty>방이 아직 없습니다. 방 목록에서 방을 먼저 만드세요.</div>;
    return <div className="flex flex-col overflow-auto" data-room-props>{all.map((r) => <RoomRow key={r.id} rooms={rooms} room={r} />)}</div>;
}
