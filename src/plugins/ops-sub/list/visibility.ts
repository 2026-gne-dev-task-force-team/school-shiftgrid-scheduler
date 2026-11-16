/**
 * 공개 범위(설계 ① 5절) — 누가 무엇을 보나. 판정은 서버가 하고, 화면은 같은 규칙으로 한 번 더 가린다.
 *   · 같은 프로젝트 로그인 사용자: 이름·사유·메모 전부(운영 앱대로 사유 공개)
 *   · 다른 프로젝트·비로그인: 줄 자체가 안 보인다
 *   · 감사 칸(올린 계정 id·누른 계정 id): 권한표 `sub.seeAudit` · 그 줄을 올린 계정 · 맡은 사람 본인에게만
 * 보는 사람·역할 꼴은 권한표 한 장(`shared/roles.ts`)의 것을 쓴다.
 */
import { viewerCan, type Viewer } from '../../../../shared/roles.ts';
import type { SubSlotRow } from './types';

export type { Role, Viewer } from '../../../../shared/roles.ts';

export type VisibleRow = Omit<SubSlotRow, 'body' | 'take'> & {
    body: Omit<SubSlotRow['body'], 'registeredBy'> & { registeredBy: string | null };
    take: (Omit<NonNullable<SubSlotRow['take']>, 'takerUserId'> & { takerUserId: string | null }) | null;
};

/** 보결 관리 역할인가 — 권한표 `sub.manage`. */
export const isManager = (v: Viewer): boolean => viewerCan(v, 'sub.manage');

export function applyVisibility(rows: SubSlotRow[], v: Viewer): VisibleRow[] {
    if (!v.loggedIn) return [];
    const out: VisibleRow[] = [];
    for (const r of rows) {
        if (r.projectId !== v.projectId) continue;
        const uploader = v.userId !== null && r.body.registeredBy === v.userId;
        const taker = v.personRef != null && r.take?.takerRef === v.personRef;
        const audit = viewerCan(v, 'sub.seeAudit') || uploader || taker;
        out.push({
            ...r,
            body: { ...r.body, registeredBy: audit ? r.body.registeredBy : null },
            take: r.take ? { ...r.take, takerUserId: audit ? r.take.takerUserId : null } : null,
        });
    }
    return out;
}

/** 빠지는 사람 이름 — 비었거나 id 그대로 들어 있으면 「알 수 없음」(올린 이·맡은 이와 같은 방식). */
export const absentLabel = (b: { absentName: string; absentRef: string }): string => {
    const n = b.absentName.trim();
    return n === '' || n === b.absentRef.trim() ? '알 수 없음' : n;
};
