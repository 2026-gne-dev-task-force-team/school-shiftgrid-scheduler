// ④ 1절·③ 11-2 조각별 읽기·쓰기 역할 — PUT 차례 1(403)과 GET 의 `ops.aux` 가림. 순수.
// 관리자는 전부 통과한다(④ 1절 표 밑 줄). `ops.aux` 의 「관리자는 마감 해제만」·`ops.changes` 의 「교사는 추가·삭제만」은
// 옛 판과 비교하는 차이 규칙이라 B7(check.ts) 몫 — 여기선 조각 단위로 문만 연다.

import type { Role } from '../../../shared/roles.ts';
import { isLimitedPart } from '../../../shared/check/limits.ts';

/** 조각 → 쓰는 역할(관리자 빼고). `doc@<n>` 은 표에 없다 — 서버만 쓴다. */
export const PART_WRITERS: Readonly<Record<string, readonly Role[]>> = {
    doc: [],
    'ops.rooms': ['교무', '교감'],
    'ops.calendar': ['근태담당', '교무', '교감'],
    'ops.changes': ['근태담당', '교무', '교감', '교사'],
    'ops.fixed': ['교무', '교감'],
    'ops.classSubjects': ['교무', '교감'],
    'ops.aux': ['근태담당'],
    'ops.settings': [],
    'ops.installed': [],
};

/** 읽기를 가르는 조각(없는 조각은 구성원 전부) */
export const PART_READERS: Readonly<Record<string, readonly Role[]>> = {
    'ops.aux': ['근태담당'],
};

const isAdmin = (roles: readonly Role[]) => roles.includes('관리자');

/** 쓰기 문이 열린 조각 이름인가(보관 `doc@<n>`·모르는 이름은 거짓) */
export const isWritablePart = (part: string): boolean => isLimitedPart(part) && part in PART_WRITERS;

export function canWritePart(roles: readonly Role[], part: string): boolean {
    if (!isWritablePart(part)) return false;
    return isAdmin(roles) || roles.some((r) => PART_WRITERS[part].includes(r));
}

export function canReadPart(roles: readonly Role[], part: string): boolean {
    const only = PART_READERS[part];
    return !only || isAdmin(roles) || roles.some((r) => only.includes(r));
}
