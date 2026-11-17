/**
 * 🔴 약속 「sub」 0.1.0 — **보결 줄**(날짜·반·시각·상태·맡은 이)을 읽고 쓰는 자리.
 *   저장은 제공자(ops-sub)가 노드 시스템으로 한다 — 소비자는 속을 모른다(줄만 본다).
 *   사람은 문자열 참조(`absentRef`·`takerRef`)로만 든다: `homeroom:<반>` 또는 교직원 명단(staff)의 사람 id. 이름은 줄에 얼려 둔 글자(보여 주기용).
 *   ⛔ 실명·실자료 금지(공개 레포) — 시험은 가짜 이름만.
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

export type SlotStatus = '대기' | '확정';

export interface SlotBody {
    absentRef: string;          // 결근자 사람 id — `homeroom:<반>` 또는 staff 사람 id
    absentName: string;
    registeredByName: string;
    registeredBy: string;       // 올린 계정
    label: string;
    subject: string | null;
    reason: string;             // ≤100자
    memo: string;               // ≤300자
    allDay: boolean;
    preApproved: boolean;
}
export interface SlotTake {
    takerRef: string;
    takerName: string;
    takerUserId: string | null; // 누른 계정 — 지정·강제면 null
    confirmedAt: string;
}
export interface SubSlotRow {
    id: string; projectId: string; date: string; trackName: string; startMin: number; endMin: number;
    status: SlotStatus; createdAt: string; updatedAt: string;
    body: SlotBody;
    take: SlotTake | null;      // 대기면 null
}

export type SaveResult = { ok: true; row: SubSlotRow } | { ok: false; conflict: true };

/** 보결 줄 표면 — version 을 처음부터. */
export interface Sub {
    version: 1;
    // ── 읽기 ──
    /** 그 날짜의 살아 있는 줄(복사본). */
    slotsOn(date: string): readonly SubSlotRow[];
    /** 줄 하나 — 없으면 undefined. */
    slot(id: string): SubSlotRow | undefined;
    // ── 쓰기 ──
    /**
     * 줄 하나 저장 — 열쇠(프로젝트·날짜·반·시작 시각)가 같은 줄이 있으면 그 줄을 지우고 새로 쓴다.
     * ifMatch: 생략 = 무조건 · `null` = 그 열쇠가 비어 있어야 함 · 문자열 = 있는 줄의 updatedAt 이 같아야 함. 어긋나면 `{ ok:false, conflict:true }`.
     */
    save(row: SubSlotRow, opts?: { ifMatch?: string | null }): SaveResult;
    /** 줄 지우기 — 🔴 휴지통으로. ifMatch = 있는 줄의 updatedAt. 어긋나거나 없으면 `{ ok:false, conflict:true }`. */
    remove(row: SubSlotRow, opts?: { ifMatch?: string }): { ok: true } | { ok: false; conflict: true };
    /** 줄이 바뀔 때마다 부른다. */
    onChange(listener: () => void): Disposable;
}
