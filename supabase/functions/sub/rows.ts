// 보결 행 꼴 — DB 행(평문 아홉 칸 + 봉투 둘) ↔ 열어 내려주는 꼴(src/plugins/ops-sub/list/types.ts SubSlotRow 와 같은 모양).
// 봉투 열기·닫기는 이 파일 한 곳 — AAD 는 ④ `aadSub`(행 id·날짜·반·시각·kid·body|take).

import type { DbAudit } from '../_shared/audit.ts';
import { assertMayOpen } from '../_shared/crypto-scope.ts';
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
    assertMayOpen('sub', 'sub');
    const body = JSON.parse(await openText(ring, r.body_ct, aadOf(r, 'body'))) as SlotBody;
    const take = r.take_ct ? (JSON.parse(await openText(ring, r.take_ct, aadOf(r, 'take'))) as SlotTake) : null;
    return {
        id: r.id, projectId: r.project_id, date: r.date, trackName: r.track_name, startMin: r.start_min, endMin: r.end_min,
        status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, body, take,
    };
}

/** 엔진 입력 꼴(shared/sub-engine `SlotItem`)로 — 그날 보결 행이 결근·맡음으로 얹힌다 */
export const toSlotItem = (r: SubSlotRow) => ({
    absentId: r.body.absentRef, allDay: r.body.allDay, startMin: r.startMin, endMin: r.endMin,
    status: r.status, takerId: r.take?.takerRef ?? null, trackName: r.trackName,
});

export const openSlots =(ring: KeyRing, rows: readonly DbSlot[]) => Promise.all(rows.map((r) => openSlot(ring, r)));

/** 행 봉하기 — body 는 늘, take 는 맡은 이가 있을 때만(B9 맡기·취소도 이 한 곳) */
export async function sealSlot(ring: KeyRing, row: SubSlotRow): Promise<DbSlot> {
    const base = { project_id: row.projectId, id: row.id, date: row.date, track_name: row.trackName, start_min: row.startMin };
    return {
        ...base, end_min: row.endMin, status: row.status,
        body_ct: await sealText(ring, JSON.stringify(row.body), aadOf(base, 'body')),
        take_ct: row.take ? await sealText(ring, JSON.stringify(row.take), aadOf(base, 'take')) : null,
        created_at: row.createdAt, updated_at: row.updatedAt,
    };
}

// ── 저장 어댑터: 등록 덮어쓰기 RPC(마이그레이션 0002 `sub_register`) ─────────────

/** supabase-js 의 rpc 한 구멍 */
export interface RpcDb {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

const hexOf = (b: Bytes) => '\\x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** 지우기(조건부)·넣기·감사를 한 트랜잭션으로 — `SubStore.register` 자리에 끼운다 */
export function rpcRegister(db: RpcDb) {
    return async (
        rows: DbSlot[], replace: { id: string; updatedAt: string }[], audit?: DbAudit | DbAudit[] | null,
    ): Promise<'ok' | 'conflict'> => {
        const pid = rows[0]?.project_id;
        if (pid === undefined) {
            if (replace.length > 0) throw new Error('sub_register: 넣을 행 없이 지우기만 할 수 없습니다');
            return 'ok';
        }
        const auditList = audit == null ? null : Array.isArray(audit) ? audit : [audit];
        const { data, error } = await db.rpc('sub_register', {
            p_project_id: pid,
            p_rows: rows.map((r) => ({ ...r, body_ct: hexOf(r.body_ct), take_ct: r.take_ct ? hexOf(r.take_ct) : null })),
            p_replace: replace,
            p_audit: auditList ? auditList.map((a) => ({ ...a, body_ct: hexOf(a.body_ct) })) : null,
        });
        if (error) throw new Error('sub_register 실패');
        if (data !== 'ok' && data !== 'conflict') throw new Error('sub_register 돌려줌이 이상합니다');
        return data;
    };
}
