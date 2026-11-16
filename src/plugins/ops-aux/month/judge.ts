/**
 * 마감 판정(1.2v 설계 ① 7절) — 서버가 `aux` 칸 PUT 때 쓰는 순수 함수. 옛 칸과 새 칸의 차이만 본다.
 *  - 마감된 (보조, 달)에 걸린 `day`·`exceptions` 의 추가·수정·삭제 → 409. 단 「정정」 예외 추가만 허용.
 *  - `monthClose` 줄 삭제(해제) → 권한표 `aux.reopenMonth`(관리자) 아니면 403. 역할은 여럿(`roles[]`) · 옛 한 역할도 받는다.
 * 마감 집합은 새 칸의 `monthClose` 다(관리자가 같은 PUT 에서 해제하면 풀린 것으로 본다).
 */
import { can, type Role } from '../../../../shared/roles.ts';
import type { AuxDay, AuxException, AuxMonthClose } from '../types';

export interface MonthState { day: AuxDay[]; exceptions: AuxException[]; monthClose: AuxMonthClose[] }
export type AuxJudgment = { ok: true } | { ok: false; status: 403 | 409; reason: string };

const ymOf = (date: string): string => date.slice(0, 7);

export function judgeAuxChange(old: MonthState, next: MonthState, roles: readonly Role[] | Role): AuxJudgment {
    const nextClose = new Set(next.monthClose.map((m) => m.id));
    const released = old.monthClose.filter((m) => !nextClose.has(m.id));
    if (released.length > 0 && !can(typeof roles === 'string' ? [roles] : roles, 'aux.reopenMonth')) return { ok: false, status: 403, reason: '마감 해제는 관리자만 할 수 있습니다.' };

    const closed = new Set(next.monthClose.map((m) => `${m.staffId}:${m.ym}`));
    const locked = (staffId: string, date: string) => closed.has(`${staffId}:${ymOf(date)}`);
    const diff = <T extends { id: string }>(a: T[], b: T[]) => {
        const am = new Map(a.map((x) => [x.id, x]));
        const bm = new Map(b.map((x) => [x.id, x]));
        const touched: { before?: T; after?: T }[] = [];
        for (const [id, x] of bm) { const o = am.get(id); if (!o || JSON.stringify(o) !== JSON.stringify(x)) touched.push({ before: o, after: x }); }
        for (const [id, o] of am) if (!bm.has(id)) touched.push({ before: o });
        return touched;
    };
    for (const t of diff(old.day, next.day)) {
        const hit = [t.before, t.after].find((d) => d && locked(d.staffId, d.date));
        if (hit) return { ok: false, status: 409, reason: `마감된 달(${ymOf(hit.date)})의 날짜별 배정은 고칠 수 없습니다. 정정 예외로 더하세요.` };
    }
    for (const t of diff(old.exceptions, next.exceptions)) {
        if (!t.before && t.after?.kind === '정정') continue; // 정정 추가만 마감 뒤에도 허용
        const hit = [t.before, t.after].find((e) => e && locked(e.staffId, e.date));
        if (hit) return { ok: false, status: 409, reason: `마감된 달(${ymOf(hit.date)})의 예외는 고치거나 지울 수 없습니다. 정정 예외로 더하세요.` };
    }
    return { ok: true };
}
