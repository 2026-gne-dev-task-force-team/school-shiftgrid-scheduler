/**
 * 방 예약 저장 전 규칙 — 판정은 정본 `shared/room-rules.ts`(roomDay) 한 곳을 재사용한다(서버 `rooms` 함수와 같은 규칙 파일 · 건드리지 않는다).
 *   🔴 방 속성은 rooms 의 ext['room-booking'] 에만 둔다 — 여기엔 저장소가 없다. 읽기는 rooms 약속(room·roomProps)으로만.
 *   ext['room-booking'] 안 칸: capacity(정원) · active(쓰는 방) 는 roomProps 가 읽고, fixed(고정 사용)·blocks(차단 시간)는 이 파일이 ext 에서 읽는다.
 *   순수 함수 — 노드·화면을 모른다(시험하기 쉽게).
 */
import { addDays, dayIndexOf, roomDay, type Room as RuleRoom, type RoomBlock, type RoomFixed } from '../../../shared/room-rules.ts';
import type { Room, RoomProps } from '../rooms/contracts/rooms';
import type { EventDraft } from '../calendar/contracts/calendar';

/** 예약 칸 key — 방 관계 칸 · 인원 숫자 칸(정원 비교용). */
export const ROOM_FIELD = 'f_room';
export const HEADCOUNT_FIELD = 'f_headcount';
/** ext 이름공간 — 방 목록(rooms) 쪽과 같은 플러그인 id. */
export const EXT_KEY = 'room-booking';

const MAX_DAYS = 31;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

/** ext 에서 읽은 규칙 칸 — 값이 틀린 줄은 건너뛴다(그 줄만 무시). */
export function readRuleCells(room: Room, roomId: string): { fixed: RoomFixed[]; blocks: RoomBlock[] } {
    const mine = rec(room.ext?.[EXT_KEY]);
    const fixed: RoomFixed[] = [];
    (Array.isArray(mine.fixed) ? mine.fixed : []).forEach((x, i) => {
        const f = rec(x);
        if (isInt(f.dayIndex) && f.dayIndex >= 0 && f.dayIndex <= 6 && isInt(f.startMin) && isInt(f.endMin) && f.startMin < f.endMin) {
            fixed.push({ id: `fx${i}`, roomId, dayIndex: f.dayIndex, startMin: f.startMin, endMin: f.endMin, label: isStr(f.label) ? f.label : '' });
        }
    });
    const blocks: RoomBlock[] = [];
    (Array.isArray(mine.blocks) ? mine.blocks : []).forEach((x, i) => {
        const b = rec(x);
        if (isStr(b.startDate) && isStr(b.endDate) && b.startDate <= b.endDate) {
            blocks.push({
                id: `bk${i}`, roomId, startDate: b.startDate, endDate: b.endDate,
                fromMin: isInt(b.fromMin) ? b.fromMin : null, toMin: isInt(b.toMin) ? b.toMin : null, reason: isStr(b.reason) ? b.reason : '',
            });
        }
    });
    return { fixed, blocks };
}

const minOf = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

/** 방 관계 칸 값 → 방 id(문자열 하나 또는 배열의 첫 것) — 비면 ''. */
export function roomIdOf(values: Record<string, unknown>): string {
    const v = values[ROOM_FIELD];
    const id = Array.isArray(v) ? v[0] : v;
    return isStr(id) ? id : '';
}

/**
 * 거절 사유(선생님 말) — 통과면 null. 순서: 쓰지 않는 방 → 정원 → 차단 시간 → 이미 고정된 방.
 *   날짜를 하루씩 쪼개 정본 roomDay 에 넣는다(여러 날 일정도 같은 규칙) · 종일은 하루 전체 · 31일 넘는 구간은 앞 31일만 본다.
 */
export function judgeBooking(room: Room, props: RoomProps, draft: Pick<EventDraft, 'start' | 'end' | 'allDay' | 'values'>): string | null {
    if (!props.active) return `「${room.name}」은 지금 쓰지 않는 방이라 예약할 수 없습니다.`;
    const head = draft.values[HEADCOUNT_FIELD];
    if (typeof head === 'number' && props.capacity !== undefined && head > props.capacity) {
        return `「${room.name}」의 정원은 ${props.capacity}명입니다. ${head}명은 들어갈 수 없습니다.`;
    }
    const { fixed, blocks } = readRuleCells(room, room.id);
    if (!fixed.length && !blocks.length) return null;
    const rule: RuleRoom = { id: room.id, name: room.name, capacity: props.capacity ?? 1, resourceKey: null, active: true, sort: props.sort ?? 0, note: '' };
    const d0 = draft.start.slice(0, 10);
    // 반열린 끝 — 종일·자정 끝이면 끝 날짜는 포함하지 않는다.
    const endIso = draft.end.slice(0, 10);
    const lastDay = draft.end.slice(11) === '00:00' && endIso > d0 ? addDays(endIso, -1) : endIso;
    let blockedBy: string | null = null;
    let fixedBy: string | null = null;
    for (let date = d0, n = 0; date <= lastDay && n < MAX_DAYS; date = addDays(date, 1), n++) {
        const s = draft.allDay || date > d0 ? 0 : minOf(draft.start.slice(11));
        const e = draft.allDay || date < lastDay || draft.end.slice(11) === '00:00' ? 1440 : minOf(draft.end.slice(11));
        if (e <= s) continue;
        const day = roomDay({ room: rule, date, dayIndex: dayIndexOf(date), schoolDay: true, times: [{ startMin: s, endMin: e }], fixed, blocks, me: '', today: '' });
        const cell = day.cells[0];
        if (cell?.blocked && !blockedBy) blockedBy = `${date} 은 막혀 있습니다(${cell.blocked}).`;
        if (cell?.fixed.length && !fixedBy) {
            const labels = cell.fixed.map((f) => f.label).filter(Boolean);
            fixedBy = `${date} 은 이미 고정으로 쓰는 시간입니다${labels.length ? `(${labels.join(', ')})` : ''}.`;
        }
    }
    if (blockedBy) return `「${room.name}」 ${blockedBy}`;
    if (fixedBy) return `「${room.name}」 ${fixedBy}`;
    return null;
}
