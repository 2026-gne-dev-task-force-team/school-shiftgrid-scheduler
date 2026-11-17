/**
 * 보결 줄 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다(나머지는 loadSlots 만 부른다).
 * 지금은 메모리 구현(시험·미리보기용 가짜 줄).
 */
import type { SaveResult, Sub } from '../contracts/sub';
import type { SubSlotRow } from './types';

export interface SlotSource {
    loadSlots(date: string): Promise<SubSlotRow[]>;
    /**
     * 줄 하나 저장 — 열쇠(프로젝트·날짜·반·시작 시각)가 같은 줄이 있으면 그 줄을 지우고 새로 쓴다(설계 5-1 「지우고 새로」).
     * ifMatch: 생략 = 무조건 · `null` = 그 열쇠가 비어 있어야 함 · 문자열 = 있는 줄의 updatedAt 이 같아야 함.
     * 어긋나면 `{ ok:false, conflict:true }`(서버라면 409 「방금 다른 분이 올렸습니다」).
     */
    saveSlot(row: SubSlotRow, opts?: { ifMatch?: string | null }): Promise<SaveResult>;
    /** 줄 지우기(관리 「삭제」) — ifMatch = 있는 줄의 updatedAt 이 같아야 함. 어긋나면 `{ ok:false, conflict:true }`. */
    deleteSlot(row: SubSlotRow, opts?: { ifMatch?: string }): Promise<{ ok: true } | { ok: false; conflict: true }>;
}
export type { SaveResult };

const sameKey = (a: SubSlotRow, b: SubSlotRow) =>
    a.projectId === b.projectId && a.date === b.date && a.trackName === b.trackName && a.startMin === b.startMin;

/** 줄 묶음을 읽고 쓰는 창구 — 읽기·쓰기 손만 갈아 끼우면 메모리든 기기 저장소든 같은 규칙이다. */
function storeSource(read: () => SubSlotRow[], write: (rows: SubSlotRow[]) => void): SlotSource {
    return {
        loadSlots: async (date) => read().filter((r) => r.date === date).map((r) => ({ ...r })),
        saveSlot: async (row, opts = {}) => {
            const store = read();
            const i = store.findIndex((r) => sameKey(r, row));
            const { ifMatch } = opts;
            if (ifMatch !== undefined) {
                if (ifMatch === null ? i >= 0 : i < 0 || store[i].updatedAt !== ifMatch) return { ok: false, conflict: true };
            }
            if (i >= 0) store.splice(i, 1);
            store.push({ ...row });
            write(store);
            return { ok: true, row: { ...row } };
        },
        deleteSlot: async (row, opts = {}) => {
            const store = read();
            const i = store.findIndex((r) => r.id === row.id && r.projectId === row.projectId);
            if (i < 0 || (opts.ifMatch !== undefined && store[i].updatedAt !== opts.ifMatch)) return { ok: false, conflict: true };
            store.splice(i, 1);
            write(store);
            return { ok: true };
        },
    };
}

export function memorySource(rows: SubSlotRow[]): SlotSource {
    const store = rows.map((r) => ({ ...r }));
    return storeSource(() => store, () => undefined);
}

export const LS_KEY = 'plugin.ops-sub.part';

/**
 * 기기 저장소(localStorage)에 남는 창구 — 새로고침·다시 붙기에도 올린 보결·지운 보결이 남는다.
 * 저장된 값이 없을 때만 seed(데모)를 쓴다. 저장소가 죽거나 값이 깨졌으면 seed 로 돌아가되 던지지 않는다.
 */
export function localSlotSource(seed: () => SubSlotRow[], key: string = LS_KEY): SlotSource {
    const read = (): SubSlotRow[] => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const p = JSON.parse(raw) as unknown;
                if (Array.isArray(p)) return p as SubSlotRow[];
            }
        } catch { /* 깨진 값·저장소 막힘 — seed */ }
        return seed();
    };
    return storeSource(read, (rows) => { try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* 조용히 */ } });
}

/** 약속(sub)을 읽고 쓰는 창구 — 저장은 노드가 쥔다(store.ts). 화면·규칙은 이 창구만 부른다. */
export function subSlotSource(sub: Sub): SlotSource {
    return {
        loadSlots: async (date) => [...sub.slotsOn(date)],
        saveSlot: async (row, opts) => sub.save(row, opts),
        deleteSlot: async (row, opts) => sub.remove(row, opts),
    };
}

/** 미리보기용 가짜 줄 — 실서버가 붙기 전까지 화면이 이걸 읽는다. */
export function demoRows(date: string): SubSlotRow[] {
    const body = (absentRef: string, absentName: string, reason: string) => ({
        absentRef, absentName, registeredByName: '가짜올림', registeredBy: 'u-up', label: '2교시', subject: '국어',
        reason, memo: '', allDay: false, preApproved: false,
    });
    return [
        { id: 'd1', projectId: 'p1', date, trackName: '1-1', startMin: 540, endMin: 580, status: '대기', createdAt: '', updatedAt: '', body: body('homeroom:1-1', '가나다', '연수'), take: null },
        { id: 'd2', projectId: 'p1', date, trackName: '3-1', startMin: 590, endMin: 630, status: '확정', createdAt: '', updatedAt: '', body: body('homeroom:3-1', '라마바', '병가'), take: { takerRef: 'T-demo', takerName: '사아자', takerUserId: 'u-demo', confirmedAt: '' } },
    ];
}

const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
let current: SlotSource = localSlotSource(() => demoRows(todayKst()));
export function setSlotSource(s: SlotSource): void { current = s; }
export function getSlotSource(): SlotSource { return current; }

/** 지금 보는 사람 — 🔴 진짜 계정이 붙기 전 자리표(이 파일 한 곳). 미리보기는 교사 한 명. */
import type { Viewer } from './visibility';
let viewer: Viewer = { loggedIn: true, projectId: 'p1', userId: 'u-demo', personRef: 'T-demo', roles: ['교사'], name: '가짜교사' };
export function setViewer(v: Viewer): void { viewer = v; }
export function getViewer(): Viewer { return viewer; }
