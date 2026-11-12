/**
 * 보결 상세·맡기(설계 ① 5-1 「맡기」) — 화면이 할 수 있는 판정만 한다:
 * 지난 날 ✗ → 대기 아님 409 → personRef 없음 403 → 같은 시각 이미 맡음 ✗ → 조건부 저장(ifMatch) 실패 409.
 * `whyNot`(전담·수업 여부 등)은 서버 몫. ⛔ 실명 금지(시험은 가짜 이름).
 */
import type { SlotSource } from '../list/source';
import type { SubSlotRow } from '../list/types';
import { applyVisibility, isManager, type Viewer, type VisibleRow } from '../list/visibility';

export interface DetailView {
    row: VisibleRow;
    absentKind: '담임' | '지정';   // `homeroom:<반>` = 담임 결근
    timeText: string;
    canTake: boolean;
    cannotTakeWhy: string | null;
    showAudit: boolean;           // 감사 칸(올린·누른 계정)이 채워져 있나
}
export type TakeResult =
    | { ok: true; row: SubSlotRow }
    | { ok: false; code: 403 | 409; message: string };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const absentKindOf = (ref: string): '담임' | '지정' => (ref.startsWith('homeroom:') ? '담임' : '지정');

/** 맡기 가능 여부 — 처음 걸리는 것에서 멈춘다. `sameTime` = 같은 날 내가 이미 맡은 줄들. null = 가능. */
export function whyNotTake(row: SubSlotRow, v: Viewer, today: string, sameTime: SubSlotRow[] = []): { code: 403 | 409; message: string } | null {
    if (row.date < today) return { code: 409, message: '지난 날 보결은 맡을 수 없습니다.' };
    if (row.status !== '대기') return { code: 409, message: '이미 다른 분이 맡은 보결입니다.' };
    if (!v.loggedIn || v.personRef === null) return { code: 403, message: '계정에 교사 연결이 없어 맡을 수 없습니다.' };
    if (row.body.absentRef === v.personRef) return { code: 403, message: '내가 빠지는 보결은 맡을 수 없습니다.' };
    const clash = sameTime.find((o) => o.id !== row.id && o.take?.takerRef === v.personRef && o.startMin < row.endMin && row.startMin < o.endMin);
    if (clash) return { code: 409, message: `같은 시각에 ${clash.trackName} 보결을 이미 맡았습니다.` };
    return null;
}

/** 상세 보기 모양 — 공개 범위를 한 번 더 적용한 뒤 만든다. 안 보이는 줄이면 null. */
export function buildDetail(row: SubSlotRow, v: Viewer, today: string, sameTime: SubSlotRow[] = []): DetailView | null {
    const [vis] = applyVisibility([row], v);
    if (!vis) return null;
    const why = whyNotTake(row, v, today, sameTime);
    return {
        row: vis, absentKind: absentKindOf(row.body.absentRef), timeText: `${hhmm(row.startMin)}~${hhmm(row.endMin)}`,
        canTake: why === null, cannotTakeWhy: why?.message ?? null,
        showAudit: vis.body.registeredBy !== null || isManager(v),
    };
}

/**
 * 맡기. 최신 줄을 다시 읽어 판정하고, 저장은 읽은 줄의 updatedAt 을 ifMatch 로 건다 —
 * 그 사이 다른 사람이 맡았으면 409 「방금 다른 분이 먼저」(되묻기).
 */
export async function takeSlot(
    src: SlotSource, rowId: string, date: string, v: Viewer,
    ctx: { today: string; now: () => string; takerName: string; expectUpdatedAt?: string },
): Promise<TakeResult> {
    const day = await src.loadSlots(date);
    const row = day.find((r) => r.id === rowId && r.projectId === v.projectId);
    if (!row) return { ok: false, code: 409, message: '보결이 없어졌습니다 — 다시 불러옵니다.' };
    if (ctx.expectUpdatedAt !== undefined && row.updatedAt !== ctx.expectUpdatedAt) return { ok: false, code: 409, message: '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다.' };
    const why = whyNotTake(row, v, ctx.today, day);
    if (why) return { ok: false, ...why };
    const now = ctx.now();
    const next: SubSlotRow = {
        ...row, status: '확정', updatedAt: now,
        take: { takerRef: v.personRef as string, takerName: ctx.takerName, takerUserId: v.userId, confirmedAt: now },
    };
    const saved = await src.saveSlot(next, { ifMatch: row.updatedAt });
    if (!saved.ok) return { ok: false, code: 409, message: '방금 다른 분이 먼저 맡았습니다 — 다시 불러옵니다.' };
    return { ok: true, row: saved.row };
}
