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
    canCancel: boolean;           // 맡기 취소 버튼을 보일까(확정 · 맡은 본인 또는 관리 역할 · 지난 날은 관리자만)
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

/**
 * 맡기 취소 가능 여부(설계 ① 5-1 「취소」) — 확정 아님 409 → 지난 날은 관리자만 403 → 맡은 본인·관리 4역할만 403. null = 가능.
 * 「지난 날은 관리자만」: 역할이 정확히 `관리자` 일 때만(교감·교무·보결관리자는 지난 날 불가).
 */
export function whyNotCancel(row: SubSlotRow, v: Viewer, today: string): { code: 403 | 409; message: string } | null {
    if (row.status !== '확정' || !row.take) return { code: 409, message: '맡은 보결이 아니어서 취소할 수 없습니다.' };
    if (row.date < today && !(v.loggedIn && v.role === '관리자')) return { code: 403, message: '지난 날 보결은 관리자만 취소할 수 있습니다.' };
    const mine = v.personRef !== null && row.take.takerRef === v.personRef;
    if (!v.loggedIn || !(mine || isManager(v))) return { code: 403, message: '맡은 본인이나 관리 역할만 취소할 수 있습니다.' };
    return null;
}

/** 상세 보기 모양 — 공개 범위를 한 번 더 적용한 뒤 만든다. 안 보이는 줄이면 null. */
export function buildDetail(row: SubSlotRow, v: Viewer, today: string, sameTime: SubSlotRow[] = []): DetailView | null {
    const [vis] = applyVisibility([row], v);
    if (!vis) return null;
    const why = whyNotTake(row, v, today, sameTime);
    return {
        row: vis, absentKind: absentKindOf(row.body.absentRef), timeText: `${hhmm(row.startMin)}~${hhmm(row.endMin)}`,
        canTake: why === null, cannotTakeWhy: why?.message ?? null, canCancel: whyNotCancel(row, v, today) === null,
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

/**
 * 맡기 취소 — 대기로 되돌린다(맡은 이만 지우고 행은 남는다). 최신 줄을 다시 읽어 판정하고,
 * 저장은 읽은 줄의 updatedAt 을 ifMatch 로 건다 — 그 사이 줄이 바뀌었으면 409 되묻기.
 */
export async function cancelTake(
    src: SlotSource, rowId: string, date: string, v: Viewer,
    ctx: { today: string; now: () => string; expectUpdatedAt?: string },
): Promise<TakeResult> {
    const day = await src.loadSlots(date);
    const row = day.find((r) => r.id === rowId && r.projectId === v.projectId);
    if (!row) return { ok: false, code: 409, message: '보결이 없어졌습니다 — 다시 불러옵니다.' };
    if (ctx.expectUpdatedAt !== undefined && row.updatedAt !== ctx.expectUpdatedAt) return { ok: false, code: 409, message: '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다.' };
    const why = whyNotCancel(row, v, ctx.today);
    if (why) return { ok: false, ...why };
    const next: SubSlotRow = { ...row, status: '대기', updatedAt: ctx.now(), take: null };
    const saved = await src.saveSlot(next, { ifMatch: row.updatedAt });
    if (!saved.ok) return { ok: false, code: 409, message: '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다.' };
    return { ok: true, row: saved.row };
}
