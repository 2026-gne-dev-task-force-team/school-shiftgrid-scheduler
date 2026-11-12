/**
 * 보결 관리(설계 ① 5-1 「삭제·지정·강제 지정·취소」) — 관리 역할 전용 순수 로직.
 * 되돌릴 수 없는 조작은 `confirmed: true` 없이는 실행하지 않고 「확인 필요」 상태(needConfirm)를 돌려준다.
 * 지난 날(`date < 오늘`): 삭제·확정 되돌리기는 관리자만 · 지정은 불가 · 강제 지정은 가능(설계 표).
 * ⛔ 실명 금지(시험은 가짜 이름).
 */
import type { SlotSource } from '../list/source';
import type { SubSlotRow } from '../list/types';
import { isManager, type Viewer } from '../list/visibility';

export type AdminAction = 'delete' | 'revert' | 'assign' | 'force';
export type AdminResult =
    | { ok: true; row: SubSlotRow | null }
    | { ok: false; needConfirm: true; prompt: string }
    | { ok: false; needConfirm?: false; code: 403 | 409; message: string };
export interface AdminCtx {
    today: string; now: () => string;
    confirmed?: boolean;
    expectUpdatedAt?: string;
    /** 지정·강제 지정 대상 */
    target?: { ref: string; name: string };
}

const isAdmin = (v: Viewer) => v.loggedIn && v.role === '관리자';
const past = (row: SubSlotRow, today: string) => row.date < today;
const PAST_ADMIN_ONLY = '지난 날 보결은 관리자만 처리할 수 있습니다.';

/** 처음 걸리는 것에서 멈춘다. null = 가능(확인 단계는 별도). */
export function whyNotAdmin(action: AdminAction, row: SubSlotRow, v: Viewer, today: string): { code: 403 | 409; message: string } | null {
    if (!v.loggedIn || !isManager(v)) return { code: 403, message: '관리 역할만 쓸 수 있습니다.' };
    if (row.projectId !== v.projectId) return { code: 403, message: '볼 수 없는 보결입니다.' };
    switch (action) {
        case 'delete':
            if (past(row, today) && !isAdmin(v)) return { code: 403, message: PAST_ADMIN_ONLY };
            return null;
        case 'revert':
            if (row.status !== '확정' || !row.take) return { code: 409, message: '맡은 보결이 아니어서 되돌릴 수 없습니다.' };
            if (past(row, today) && !isAdmin(v)) return { code: 403, message: PAST_ADMIN_ONLY };
            return null;
        case 'assign':
            if (v.role !== '교감' && v.role !== '교무' && !isAdmin(v)) return { code: 403, message: '지정은 교감·교무만 할 수 있습니다.' };
            if (past(row, today)) return { code: 409, message: '지난 날 보결은 지정할 수 없습니다.' };
            return null;
        case 'force':
            if (v.role !== '보결관리자' && !isAdmin(v)) return { code: 403, message: '강제 지정은 보결관리자만 할 수 있습니다.' };
            return null;
    }
}

/** 이 줄에서 이 사람이 누를 수 있는 관리 조작 목록(버튼 표시용). */
export const adminOptions = (row: SubSlotRow, v: Viewer, today: string): AdminAction[] =>
    (['delete', 'revert', 'assign', 'force'] as const).filter((a) => whyNotAdmin(a, row, v, today) === null);

/** 확인창에 띄울 문구. */
export function confirmPrompt(action: AdminAction, row: SubSlotRow, target?: { name: string }): string {
    const what = `${row.date} ${row.trackName} 보결`;
    switch (action) {
        case 'delete': return `${what}을 지웁니다. 되돌릴 수 없습니다. 계속할까요?`;
        case 'revert': return `${what}의 맡은 이(${row.take?.takerName ?? ''})를 지우고 대기로 되돌립니다. 계속할까요?`;
        case 'assign': return `${what}을 ${target?.name ?? ''}에게 지정합니다. 이미 맡은 이가 있으면 바뀝니다. 계속할까요?`;
        case 'force': return `${what}을 ${target?.name ?? ''}에게 강제 지정합니다. 판정을 건너뛰며 감사 기록에 남습니다. 계속할까요?`;
    }
}

const STALE = '방금 다른 분이 먼저 바꿨습니다 — 다시 불러옵니다.';

export async function runAdmin(
    src: SlotSource, action: AdminAction, rowId: string, date: string, v: Viewer, ctx: AdminCtx,
): Promise<AdminResult> {
    const day = await src.loadSlots(date);
    const row = day.find((r) => r.id === rowId && r.projectId === v.projectId);
    if (!row) return { ok: false, code: 409, message: '보결이 없어졌습니다 — 다시 불러옵니다.' };
    if (ctx.expectUpdatedAt !== undefined && row.updatedAt !== ctx.expectUpdatedAt) return { ok: false, code: 409, message: STALE };
    const why = whyNotAdmin(action, row, v, ctx.today);
    if (why) return { ok: false, ...why };
    const needsTarget = action === 'assign' || action === 'force';
    if (needsTarget && (!ctx.target || !ctx.target.ref.trim() || !ctx.target.name.trim())) return { ok: false, code: 409, message: '맡길 사람을 적어 주세요.' };
    if (!ctx.confirmed) return { ok: false, needConfirm: true, prompt: confirmPrompt(action, row, ctx.target) };

    if (action === 'delete') {
        const r = await src.deleteSlot(row, { ifMatch: row.updatedAt });
        return r.ok ? { ok: true, row: null } : { ok: false, code: 409, message: STALE };
    }
    const now = ctx.now();
    const next: SubSlotRow = action === 'revert'
        ? { ...row, status: '대기', updatedAt: now, take: null }
        : { ...row, status: '확정', updatedAt: now, take: { takerRef: ctx.target!.ref, takerName: ctx.target!.name, takerUserId: null, confirmedAt: now } };
    const saved = await src.saveSlot(next, { ifMatch: row.updatedAt });
    return saved.ok ? { ok: true, row: saved.row } : { ok: false, code: 409, message: STALE };
}
