/**
 * 특별실 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터.
 * 유일 둘(설계 6-2): (방,날짜,시작,자리번호) · (방,날짜,시작,반). 서버라면 DB 가 막는다.
 * 🔴 자리 번호를 차례로 넣어 보는 반복은 saveReservation 한 곳(R111) — 후보는 정본 `freeSlots` 로 고른다. 화면은 번호를 보내지 않는다.
 */
import { freeSlots } from '../../../../shared/room-rules.ts';
import { LS_KEY, isMoved } from './migrate';
import type { ReservationRequest, ReservationRow, RoomsPart, Viewer } from './types';

/** full = 후보를 다 넣어 봤는데 자리가 없다 · track = 같은 반이 이미 그 칸 · etag = 덮어쓰려던 행이 바뀜 */
export type SaveResult = { ok: true; row: ReservationRow } | { ok: false; conflict: 'full' | 'track' | 'etag' };
export type DeleteResult = { ok: true } | { ok: false; conflict: 'etag' | 'missing' };

export interface RoomSource {
    loadPart(): Promise<RoomsPart>;
    /** `rooms` 칸 PUT(관리 역할) — 방·고정·차단 세 묶음을 통째로 쓴다. 시간표 배치(timetable)는 읽기 전용이라 건드리지 않는다. */
    savePart(next: Pick<RoomsPart, 'rooms' | 'fixed' | 'blocks'>): Promise<void>;
    loadReservations(date: string): Promise<ReservationRow[]>;
    /** 자리 번호는 여기서 고른다(빈 번호를 작은 수부터 넣어 보고 유일 위반이면 다음). ifMatch: 문자열 = 있는 행의 createdAt 이 같아야(덮어쓰기). */
    saveReservation(row: ReservationRequest, opts?: { ifMatch?: string }): Promise<SaveResult>;
    /** ifMatch: 지우려던 행의 createdAt(etag). 그 사이 바뀌었으면 etag 충돌. */
    deleteReservation(id: string, opts?: { ifMatch?: string }): Promise<DeleteResult>;
}

export function memoryRoomSource(initial: RoomsPart, rows: ReservationRow[] = [], onChange?: (part: RoomsPart, rows: ReservationRow[]) => void): RoomSource {
    let part = initial; // 참조를 그대로 둔다(시험이 배치를 나중에 얹는다)
    const store = rows.map((r) => ({ ...r }));
    return {
        loadPart: async () => structuredClone(part),
        savePart: async (next) => { part = { ...part, rooms: structuredClone(next.rooms), fixed: structuredClone(next.fixed), blocks: structuredClone(next.blocks) }; onChange?.(part, store); },
        loadReservations: async (date) => store.filter((r) => r.date === date).map((r) => ({ ...r })),
        saveReservation: async (req, opts = {}) => {
            const same = (r: ReservationRow) => r.id !== req.id && r.roomId === req.roomId && r.date === req.date && r.startMin === req.startMin;
            const capacity = part.rooms.find((r) => r.id === req.roomId)?.capacity ?? 0;
            // 서버 함수처럼: 후보를 먼저 고르고(이 사이 남이 끼어들 수 있다) …
            const candidates = freeSlots(capacity, store.filter(same).map((r) => r.slotNo));
            await Promise.resolve();
            const mine = store.findIndex((r) => r.id === req.id);
            if (opts.ifMatch !== undefined && (mine < 0 || store[mine].createdAt !== opts.ifMatch)) return { ok: false, conflict: 'etag' };
            // … 차례로 넣어 본다. 유일(방,날짜,시작,자리) 위반이면 다음 번호, 유일(방,날짜,시작,반) 위반이면 끝.
            for (const slotNo of candidates) {
                if (store.some((r) => same(r) && r.slotNo === slotNo)) continue;
                if (store.some((r) => same(r) && r.trackName === req.trackName)) return { ok: false, conflict: 'track' };
                const row: ReservationRow = { ...req, slotNo };
                const at = store.findIndex((r) => r.id === req.id);
                if (at >= 0) store.splice(at, 1);
                store.push({ ...row });
                onChange?.(part, store);
                return { ok: true, row: { ...row } };
            }
            return { ok: false, conflict: 'full' };
        },
        deleteReservation: async (id, opts = {}) => {
            const i = store.findIndex((r) => r.id === id);
            if (i < 0) return { ok: false, conflict: 'missing' };
            if (opts.ifMatch !== undefined && store[i].createdAt !== opts.ifMatch) return { ok: false, conflict: 'etag' };
            store.splice(i, 1);
            onChange?.(part, store);
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

/**
 * 기기 저장소(localStorage)에 남는 창구 — 새로고침·다시 붙기에도 방·예약이 남는다.
 * 저장된 값이 없거나 깨졌을 때만 seed(데모)를 쓴다. 저장소가 막혀도 던지지 않는다.
 * 🔴 R9 — 옛 예약을 달력으로 옮긴 뒤(`isMoved`)에는 예약 행을 안 읽는다(방·고정·차단 묶음만 읽는다).
 */
export function localRoomSource(seed: () => RoomsPart, key: string = LS_KEY): RoomSource {
    let part: RoomsPart | null = null;
    let rows: ReservationRow[] = [];
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const p = JSON.parse(raw) as { part?: RoomsPart; rows?: ReservationRow[] };
            if (p && p.part && Array.isArray(p.part.rooms) && Array.isArray(p.rows)) { part = p.part; rows = isMoved(localStorage, key) ? [] : p.rows; }
        }
    } catch { /* 깨진 값·저장소 막힘 — seed */ }
    return memoryRoomSource(part ?? seed(), rows, (pt, rs) => {
        try { localStorage.setItem(key, JSON.stringify({ part: pt, rows: rs })); } catch { /* 조용히 */ }
    });
}

let current: RoomSource = localRoomSource(demoPart);
const mockSource = current;
/** 기본 가짜 자료(mock)를 쓰는 중인가 — setRoomSource 로 진짜 서버 자료를 꽂으면 거짓. */
export function isMockRoomSource(s: RoomSource = current): boolean { return s === mockSource; }
export function setRoomSource(s: RoomSource): void { current = s; }
export function getRoomSource(): RoomSource { return current; }

/** 지금 보는 사람 — 🔴 진짜 계정이 붙기 전 자리표(이 파일 한 곳). */
let viewer: Viewer = { loggedIn: true, projectId: 'p1', userId: 'u-demo', roles: ['교사'] };
export function setViewer(v: Viewer): void { viewer = v; }
export function getViewer(): Viewer { return viewer; }
