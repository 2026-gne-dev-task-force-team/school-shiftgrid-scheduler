/**
 * 보결 줄(`sub_slot`, 1.2v 설계 ① 5절) — 서버가 암호문을 열어 내려준 뒤의 꼴. 평문 아홉 칸 + body/take.
 * ⛔ 실명·실자료 금지(공개 레포) — 시험은 가짜 이름만.
 */
export type SlotStatus = '대기' | '확정';

export interface SlotBody {
    absentRef: string;          // 결근자 사람 id — `homeroom:<반>` 또는 agent id
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
