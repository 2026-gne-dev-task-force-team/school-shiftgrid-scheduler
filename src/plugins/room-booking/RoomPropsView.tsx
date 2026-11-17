/**
 * 방 속성 화면 — 방마다 「정원·쓰는 방·고정 사용·차단 시간」을 한 줄씩 보이고 고친다.
 *   🔴 값은 rooms 의 ext['room-booking'] 에만 있다(읽기 roomProps·readRuleCells · 쓰기 setRoomProps) — 여기엔 저장소가 없다.
 *   고정 사용·차단 시간은 줄 목록 꼴 — 줄을 더하고·고치고·빼면 목록 통째로 setRoomProps 에 넘긴다(값 꼴 검사는 rooms 가 한다).
 */
import { useEffect, useState } from 'react';
import { Button, DateField, Field, NumberInput, Select, TextInput, Toggle, isoOf } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Room, Rooms, RoomFixedItem, RoomBlockItem } from '../rooms/contracts/rooms';
import { readRuleCells } from './rules';

const WD = '월화수목금토일';
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAY_OPTIONS = [...WD].map((d, i) => ({ value: String(i), label: `${d}요일` }));
const todayIso = () => { const t = new Date(); return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate()); };

/** 시각 고르기 목록 — 30분 간격 + 지금 값이 그 사이면 그 값도 보인다. */
function timeOptions(cur: number | null): { value: string; label: string }[] {
    const set = new Set<number>();
    for (let m = 0; m <= 1440; m += 30) set.add(m);
    if (cur !== null) set.add(cur);
    return [...set].sort((a, b) => a - b).map((m) => ({ value: String(m), label: hm(m) }));
}

type Fixed = RoomFixedItem & { label: string };
type Block = RoomBlockItem & { fromMin: number | null; toMin: number | null; reason: string };

function FixedEditor({ items, onChange }: { items: Fixed[]; onChange: (next: Fixed[]) => void }) {
    const edit = (i: number, p: Partial<Fixed>) => onChange(items.map((f, k) => (k === i ? { ...f, ...p } : f)));
    return (
        <div className="flex flex-col gap-1" data-room-fixed>
            {items.length === 0 && <span className="text-body text-muted">없음</span>}
            {items.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1" data-fixed-row={i}>
                    <Select size="sm" label="요일" value={String(f.dayIndex)} options={DAY_OPTIONS} onChange={(e) => edit(i, { dayIndex: Number(e.target.value) })} />
                    <Select size="sm" label="시작 시각" value={String(f.startMin)} options={timeOptions(f.startMin)} onChange={(e) => edit(i, { startMin: Number(e.target.value) })} />
                    <span className="text-muted">~</span>
                    <Select size="sm" label="끝 시각" value={String(f.endMin)} options={timeOptions(f.endMin)} onChange={(e) => edit(i, { endMin: Number(e.target.value) })} />
                    <TextInput size="sm" label="쓰는 쪽" placeholder="쓰는 쪽(선택)" value={f.label} onChange={(e) => edit(i, { label: e.target.value })} />
                    <Button size="sm" variant="ghost" tone="danger" onClick={() => onChange(items.filter((_, k) => k !== i))}>빼기</Button>
                </div>
            ))}
            <div><Button size="sm" data-fixed-add onClick={() => onChange([...items, { dayIndex: 0, startMin: 540, endMin: 600, label: '' }])}>고정 사용 더하기</Button></div>
        </div>
    );
}

function BlocksEditor({ items, onChange }: { items: Block[]; onChange: (next: Block[]) => void }) {
    const edit = (i: number, p: Partial<Block>) => onChange(items.map((b, k) => (k === i ? { ...b, ...p } : b)));
    return (
        <div className="flex flex-col gap-1" data-room-blocks>
            {items.length === 0 && <span className="text-body text-muted">없음</span>}
            {items.map((b, i) => {
                const timed = b.fromMin !== null && b.toMin !== null;
                return (
                    <div key={i} className="flex flex-wrap items-center gap-1" data-block-row={i}>
                        <DateField label="막기 시작 날짜" value={b.startDate} onChange={(v) => v && edit(i, { startDate: v, endDate: v > b.endDate ? v : b.endDate })} />
                        <span className="text-muted">~</span>
                        <DateField label="막기 끝 날짜" value={b.endDate} openAt={b.startDate} onChange={(v) => v && v >= b.startDate && edit(i, { endDate: v })} />
                        <Select size="sm" label="막는 시간" value={timed ? 'part' : 'all'} options={[{ value: 'all', label: '종일' }, { value: 'part', label: '시간대' }]}
                            onChange={(e) => edit(i, e.target.value === 'all' ? { fromMin: null, toMin: null } : { fromMin: 540, toMin: 1020 })} />
                        {timed && <>
                            <Select size="sm" label="막기 시작 시각" value={String(b.fromMin)} options={timeOptions(b.fromMin)} onChange={(e) => edit(i, { fromMin: Number(e.target.value) })} />
                            <span className="text-muted">~</span>
                            <Select size="sm" label="막기 끝 시각" value={String(b.toMin)} options={timeOptions(b.toMin)} onChange={(e) => edit(i, { toMin: Number(e.target.value) })} />
                        </>}
                        <TextInput size="sm" label="막은 까닭" placeholder="까닭(선택)" value={b.reason} onChange={(e) => edit(i, { reason: e.target.value })} />
                        <Button size="sm" variant="ghost" tone="danger" onClick={() => onChange(items.filter((_, k) => k !== i))}>빼기</Button>
                    </div>
                );
            })}
            <div><Button size="sm" data-block-add onClick={() => { const t = todayIso(); onChange([...items, { startDate: t, endDate: t, fromMin: null, toMin: null, reason: '' }]); }}>차단 시간 더하기</Button></div>
        </div>
    );
}

function RoomRow({ rooms, room }: { rooms: Rooms; room: Room }) {
    const p = rooms.roomProps(room.id);
    const { fixed, blocks } = readRuleCells(room, room.id);
    const fixedItems: Fixed[] = fixed.map((f) => ({ dayIndex: f.dayIndex, startMin: f.startMin, endMin: f.endMin, label: f.label }));
    const blockItems: Block[] = blocks.map((b) => ({ startDate: b.startDate, endDate: b.endDate, fromMin: b.fromMin, toMin: b.toMin, reason: b.reason }));
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
                <FixedEditor items={fixedItems} onChange={(next) => rooms.setRoomProps(room.id, { fixed: next })} />
            </Field>
            <Field label="차단 시간">
                <BlocksEditor items={blockItems} onChange={(next) => rooms.setRoomProps(room.id, { blocks: next })} />
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
