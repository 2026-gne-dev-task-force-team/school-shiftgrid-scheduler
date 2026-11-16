// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { demoPart, localRoomSource } from './source';
import type { ReservationRequest } from './types';

beforeEach(() => { localStorage.clear(); });

const row = (over: Partial<ReservationRequest> = {}): ReservationRequest => ({
    id: 'x1', roomId: 'r-sci', date: '2026-11-19', startMin: 540, endMin: 580, trackName: '1-1', createdAt: 't1', ...over,
} as ReservationRequest);

describe('localRoomSource — 다시 만들어도 값이 남는다', () => {
    it('예약 하나를 넣은 뒤 창구를 새로 만들어도 남는다', async () => {
        const a = localRoomSource(demoPart);
        expect((await a.saveReservation(row())).ok).toBe(true);
        const b = localRoomSource(demoPart);
        expect((await b.loadReservations('2026-11-19')).map((r) => r.id)).toEqual(['x1']);
    });
    it('방 더하기가 남는다', async () => {
        const a = localRoomSource(demoPart);
        const part = await a.loadPart();
        await a.savePart({ ...part, rooms: [...part.rooms, { id: 'r-new', name: '음악실', capacity: 1, resourceKey: null, active: true, sort: 3, note: '' }] });
        expect((await localRoomSource(demoPart).loadPart()).rooms.map((r) => r.id)).toContain('r-new');
    });
    it('저장된 값이 없거나 깨졌으면 seed, 던지지 않는다', async () => {
        expect((await localRoomSource(demoPart).loadPart()).rooms).toHaveLength(2);
        localStorage.setItem('plugin.ops-room.part', '{깨짐');
        expect((await localRoomSource(demoPart).loadPart()).rooms).toHaveLength(2);
    });
});
