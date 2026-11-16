/**
 * 특별실 예약·취소(설계 6-2) — 입력 검사 → 칸 규칙(정본 `shared/room-rules.ts` decideReserve) → 저장 창구에 맡김(자리 번호는 창구가 고른다).
 * 판정은 서버가 다시 한다 — 여기는 화면이 할 수 있는 만큼과 가짜 어댑터 시험용이다. 지난 날은 예약·취소 둘 다 400.
 */
import { decideReserve } from '../../../../shared/room-rules.ts';
import { ruleInput } from './rules';
import type { RoomSource } from './source';
import type { ReservationRow, Viewer } from './types';
import { canCancel } from './visibility';

export interface BookInput { roomId: string; date: string; start: string; end: string; trackName: string; note: string }
export interface BookCtx { viewer: Viewer; userName: string; today: string; now: () => string; newId: () => string }
export type Fail = { ok: false; status: 400 | 403 | 404 | 409; message: string };
export type BookResult = { ok: true; row: ReservationRow } | Fail;
export type CancelResult = { ok: true } | Fail;
export const NOTE_MAX = 200;

const hhmm = (s: string): number | null => {
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const validDate = (s: string): boolean => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const bad = (status: Fail['status'], message: string): Fail => ({ ok: false, status, message });

export async function bookRoom(src: RoomSource, input: BookInput, ctx: BookCtx): Promise<BookResult> {
    if (!ctx.viewer.loggedIn) return bad(403, '로그인이 필요합니다.');
    if (!validDate(input.date)) return bad(400, '날짜는 2026-11-12 꼴로 적어 주세요.');
    const s = hhmm(input.start); const e = hhmm(input.end);
    if (s === null || e === null || e <= s) return bad(400, '시각은 09:40 ~ 10:20 꼴로, 끝이 시작보다 늦게 적어 주세요.');
    if (!input.trackName.trim()) return bad(400, '반을 적어 주세요.');
    if (input.note.length > NOTE_MAX) return bad(400, `메모는 ${NOTE_MAX}자까지입니다.`);
    const part = await src.loadPart();
    const room = part.rooms.find((r) => r.id === input.roomId);
    const track = input.trackName.trim();
    const rows = await src.loadReservations(input.date);
    const v = decideReserve({ ...ruleInput(part, input.date, s, e, rows, ctx.viewer.userId ?? '', ctx.today), room: room?.active ? room : null }, { date: input.date, startMin: s, trackName: track });
    if (!v.ok) return bad(v.status, v.error);
    const r = await src.saveReservation({
        id: ctx.newId(), projectId: ctx.viewer.projectId ?? '', roomId: input.roomId, date: input.date, startMin: s, endMin: v.endMin,
        trackName: track, createdAt: ctx.now(), body: { userId: ctx.viewer.userId ?? '', userName: ctx.userName, note: input.note },
    });
    if (r.ok) return r;
    if (r.conflict === 'track') return bad(409, `${track} 은 이미 이 칸을 예약했습니다`);
    return bad(409, r.conflict === 'full' ? '자리 없음 — 방금 다른 반이 차지했습니다' : '방금 다른 분이 바꿨습니다 — 다시 불러옵니다.');
}

/** 취소 — 본인 또는 관리 3역할. 지난 예약은 아무도 못 지운다(관리자 예외 없음). etag 가 어긋나면 되묻기용 409. */
export async function cancelReservation(src: RoomSource, row: ReservationRow, ctx: BookCtx): Promise<CancelResult> {
    if (!canCancel(row, ctx.viewer)) return bad(403, '내 예약이 아니면 취소할 수 없습니다.');
    if (row.date < ctx.today) return bad(400, '지난 예약은 취소할 수 없습니다.');
    const r = await src.deleteReservation(row.id, { ifMatch: row.createdAt });
    if (r.ok) return r;
    return r.conflict === 'missing' ? bad(404, '이미 취소된 예약입니다.') : bad(409, '방금 다른 분이 바꿨습니다 — 다시 불러옵니다.');
}
