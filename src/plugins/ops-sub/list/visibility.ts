/**
 * 공개 범위(설계 ① 5절) — 누가 무엇을 보나. 판정은 서버가 하고, 화면은 같은 규칙으로 한 번 더 가린다.
 *   · 같은 프로젝트 로그인 사용자: 이름·사유·메모 전부(운영 앱대로 사유 공개)
 *   · 다른 프로젝트·비로그인: 줄 자체가 안 보인다
 *   · 감사 칸(올린 계정 id·누른 계정 id): 관리 4역할 · 그 줄을 올린 계정 · 맡은 사람 본인에게만
 */
import type { SubSlotRow } from './types';

export type Role = '관리자' | '교감' | '교무' | '보결관리자' | '교사';
export const MANAGER_ROLES: readonly Role[] = ['관리자', '교감', '교무', '보결관리자'];

export interface Viewer {
    loggedIn: boolean;
    projectId: string;
    userId: string | null;
    personRef: string | null;
    role: Role;
}

export type VisibleRow = Omit<SubSlotRow, 'body' | 'take'> & {
    body: Omit<SubSlotRow['body'], 'registeredBy'> & { registeredBy: string | null };
    take: (Omit<NonNullable<SubSlotRow['take']>, 'takerUserId'> & { takerUserId: string | null }) | null;
};

export const isManager = (v: Viewer): boolean => MANAGER_ROLES.includes(v.role);

export function applyVisibility(rows: SubSlotRow[], v: Viewer): VisibleRow[] {
    if (!v.loggedIn) return [];
    const out: VisibleRow[] = [];
    for (const r of rows) {
        if (r.projectId !== v.projectId) continue;
        const uploader = v.userId !== null && r.body.registeredBy === v.userId;
        const taker = v.personRef !== null && r.take?.takerRef === v.personRef;
        const audit = isManager(v) || uploader || taker;
        out.push({
            ...r,
            body: { ...r.body, registeredBy: audit ? r.body.registeredBy : null },
            take: r.take ? { ...r.take, takerUserId: audit ? r.take.takerUserId : null } : null,
        });
    }
    return out;
}
