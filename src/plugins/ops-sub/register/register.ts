/**
 * 보결 등록(설계 ① 5-1 「등록」) — 입력 → `sub_slot` 줄. 판정 중 화면이 할 수 있는 둘만 한다:
 * 입력 검사 · 「이미 있는 칸이면 되묻기(needOverwrite)」. 지난 날·쉬는 날·수업 여부는 서버 몫(여기선 안 한다).
 * 열쇠 = (프로젝트, 날짜, 반, 시작 시각 분) — 설계 5절. ⛔ 실명 금지(시험은 가짜 이름).
 */
import type { SaveResult, SlotSource } from '../list/source';
import type { SubSlotRow } from '../list/types';

export interface RegisterInput {
    date: string;          // YYYY-MM-DD
    start: string;         // HH:MM
    end: string;           // HH:MM
    trackName: string;     // 반
    absentRef: string;     // 빠지는 사람 — `homeroom:<반>` 또는 agent id
    absentName: string;
    reason: string;        // ≤100자
    memo: string;          // ≤300자
    label?: string;
    subject?: string | null;
}
export interface RegisterCtx {
    projectId: string;
    userId: string;
    userName: string;
    now: () => string;
    newId: () => string;
}
export type RegisterResult =
    | { ok: true; row: SubSlotRow; replaced: boolean }
    | { ok: false; errors: string[] }
    | { ok: false; conflict: true; message: string }
    | { needsConfirm: true; existing: SubSlotRow; message: string };

export const REASON_MAX = 100;
export const MEMO_MAX = 300;

export function parseHHMM(s: string): number | null {
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = Number(m[1]); const mi = Number(m[2]);
    return h < 24 && mi < 60 ? h * 60 + mi : null;
}

function validDate(s: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 입력 검사 — 문제 문구 목록(비면 통과). */
export function validateInput(i: RegisterInput): string[] {
    const e: string[] = [];
    if (!validDate(i.date)) e.push('날짜는 2026-11-12 꼴로 적어 주세요.');
    const s = parseHHMM(i.start); const t = parseHHMM(i.end);
    if (s === null) e.push('시작 시각은 09:40 꼴로 적어 주세요.');
    if (t === null) e.push('끝 시각은 10:20 꼴로 적어 주세요.');
    if (s !== null && t !== null && t <= s) e.push('끝 시각이 시작 시각보다 늦어야 합니다.');
    if (!i.trackName.trim()) e.push('반을 적어 주세요.');
    if (!i.absentRef.trim() || !i.absentName.trim()) e.push('빠지는 사람을 골라 주세요.');
    if (i.reason.length > REASON_MAX) e.push(`사유는 ${REASON_MAX}자까지입니다.`);
    if (i.memo.length > MEMO_MAX) e.push(`메모는 ${MEMO_MAX}자까지입니다.`);
    return e;
}

/** 입력 → 줄(검사는 이미 통과했다고 본다). */
export function buildRow(i: RegisterInput, ctx: RegisterCtx): SubSlotRow {
    const now = ctx.now();
    return {
        id: ctx.newId(), projectId: ctx.projectId, date: i.date, trackName: i.trackName.trim(),
        startMin: parseHHMM(i.start) as number, endMin: parseHHMM(i.end) as number,
        status: '대기', createdAt: now, updatedAt: now,
        body: {
            absentRef: i.absentRef, absentName: i.absentName, registeredByName: ctx.userName, registeredBy: ctx.userId,
            label: i.label ?? '', subject: i.subject ?? null, reason: i.reason, memo: i.memo, allDay: false, preApproved: false,
        },
        take: null,
    };
}

export function overwriteMessage(existing: SubSlotRow): string {
    const base = `${existing.trackName} ${existing.date} ${String(Math.floor(existing.startMin / 60)).padStart(2, '0')}:${String(existing.startMin % 60).padStart(2, '0')} 칸에 이미 보결이 올라와 있습니다.`;
    return existing.take
        ? `${base} ⚠️ ${existing.take.takerName} 선생님이 이미 맡은 줄입니다 — 덮으면 그 분이 맡은 것이 풀리고 대기로 돌아갑니다. 덮을까요?`
        : `${base} 덮을까요?`;
}

/**
 * 등록. 같은 열쇠 줄이 있으면 `overwrite` 가 켜지기 전엔 저장하지 않고 되묻는다.
 * 덮을 땐 되묻던 그 줄의 updatedAt 을 ifMatch 로 걸어, 그 사이 바뀌었으면 충돌로 돌려준다.
 */
export async function registerSlot(src: SlotSource, input: RegisterInput, ctx: RegisterCtx, opts: { overwrite?: boolean } = {}): Promise<RegisterResult> {
    const errors = validateInput(input);
    if (errors.length > 0) return { ok: false, errors };
    const row = buildRow(input, ctx);
    const existing = (await src.loadSlots(row.date)).find((r) => r.projectId === row.projectId && r.trackName === row.trackName && r.startMin === row.startMin);
    if (existing && !opts.overwrite) return { needsConfirm: true, existing, message: overwriteMessage(existing) };
    const saved: SaveResult = await src.saveSlot(row, { ifMatch: existing ? existing.updatedAt : null });
    if (!saved.ok) return { ok: false, conflict: true, message: '방금 다른 분이 올렸습니다 — 다시 불러옵니다.' };
    return { ok: true, row: saved.row, replaced: !!existing };
}
