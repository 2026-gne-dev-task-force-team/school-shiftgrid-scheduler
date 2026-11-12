/**
 * 특별실 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터.
 * 유일 둘(설계 6-2): (방,날짜,시작,자리번호) · (방,날짜,시작,반). 서버라면 DB 가 막는다.
 */
import type { ReservationRow, RoomsPart, Viewer } from './types';

export type SaveResult = { ok: true; row: ReservationRow } | { ok: false; conflict: 'slot' | 'track' | 'etag' };
export type DeleteResult = { ok: true } | { ok: false; conflict: 'etag' | 'missing' };

export interface RoomSource {
    loadPart(): Promise<RoomsPart>;
    loadReservations(date: string): Promise<ReservationRow[]>;
    /** ifMatch: 생략 = 자리 번호만 유일 검사 · 문자열 = 있는 행의 createdAt 이 같아야(덮어쓰기). */
    saveReservation(row: ReservationRow, opts?: { ifMatch?: string }): Promise<SaveResult>;
    /** ifMatch: 지우려던 행의 createdAt(etag). 그 사이 바뀌었으면 etag 충돌. */
    deleteReservation(id: string, opts?: { ifMatch?: string }): Promise<DeleteResult>;
}

export function memoryRoomSource(part: RoomsPart, rows: ReservationRow[] = []): RoomSource {
    const store = rows.map((r) => ({ ...r }));
    return {
        loadPart: async () => structuredClone(part),
        loadReservations: async (date) => store.filter((r) => r.date === date).map((r) => ({ ...r })),
        saveReservation: async (row, opts = {}) => {
            const same = (r: ReservationRow) => r.roomId === row.roomId && r.date === row.date && r.startMin === row.startMin;
            const mine = store.findIndex((r) => r.id === row.id);
            if (opts.ifMatch !== undefined && (mine < 0 || store[mine].createdAt !== opts.ifMatch)) return { ok: false, conflict: 'etag' };
            if (store.some((r) => r.id !== row.id && same(r) && r.slotNo === row.slotNo)) return { ok: false, conflict: 'slot' };
            if (store.some((r) => r.id !== row.id && same(r) && r.trackName === row.trackName)) return { ok: false, conflict: 'track' };
            if (mine >= 0) store.splice(mine, 1);
            store.push({ ...row });
            return { ok: true, row: { ...row } };
        },
        deleteReservation: async (id, opts = {}) => {
            const i = store.findIndex((r) => r.id === id);
            if (i < 0) return { ok: false, conflict: 'missing' };
            if (opts.ifMatch !== undefined && store[i].createdAt !== opts.ifMatch) return { ok: false, conflict: 'etag' };
            store.splice(i, 1);
            return { ok: true };
        },
    };
}

/** 미리보기용 가짜 자료. */
export function demoPart(): RoomsPart {
    return {
        rooms: [
            { id: 'r-sci', name: '과학실', capacity: 2, resourceKey: 'sci', active: true, sort: 1, note: '' },
            { id: 'r-yard', name: '운동장', capacity: 3, resourceKey: null, active: true, sort: 2, note: '' },
        ],
        fixed: [], blocks: [], timetable: [],
    };
}

let current: RoomSource = memoryRoomSource(demoPart());
export function setRoomSource(s: RoomSource): void { current = s; }
export function getRoomSource(): RoomSource { return current; }

/** 지금 보는 사람 — 🔴 진짜 계정이 붙기 전 자리표(이 파일 한 곳). */
let viewer: Viewer = { loggedIn: true, projectId: 'p1', userId: 'u-demo', role: '교사' };
export function setViewer(v: Viewer): void { viewer = v; }
export function getViewer(): Viewer { return viewer; }
