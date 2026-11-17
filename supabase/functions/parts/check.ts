// B7 — parts PUT 본문 꼴 검사 + 옛 판과의 차이(diff) 판정. ③ 11-2 · S9. 새 의존성 없는 손 검사기(shared/check 꼴).
//   꼴: 걸린 칸마다 규칙 id 한 줄 `<조각>.<칸경로>` → handler 가 400 check_failed {rules} 로 돌려준다(본문은 싣지 않음).
//   차이: ops.changes — 「남의 줄 고치기」 권한(days.changesAny)이 없으면(교사) 추가·삭제만, 기존 줄 수정은 403 changes_edit_forbidden.
//         ops.aux — 월 마감(monthClose) 줄의 수정·삭제는 관리자만, 아니면 403 month_close_admin_only(추가는 칸 쓰기 역할이면 된다).
//         날짜별 배정(day)·예외(exceptions)가 마감된 (보조, 달)에 걸리면 409 month_closed — 판정은 앱과 같은 shared/ops-aux/month-lock.ts
//         (관리자도 막힌다 · 「정정」 예외 추가만 허용). ops.changes 는 보조·달 축이 없어 마감 잠금 대상이 아니다(앱 판정과 같음).

import { judgeAuxChange, type LockDay, type LockException, type LockMonthClose } from '../../../shared/ops-aux/month-lock.ts';
import { fixedDuplicates, removedRoomsWithReservations, type RoomFixed } from '../../../shared/room-rules.ts';
import { can, type Role } from '../../../shared/roles.ts';
import { HttpError } from '../_shared/errors.ts';
import type { PartCheck } from './handler.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isDate = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMin = (v: unknown): boolean => isInt(v, 0, 1440);
const nullOr = (f: (x: unknown) => boolean) => (x: unknown) => x === null || f(x);

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
        case 'ops.rooms':
            return roomsShape(part, body);
        default:
            return [];
    }
}

/** ops.rooms — 설계 ① 6절 `{rooms, fixed, blocks}`. 꼴 → 방 참조 → 고정 (방, 요일, 시작) 겹침(shared/room-rules.ts 와 같은 판정). */
function roomsShape(part: string, body: unknown): string[] {
    if (!isObj(body)) return [part];
    const out: string[] = [];
    const rows = (k: string, ok: (e: Record<string, unknown>) => string | null) => {
        if (k in body) out.push(...checkRows(`${part}.${k}`, body[k], ok));
    };
    rows('rooms', (e) =>
        firstBad(e, { name: isStr, capacity: (x) => isInt(x, 1, 20), resourceKey: nullOr(isStr), active: (x) => typeof x === 'boolean', sort: isNum, note: (x) => typeof x === 'string' }),
    );
    rows('fixed', (e) =>
        firstBad(e, { roomId: isStr, dayIndex: (x) => isInt(x, 0, 6), startMin: isMin, endMin: isMin, label: (x) => typeof x === 'string' }) ??
        ((e.endMin as number) > (e.startMin as number) ? null : 'endMin'),
    );
    rows('blocks', (e) =>
        firstBad(e, { roomId: isStr, startDate: isDate, endDate: isDate, fromMin: nullOr(isMin), toMin: nullOr(isMin), reason: (x) => typeof x === 'string' }) ??
        ((e.endDate as string) >= (e.startDate as string) ? null : 'endDate'),
    );
    if (out.length > 0) return out;
    // 고정·차단이 가리키는 방은 이 칸의 방 목록에 있어야 한다(방 목록이 없는 본문은 참조를 보지 않는다)
    if (Array.isArray(body.rooms)) {
        const ids = new Set((body.rooms as { id: string }[]).map((r) => r.id));
        for (const k of ['fixed', 'blocks']) {
            if (Array.isArray(body[k])) (body[k] as { roomId: string }[]).forEach((e, i) => ids.has(e.roomId) || out.push(`${part}.${k}[${i}].roomId`));
        }
    }
    if (Array.isArray(body.fixed)) {
        const list = body.fixed as RoomFixed[];
        for (const [, dup] of fixedDuplicates(list)) out.push(`${part}.fixed[${list.findIndex((f) => f.id === dup)}].startMin`);
    }
    return out;
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

/** 마감 판정에 넣을 줄만 추린다 — 판정 칸(id·staffId·date|ym)이 글자가 아닌 줄은 어느 달에도 걸리지 않는다. 빠진 칸은 빈 목록. */
const rowsWith = <T>(v: unknown, keys: string[]): T[] =>
    (Array.isArray(v) ? v : []).filter((e): e is Record<string, unknown> => isObj(e) && keys.every((k) => typeof e[k] === 'string')) as T[];
const monthState = (body: unknown) => {
    const b = isObj(body) ? body : {};
    return {
        day: rowsWith<LockDay>(b.day, ['id', 'staffId', 'date']),
        exceptions: rowsWith<LockException>(b.exceptions, ['id', 'staffId', 'date']),
        monthClose: rowsWith<LockMonthClose>(b.monthClose, ['id', 'staffId', 'ym']),
    };
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
        const j = judgeAuxChange(monthState(prev), monthState(next), roles);
        if (!j.ok) throw j.status === 409 ? new HttpError(409, 'month_closed', j.reason) : new HttpError(403, 'month_close_admin_only', j.reason);
    }
}

/** 예약 행 조회 — 주어진 방 id 중 예약 행이 하나라도 남은 방의 id. 가짜로 시험하고, 실제 꽂기는 rooms/store.ts 의 읽기(listFrom 등)를 감싼다. */
export interface CheckDeps {
    reservedRooms?: (roomIds: string[]) => Promise<ReadonlySet<string>>;
}

/** ops.rooms 방 삭제 — 예약 행이 남은 방이 칸에서 빠지면 409. 조회 함수가 꽂히지 않았으면 이 판정은 건너뛴다(꽂는 쪽 몫). */
async function roomsDiff(deps: CheckDeps, prev: unknown, next: unknown): Promise<void> {
    if (!deps.reservedRooms || !isObj(prev) || !isObj(next)) return;
    const gone = removedIds(prev.rooms, next.rooms);
    if (gone.length === 0) return;
    const reserved = await deps.reservedRooms(gone);
    const bad = removedRoomsWithReservations(prev.rooms as { id: string }[], Array.isArray(next.rooms) ? (next.rooms as { id: string }[]) : [], reserved);
    if (bad.length > 0) throw new HttpError(409, 'room_has_reservations', '예약이 있는 방은 지울 수 없습니다(끄기만 가능)', { roomIds: bad });
}

/** handler 의 `deps.check` 로 꽂는다. 꼴 → 차이 차례(꼴이 틀리면 차이는 보지 않는다). ops.rooms 만 예약 조회 때문에 Promise 를 돌려준다. */
export const makeCheckPart =
    (deps: CheckDeps): PartCheck =>
    ({ part, roles, next, prev }) => {
        const rules = shapeRules(part, next.body);
        if (rules.length > 0) return rules;
        if (part === 'ops.rooms') return roomsDiff(deps, prev?.body, next.body).then(() => []);
        diffCheck(part, roles, prev?.body, next.body);
        return [];
    };

export const checkPart: PartCheck = makeCheckPart({});
