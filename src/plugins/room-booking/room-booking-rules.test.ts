/**
 * 방 예약 저장 전 규칙 — 정원 초과·차단 시간·이미 고정된 방·쓰지 않는 방 거절, 통과, 거절 사유가 토스트로 보임. (지어낸 방 이름만)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Room, RoomProps, Rooms } from '../rooms/contracts/rooms';
import type { EventDraft, SaveContext } from '../calendar/contracts/calendar';
import { judgeBooking, readRuleCells } from './rules';
import { ROOM_BOOKING_PRESET, roomBookingPlugin } from './index';

// 2026-11-16 = 월요일(dayIndex 0) · 11-17 = 화요일
const room = (ext: Record<string, unknown> = {}): Room => ({ id: 'r1', listId: 'l1', name: '가상 별채', ext: { 'room-booking': ext } });
const props = (p: Partial<RoomProps> = {}): RoomProps => ({ active: true, ...p });
const draft = (start: string, end: string, values: Record<string, unknown> = {}, allDay = false): EventDraft => ({ name: '모임', start, end, allDay, memo: '', values });

const FIXED = { fixed: [{ dayIndex: 0, startMin: 600, endMin: 660, label: '가상 동아리' }] };
const BLOCK = { blocks: [{ startDate: '2026-11-17', endDate: '2026-11-18', fromMin: null, toMin: null, reason: '바닥 공사' }] };

describe('judgeBooking — 순수 규칙', () => {
    it('정원보다 많은 인원이면 거절하고 정원 이하면 통과한다', () => {
        const r = room();
        expect(judgeBooking(r, props({ capacity: 4 }), draft('2026-11-16T09:00', '2026-11-16T10:00', { f_headcount: 5 }))).toContain('정원은 4명');
        expect(judgeBooking(r, props({ capacity: 4 }), draft('2026-11-16T09:00', '2026-11-16T10:00', { f_headcount: 4 }))).toBeNull();
        expect(judgeBooking(r, props(), draft('2026-11-16T09:00', '2026-11-16T10:00', { f_headcount: 99 }))).toBeNull();
    });

    it('쓰지 않는 방이면 거절한다', () => {
        expect(judgeBooking(room(), props({ active: false }), draft('2026-11-16T09:00', '2026-11-16T10:00'))).toContain('쓰지 않는 방');
    });

    it('이미 고정된 시간(요일·시각 겹침)이면 거절하고, 겹치지 않으면 통과한다', () => {
        const r = room(FIXED);
        expect(judgeBooking(r, props(), draft('2026-11-16T10:30', '2026-11-16T11:30'))).toContain('가상 동아리');
        expect(judgeBooking(r, props(), draft('2026-11-16T11:00', '2026-11-16T12:00'))).toBeNull();
        expect(judgeBooking(r, props(), draft('2026-11-17T10:30', '2026-11-17T11:30'))).toBeNull();
    });

    it('차단 기간이면 거절한다 — 여러 날·종일 일정이 차단 날에 걸려도 잡는다', () => {
        const r = room(BLOCK);
        expect(judgeBooking(r, props(), draft('2026-11-17T09:00', '2026-11-17T10:00'))).toContain('바닥 공사');
        expect(judgeBooking(r, props(), draft('2026-11-16T09:00', '2026-11-17T10:00'))).toContain('바닥 공사');
        expect(judgeBooking(r, props(), draft('2026-11-17T00:00', '2026-11-18T00:00', {}, true))).toContain('바닥 공사');
        expect(judgeBooking(r, props(), draft('2026-11-19T09:00', '2026-11-19T10:00'))).toBeNull();
    });

    it('시간대 차단은 그 시각만 막는다', () => {
        const r = room({ blocks: [{ startDate: '2026-11-16', endDate: '2026-11-16', fromMin: 780, toMin: 840, reason: '점검' }] });
        expect(judgeBooking(r, props(), draft('2026-11-16T13:10', '2026-11-16T13:50'))).toContain('점검');
        expect(judgeBooking(r, props(), draft('2026-11-16T09:00', '2026-11-16T10:00'))).toBeNull();
    });

    it('ext 값이 틀린 줄은 그 줄만 무시한다', () => {
        const cells = readRuleCells(room({ fixed: [{ dayIndex: 9, startMin: 1, endMin: 2 }, { dayIndex: 1, startMin: 60, endMin: 120 }, 'x'], blocks: [{ startDate: '2026-11-20', endDate: '2026-11-10' }] }), 'r1');
        expect(cells.fixed).toHaveLength(1);
        expect(cells.blocks).toHaveLength(0);
    });
});

describe('프리셋 beforeSave — 방 칸·거절 알림', () => {
    const notify = vi.fn();
    const ctx = {} as SaveContext;
    function activate(r: Room | undefined, p: RoomProps) {
        const roomsApi = { room: () => r, roomProps: () => p } as unknown as Rooms;
        roomBookingPlugin.lifecycle!.onActivate!({ modules: { use: (n: string) => (n === 'rooms' ? roomsApi : null) }, notify } as unknown as PluginHost);
    }
    beforeEach(() => { notify.mockClear(); });

    it('고정된 방을 고르면 거절 사유가 돌아오고 토스트로 보인다', () => {
        activate(room(FIXED), props());
        const v = ROOM_BOOKING_PRESET.beforeSave!(draft('2026-11-16T10:00', '2026-11-16T11:00', { f_room: ['r1'] }), ctx);
        expect(v).toMatchObject({ ok: false });
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0]).toMatchObject({ level: 'warn', title: '예약할 수 없습니다' });
        expect((v as { reason: string }).reason).toContain('가상 동아리');
    });

    it('방 칸이 비었거나 방을 못 찾으면 통과한다(알림 없음)', () => {
        activate(room(FIXED), props());
        expect(ROOM_BOOKING_PRESET.beforeSave!(draft('2026-11-16T10:00', '2026-11-16T11:00'), ctx)).toEqual({ ok: true });
        activate(undefined, props());
        expect(ROOM_BOOKING_PRESET.beforeSave!(draft('2026-11-16T10:00', '2026-11-16T11:00', { f_room: 'zz' }), ctx)).toEqual({ ok: true });
        expect(notify).not.toHaveBeenCalled();
    });

    it('방 관계 칸 값이 문자열이어도 읽는다 · 정원 초과 거절', () => {
        activate(room(), props({ capacity: 2 }));
        expect(ROOM_BOOKING_PRESET.beforeSave!(draft('2026-11-16T10:00', '2026-11-16T11:00', { f_room: 'r1', f_headcount: 3 }), ctx)).toMatchObject({ ok: false });
    });

    it('「인원」 숫자 칸이 기본 칸으로 깔린다', () => {
        const f = (ROOM_BOOKING_PRESET.baseFields as (s: { id: string; data: Record<string, unknown> }) => { key: string; type: string }[])({ id: 's', data: { roomListId: 'l' } });
        expect(f.map((x) => [x.key, x.type])).toEqual([['f_room', 'relation'], ['f_headcount', 'number']]);
    });
});
