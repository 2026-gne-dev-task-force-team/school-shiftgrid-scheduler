/**
 * 공개 범위(설계 6절) — 같은 프로젝트 로그인 사용자는 방·날짜·반을 본다. 다른 프로젝트·비로그인은 줄 자체가 안 보인다.
 * 누른 계정 id·메모는 관리 3역할 · 그 예약을 만든 본인에게만(`user_id` 는 암호문 안 — 누가 어느 반을 얼마나 쓰나가 새지 않게).
 */
import type { ReservationRow, Viewer } from './types';

export const isManager = (v: Viewer): boolean => v.role === '관리자' || v.role === '교감' || v.role === '교무';
export type VisibleReservation = Omit<ReservationRow, 'body'> & { body: { userId: string | null; userName: string; note: string | null } };

export function applyVisibility(rows: ReservationRow[], v: Viewer): VisibleReservation[] {
    if (!v.loggedIn) return [];
    return rows.filter((r) => r.projectId === v.projectId).map((r) => {
        const own = v.userId !== null && r.body.userId === v.userId;
        const detail = isManager(v) || own;
        return { ...r, body: { userId: detail ? r.body.userId : null, userName: r.body.userName, note: detail ? r.body.note : null } };
    });
}

/** 내 예약 — 날짜 범위의 행 중 누른 계정이 나인 것. */
export const mine = (rows: ReservationRow[], v: Viewer): ReservationRow[] => v.userId === null ? [] : rows.filter((r) => r.projectId === v.projectId && r.body.userId === v.userId);

/** 취소 권한 — 본인 또는 관리 3역할. */
export const canCancel = (r: ReservationRow, v: Viewer): boolean => v.loggedIn && r.projectId === v.projectId && (isManager(v) || r.body.userId === v.userId);
