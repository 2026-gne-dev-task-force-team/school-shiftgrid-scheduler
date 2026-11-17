// B7 — parts PUT 본문 꼴 검사 + 옛 판과의 차이(diff) 판정. ③ 11-2 · S9. 새 의존성 없는 손 검사기(shared/check 꼴).
//   꼴: 걸린 칸마다 규칙 id 한 줄 `<조각>.<칸경로>` → handler 가 400 check_failed {rules} 로 돌려준다(본문은 싣지 않음).
//   차이: ops.changes — 「남의 줄 고치기」 권한(days.changesAny)이 없으면(교사) 추가·삭제만, 기존 줄 수정은 403 changes_edit_forbidden.
//         ops.aux — 월 마감(monthClose) 줄의 수정·삭제는 관리자만, 아니면 403 month_close_admin_only(추가는 칸 쓰기 역할이면 된다).
//   날짜별 배정·예외의 마감 잠금(409)은 src/plugins/ops-aux/month/judge.ts 몫이라 여기서 되풀이하지 않는다.

import { can, type Role } from '../../../shared/roles.ts';
import { HttpError } from '../_shared/errors.ts';
import type { PartCheck } from './handler.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** id 가 든 줄 배열의 꼴 — 줄 검사가 칸 이름을 돌려주면 `<경로>[i].<칸>` 을, id 가 겹치면 `<경로>[i].id` 를 낸다. */
function checkRows(path: string, v: unknown, ok: (e: Record<string, unknown>) => string | null): string[] {
    if (!Array.isArray(v)) return [path];
    const out: string[] = [];
    const seen = new Set<string>();
    v.forEach((e, i) => {
        if (!isObj(e) || !isStr(e.id)) {
            out.push(`${path}[${i}].id`);
            return;
        }
        if (seen.has(e.id)) out.push(`${path}[${i}].id`);
        seen.add(e.id);
        const bad = ok(e);
        if (bad) out.push(`${path}[${i}].${bad}`);
    });
    return out;
}

const firstBad = (e: Record<string, unknown>, checks: Record<string, (x: unknown) => boolean>): string | null =>
    Object.keys(checks).find((k) => !checks[k](e[k])) ?? null;

export function shapeRules(part: string, body: unknown): string[] {
    switch (part) {
        case 'ops.changes':
            return checkRows(part, body, (e) => firstBad(e, { date: isStr, trackName: isStr, period: (x) => x === null || isNum(x) }));
        case 'ops.aux': {
            if (!isObj(body)) return [part];
            return ['staff', 'conditions', 'base', 'day', 'exceptions', 'monthClose'].flatMap((k) => {
                if (!(k in body)) return [];
                if (k !== 'monthClose') return Array.isArray(body[k]) ? [] : [`${part}.${k}`];
                return checkRows(`${part}.monthClose`, body[k], (e) =>
                    firstBad(e, { staffId: isStr, ym: (x) => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x) }),
                );
            });
        }
        default:
            return [];
    }
}

const byId = (v: unknown): Map<string, string> =>
    new Map((Array.isArray(v) ? v : []).filter(isObj).map((e) => [String(e.id), JSON.stringify(e)]));

/** 옛 줄 중 새 판에서 값이 바뀐 것(지워진 것은 제외) */
const editedIds = (prev: unknown, next: unknown): string[] => {
    const b = byId(next);
    return [...byId(prev)].filter(([id, s]) => b.has(id) && b.get(id) !== s).map(([id]) => id);
};
const removedIds = (prev: unknown, next: unknown): string[] => {
    const b = byId(next);
    return [...byId(prev).keys()].filter((id) => !b.has(id));
};

export function diffCheck(part: string, roles: readonly Role[], prev: unknown, next: unknown): void {
    if (prev === null || prev === undefined) return; // 첫 판은 비교할 옛 줄이 없다
    if (part === 'ops.changes') {
        if (!can(roles, 'days.changesAny') && editedIds(prev, next).length > 0)
            throw new HttpError(403, 'changes_edit_forbidden', '시간표 변경은 추가·삭제만 할 수 있습니다');
    } else if (part === 'ops.aux') {
        const p = isObj(prev) ? prev.monthClose : undefined;
        const n = isObj(next) ? next.monthClose : undefined;
        if (!roles.includes('관리자') && (editedIds(p, n).length > 0 || removedIds(p, n).length > 0))
            throw new HttpError(403, 'month_close_admin_only', '월 마감 줄의 수정·해제는 관리자만 할 수 있습니다');
    }
}

/** handler 의 `deps.check` 로 꽂는다. 꼴 → 차이 차례(꼴이 틀리면 차이는 보지 않는다). */
export const checkPart: PartCheck = ({ part, roles, next, prev }) => {
    const rules = shapeRules(part, next.body);
    if (rules.length > 0) return rules;
    diffCheck(part, roles, prev?.body, next.body);
    return [];
};
