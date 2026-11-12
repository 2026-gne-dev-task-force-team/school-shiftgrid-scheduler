/**
 * 보결 줄 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다(나머지는 loadSlots 만 부른다).
 * 지금은 메모리 구현(시험·미리보기용 가짜 줄).
 */
import type { SubSlotRow } from './types';

export interface SlotSource {
    loadSlots(date: string): Promise<SubSlotRow[]>;
    /**
     * 줄 하나 저장 — 열쇠(프로젝트·날짜·반·시작 시각)가 같은 줄이 있으면 그 줄을 지우고 새로 쓴다(설계 5-1 「지우고 새로」).
     * ifMatch: 생략 = 무조건 · `null` = 그 열쇠가 비어 있어야 함 · 문자열 = 있는 줄의 updatedAt 이 같아야 함.
     * 어긋나면 `{ ok:false, conflict:true }`(서버라면 409 「방금 다른 분이 올렸습니다」).
     */
    saveSlot(row: SubSlotRow, opts?: { ifMatch?: string | null }): Promise<SaveResult>;
}
export type SaveResult = { ok: true; row: SubSlotRow } | { ok: false; conflict: true };

const sameKey = (a: SubSlotRow, b: SubSlotRow) =>
    a.projectId === b.projectId && a.date === b.date && a.trackName === b.trackName && a.startMin === b.startMin;

export function memorySource(rows: SubSlotRow[]): SlotSource {
    const store = rows.map((r) => ({ ...r }));
    return {
        loadSlots: async (date) => store.filter((r) => r.date === date).map((r) => ({ ...r })),
        saveSlot: async (row, opts = {}) => {
            const i = store.findIndex((r) => sameKey(r, row));
            const { ifMatch } = opts;
            if (ifMatch !== undefined) {
                if (ifMatch === null ? i >= 0 : i < 0 || store[i].updatedAt !== ifMatch) return { ok: false, conflict: true };
            }
            if (i >= 0) store.splice(i, 1);
            store.push({ ...row });
            return { ok: true, row: { ...row } };
        },
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

let current: SlotSource = memorySource([]);
export function setSlotSource(s: SlotSource): void { current = s; }
export function getSlotSource(): SlotSource { return current; }

/** 지금 보는 사람 — 🔴 진짜 계정이 붙기 전 자리표(이 파일 한 곳). 미리보기는 교사 한 명. */
import type { Viewer } from './visibility';
let viewer: Viewer = { loggedIn: true, projectId: 'p1', userId: 'u-demo', personRef: 'T-demo', role: '교사' };
export function setViewer(v: Viewer): void { viewer = v; }
export function getViewer(): Viewer { return viewer; }
