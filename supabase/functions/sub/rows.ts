// 보결 행 꼴 — DB 행(평문 아홉 칸 + 봉투 둘) ↔ 열어 내려주는 꼴(src/plugins/ops-sub/list/types.ts SubSlotRow 와 같은 모양).
// 봉투 열기·닫기는 이 파일 한 곳 — AAD 는 ④ `aadSub`(행 id·날짜·반·시각·kid·body|take).

import { aadSub } from '../_shared/crypto/aad.ts';
import { openText, sealText, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';

export type SlotStatus = '대기' | '확정';

export interface SlotBody {
    absentRef: string;
    absentName: string;
    registeredByName: string;
    registeredBy: string;
    label: string;
    subject: string | null;
    reason: string;
    memo: string;
    allDay: boolean;
    preApproved: boolean;
}
export interface SlotTake {
    takerRef: string;
    takerName: string;
    takerUserId: string | null;
    confirmedAt: string;
}
export interface SubSlotRow {
    id: string; projectId: string; date: string; trackName: string; startMin: number; endMin: number;
    status: SlotStatus; createdAt: string; updatedAt: string;
    body: SlotBody;
    take: SlotTake | null;
}

/** `sub_slot` 한 행 그대로(봉투는 바이트) */
export interface DbSlot {
    id: string; project_id: string; date: string; track_name: string; start_min: number; end_min: number;
    status: SlotStatus; body_ct: Bytes; take_ct: Bytes | null; created_at: string; updated_at: string;
}

const aadOf = (r: Pick<DbSlot, 'project_id' | 'id' | 'date' | 'track_name' | 'start_min'>, which: 'body' | 'take') =>
    (kid: string) => aadSub(r.project_id, r.id, r.date, r.track_name, r.start_min, kid, which);

export async function openSlot(ring: KeyRing, r: DbSlot): Promise<SubSlotRow> {
    const body = JSON.parse(await openText(ring, r.body_ct, aadOf(r, 'body'))) as SlotBody;
    const take = r.take_ct ? (JSON.parse(await openText(ring, r.take_ct, aadOf(r, 'take'))) as SlotTake) : null;
    return {
        id: r.id, projectId: r.project_id, date: r.date, trackName: r.track_name, startMin: r.start_min, endMin: r.end_min,
        status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, body, take,
    };
}

export const openSlots = (ring: KeyRing, rows: readonly DbSlot[]) => Promise.all(rows.map((r) => openSlot(ring, r)));

/** 새 행(대기) 봉하기 — take 는 B9(맡기)부터 */
export async function sealNewSlot(ring: KeyRing, row: SubSlotRow): Promise<DbSlot> {
    const base = { project_id: row.projectId, id: row.id, date: row.date, track_name: row.trackName, start_min: row.startMin };
    return {
        ...base, end_min: row.endMin, status: row.status,
        body_ct: await sealText(ring, JSON.stringify(row.body), aadOf(base, 'body')),
        take_ct: null, created_at: row.createdAt, updated_at: row.updatedAt,
    };
}
