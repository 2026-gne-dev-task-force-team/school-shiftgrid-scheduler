/**
 * `ops.rooms` 칸 조작(1.2v 설계 ① 12절) — 화면은 결과가 아니라 조작을 쌓고, 서버 판이 바뀌면 `replay` 로 다시 입힌다.
 * 열쇠 = 항목 id. 묶음 셋: rooms · fixed · blocks.
 */
import { replay, sameValue, type Op, type ReplayResult } from '../../../server-link/replay';
import type { Room, RoomBlock, RoomFixed, RoomsPart } from '../book';

export type RoomsCore = Pick<RoomsPart, 'rooms' | 'fixed' | 'blocks'>;
export const keyOf = (_list: string, item: unknown): string => (item as { id: string }).id;
const toLists = (p: RoomsCore): Record<string, unknown[]> => ({ rooms: p.rooms, fixed: p.fixed, blocks: p.blocks });

export const addRoom = (r: Room): Op => ({ op: 'add', list: 'rooms', key: r.id, item: r });
export const editRoom = (before: Room, after: Room): Op => ({ op: 'set', list: 'rooms', key: before.id, item: after, base: before });
export const delRoom = (id: string): Op => ({ op: 'del', list: 'rooms', key: id });
export const addBlock = (b: RoomBlock): Op => ({ op: 'add', list: 'blocks', key: b.id, item: b });
export const delBlock = (id: string): Op => ({ op: 'del', list: 'blocks', key: id });
export const addFixed = (f: RoomFixed): Op => ({ op: 'add', list: 'fixed', key: f.id, item: f });
export const delFixed = (id: string): Op => ({ op: 'del', list: 'fixed', key: id });

/** CSV 로 읽은 방들 → 조작. id 가 이미 있으면 고침(같은 값이면 건너뜀), 없으면 추가. */
export function opsFromRooms(current: Room[], incoming: Room[]): { ops: Op[]; adds: number; sets: number; same: number } {
    const ops: Op[] = [];
    let adds = 0, sets = 0, same = 0;
    for (const r of incoming) {
        const cur = current.find((c) => c.id === r.id);
        if (!cur) { ops.push(addRoom(r)); adds++; }
        else if (sameValue(cur, r)) same++;
        else { ops.push(editRoom(cur, r)); sets++; }
    }
    return { ops, adds, sets, same };
}

/** 칸 규칙 — 정원 1~20 · 방 이름 안 겹침 · 고정 사용 (방,요일,시작) 안 겹침 · 가리키는 방이 있음 · 차단 날짜 순서. */
export function checkRooms(p: RoomsCore): string[] {
    const bad: string[] = [];
    const ids = new Set(p.rooms.map((r) => r.id));
    const names = new Set<string>();
    for (const r of p.rooms) {
        if (!r.name.trim()) bad.push('방 이름이 비었습니다.');
        if (names.has(r.name)) bad.push(`방 이름이 겹칩니다(${r.name}).`);
        names.add(r.name);
        if (!Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 20) bad.push(`${r.name} 정원은 1~20 이어야 합니다.`);
    }
    const seen = new Set<string>();
    for (const f of p.fixed) {
        if (!ids.has(f.roomId)) bad.push('고정 사용이 없는 방을 가리킵니다.');
        const k = `${f.roomId}|${f.dayIndex}|${f.startMin}`;
        if (seen.has(k)) bad.push('같은 방·요일·시작의 고정 사용이 겹칩니다.');
        seen.add(k);
    }
    for (const b of p.blocks) {
        if (!ids.has(b.roomId)) bad.push('차단이 없는 방을 가리킵니다.');
        if (b.endDate < b.startDate) bad.push('차단 끝 날짜가 시작보다 이릅니다.');
        if ((b.fromMin === null) !== (b.toMin === null) || (b.fromMin !== null && b.toMin !== null && b.toMin <= b.fromMin)) bad.push('차단 시각이 맞지 않습니다.');
    }
    return bad;
}

export interface ApplyOutcome { next: RoomsCore; replayed: ReplayResult; errors: string[] }

/** 서버 판에 조작을 입힌다. 충돌이 있거나 칸 규칙에 걸리면 `errors` 가 비지 않는다(그땐 PUT 하지 않는다). */
export function applyRoomOps(server: RoomsCore, ops: Op[]): ApplyOutcome {
    const replayed = replay(toLists(server), ops, keyOf);
    const next: RoomsCore = { rooms: replayed.result.rooms as Room[], fixed: replayed.result.fixed as RoomFixed[], blocks: replayed.result.blocks as RoomBlock[] };
    const errors = replayed.conflicts.length > 0 ? ['서버 값이 달라져 충돌한 조작이 있습니다.'] : checkRooms(next);
    return { next, replayed, errors };
}
