/**
 * 방 목록 CSV — 내보내기·불러오기. 따옴표·쉼표·줄바꿈이 든 칸을 지킨다(RFC 4180 꼴).
 * 불러오기는 곧바로 쓰지 않고 「미리보기」(넣을 것·고칠 것·그대로·거절)를 먼저 낸다.
 */
import type { Room } from '../book';

export const ROOM_HEADER = ['id', 'name', 'capacity', 'resourceKey', 'active', 'sort', 'note'] as const;

const cell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function roomsToCsv(rooms: Room[]): string {
    const lines = [ROOM_HEADER.join(',')];
    for (const r of rooms) lines.push([r.id, r.name, String(r.capacity), r.resourceKey ?? '', r.active ? 'true' : 'false', String(r.sort), r.note].map(cell).join(','));
    return lines.join('\r\n') + '\r\n';
}

/** 따옴표를 아는 표 읽기 — 각 기록에 시작 줄 번호(1부터)를 붙인다. */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
    const src = text.replace(/^﻿/, '');
    const out: { line: number; cells: string[] }[] = [];
    let cells: string[] = [];
    let cur = '';
    let quoted = false;
    let line = 1;
    let start = 1;
    let touched = false;
    const endCell = () => { cells.push(cur); cur = ''; };
    const endRecord = () => {
        endCell();
        if (!(cells.length === 1 && cells[0] === '' && !touched)) out.push({ line: start, cells });
        cells = []; touched = false;
    };
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
            else { cur += ch; if (ch === '\n') line++; }
            continue;
        }
        if (ch === '"') { quoted = true; touched = true; }
        else if (ch === ',') { endCell(); touched = true; }
        else if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            endRecord(); line++; start = line;
        } else { cur += ch; touched = true; }
    }
    if (quoted || cur !== '' || cells.length > 0 || touched) endRecord();
    return out;
}

export interface RoomCsvReject { line: number; why: string }
export interface RoomCsvPreview {
    /** 머리줄이 틀리면 여기에 이유가 있고 나머지는 비어 있다. */
    headerError: string | null;
    rooms: Room[];
    rejects: RoomCsvReject[];
}

export function parseRoomsCsv(text: string, newId: () => string): RoomCsvPreview {
    const recs = parseCsv(text);
    const empty = { rooms: [], rejects: [] as RoomCsvReject[] };
    if (recs.length === 0) return { headerError: '빈 파일입니다.', ...empty };
    const head = recs[0].cells.map((c) => c.trim());
    if (head.join(',') !== ROOM_HEADER.join(',')) return { headerError: `머리줄이 달라요. 기대: ${ROOM_HEADER.join(',')}`, ...empty };
    const rooms: Room[] = [];
    const rejects: RoomCsvReject[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const { line, cells } of recs.slice(1)) {
        if (cells.length !== ROOM_HEADER.length) { rejects.push({ line, why: `칸 수가 ${cells.length}개입니다(${ROOM_HEADER.length}개여야 함).` }); continue; }
        const [id, nameRaw, capRaw, key, activeRaw, sortRaw, note] = cells;
        const name = nameRaw.trim();
        const capacity = Number(capRaw.trim());
        const sort = Number(sortRaw.trim());
        const active = activeRaw.trim().toLowerCase();
        const why = !name ? '방 이름이 비었습니다.'
            : !/^\d+$/.test(capRaw.trim()) || capacity < 1 || capacity > 20 ? '정원은 1~20 정수여야 합니다.'
            : active !== 'true' && active !== 'false' ? '사용 여부는 true 나 false 입니다.'
            : !/^-?\d+$/.test(sortRaw.trim()) ? '순서는 정수여야 합니다.'
            : names.has(name) ? `파일 안에서 방 이름이 겹칩니다(${name}).`
            : id.trim() && ids.has(id.trim()) ? `파일 안에서 id 가 겹칩니다(${id.trim()}).`
            : null;
        if (why) { rejects.push({ line, why }); continue; }
        const rid = id.trim() || newId();
        ids.add(rid); names.add(name);
        rooms.push({ id: rid, name, capacity, resourceKey: key.trim() || null, active: active === 'true', sort, note });
    }
    return { headerError: null, rooms, rejects };
}
