import { describe, expect, it } from 'vitest';
import { applyVisibility, bookRoom, cancelReservation, demoPart, freeRooms, memoryRoomSource, mine, type BookCtx, type BookInput, type Viewer } from './index';

const viewer = (o: Partial<Viewer> = {}): Viewer => ({ loggedIn: true, projectId: 'p1', userId: 'u-a', role: '교사', ...o });
let n = 0;
const ctx = (v: Viewer = viewer(), today = '2026-11-12'): BookCtx => ({ viewer: v, userName: '가짜갑', today, now: () => `t${++n}`, newId: () => `id${++n}` });
// 2026-11-16 = 월요일
const input = (o: Partial<BookInput> = {}): BookInput => ({ roomId: 'r-yard', date: '2026-11-16', start: '09:40', end: '10:20', trackName: '1-1', note: '', ...o });

describe('특별실 QA', () => {
    it('잠금: 고정 수업 칸은 빈자리 0 · 직접 쏴도 409', async () => {
        const part = demoPart();
        part.fixed.push({ id: 'f1', roomId: 'r-sci', dayIndex: 0, startMin: 580, endMin: 620, label: '동아리' });
        const src = memoryRoomSource(part);
        const r = await bookRoom(src, input({ roomId: 'r-sci' }), ctx());
        expect(r).toMatchObject({ ok: false, status: 409, message: '고정 수업이 있는 칸' });
        expect(freeRooms(part, '2026-11-16', 580, 620, []).map((x) => x.room.id)).toEqual(['r-yard']);
        // 시간표 배치도 같다
        part.timetable.push({ id: 't1', roomId: 'r-yard', dayIndex: 0, startMin: 590, endMin: 630, label: '' });
        expect(await bookRoom(src, input(), ctx())).toMatchObject({ ok: false, status: 409 });
    });
    it('정원·자리 번호: 정원 3 — 자리 1·2·3 · 넷째 반 409 · 같은 반 두 번 409', async () => {
        const src = memoryRoomSource(demoPart());
        const slots: number[] = [];
        for (const t of ['1-1', '1-2', '1-3']) { const r = await bookRoom(src, input({ trackName: t }), ctx()); expect(r.ok).toBe(true); if (r.ok) slots.push(r.row.slotNo); }
        expect(slots).toEqual([1, 2, 3]);
        expect(await bookRoom(src, input({ trackName: '1-4' }), ctx())).toMatchObject({ ok: false, status: 409, message: '자리 없음' });
        const src2 = memoryRoomSource(demoPart());
        await bookRoom(src2, input(), ctx());
        expect(await bookRoom(src2, input(), ctx())).toMatchObject({ ok: false, status: 409 });
    });
    it('동시에 눌러도 같은 반은 하나, 다른 반은 다른 자리', async () => {
        const src = memoryRoomSource(demoPart());
        const rs = await Promise.all([bookRoom(src, input(), ctx()), bookRoom(src, input(), ctx()), bookRoom(src, input({ trackName: '2-1' }), ctx())]);
        expect(rs.filter((r) => r.ok).length).toBe(2);
        const rows = await src.loadReservations('2026-11-16');
        expect(new Set(rows.map((r) => r.slotNo)).size).toBe(2);
    });
    it('지난 날: 어제 예약·취소 둘 다 400 (관리자도)', async () => {
        const src = memoryRoomSource(demoPart(), [{ id: 'old', projectId: 'p1', roomId: 'r-yard', date: '2026-11-11', startMin: 580, endMin: 620, slotNo: 1, trackName: '3-1', createdAt: 'c', body: { userId: 'u-a', userName: '가짜갑', note: '' } }]);
        expect(await bookRoom(src, input({ date: '2026-11-11' }), ctx())).toMatchObject({ ok: false, status: 400 });
        const [row] = await src.loadReservations('2026-11-11');
        expect(await cancelReservation(src, row, ctx())).toMatchObject({ ok: false, status: 400 });
        expect(await cancelReservation(src, row, ctx(viewer({ userId: 'u-adm', role: '관리자' })))).toMatchObject({ ok: false, status: 400 });
    });
});

describe('차단 · 취소 · etag · 공개 범위', () => {
    it('차단 기간은 409, 시각이 안 겹치면 통과', async () => {
        const part = demoPart();
        part.blocks.push({ id: 'b', roomId: 'r-yard', startDate: '2026-11-16', endDate: '2026-11-16', fromMin: 540, toMin: 560, reason: '공사' });
        const src = memoryRoomSource(part);
        expect(await bookRoom(src, input({ start: '09:00', end: '09:30' }), ctx())).toMatchObject({ ok: false, status: 409 });
        expect((await bookRoom(src, input(), ctx())).ok).toBe(true);
    });
    it('입력 검사', async () => {
        const src = memoryRoomSource(demoPart());
        for (const o of [{ date: '2026-13-01' }, { start: '10:20', end: '09:40' }, { trackName: ' ' }, { note: 'x'.repeat(201) }]) {
            expect(await bookRoom(src, input(o), ctx())).toMatchObject({ ok: false, status: 400 });
        }
        expect(await bookRoom(src, input({ roomId: 'none' }), ctx())).toMatchObject({ ok: false, status: 404 });
    });
    it('취소: 본인·관리자 가능, 남은 403, etag 어긋나면 409', async () => {
        const src = memoryRoomSource(demoPart());
        const r = await bookRoom(src, input(), ctx());
        if (!r.ok) throw new Error('x');
        expect(await cancelReservation(src, r.row, ctx(viewer({ userId: 'u-b' })))).toMatchObject({ ok: false, status: 403 });
        expect(await cancelReservation(src, { ...r.row, createdAt: 'stale' }, ctx())).toMatchObject({ ok: false, status: 409 });
        expect(await cancelReservation(src, r.row, ctx(viewer({ userId: 'u-adm', role: '교무' })))).toEqual({ ok: true });
        expect(await cancelReservation(src, r.row, ctx())).toMatchObject({ ok: false, status: 404 });
    });
    it('공개 범위: 다른 프로젝트·비로그인은 안 보이고, 남의 계정 id·메모는 가린다', async () => {
        const src = memoryRoomSource(demoPart());
        await bookRoom(src, input({ note: '비공개 메모' }), ctx());
        const rows = await src.loadReservations('2026-11-16');
        expect(applyVisibility(rows, viewer({ loggedIn: false }))).toEqual([]);
        expect(applyVisibility(rows, viewer({ projectId: 'p2' }))).toEqual([]);
        expect(applyVisibility(rows, viewer({ userId: 'u-b' }))[0].body).toMatchObject({ userId: null, note: null, userName: '가짜갑' });
        expect(applyVisibility(rows, viewer())[0].body).toMatchObject({ userId: 'u-a', note: '비공개 메모' });
        expect(applyVisibility(rows, viewer({ userId: 'u-b', role: '교감' }))[0].body.userId).toBe('u-a');
        expect(mine(rows, viewer()).length).toBe(1);
        expect(mine(rows, viewer({ userId: 'u-b' })).length).toBe(0);
    });
});
