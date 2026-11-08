/**
 * 남의 일정 매퍼(feed-events.ts) 순수 함수 — 범위 전달·editor 유무·던지는 출처 격리·색 토큰·필드 매핑.
 */
import { describe, it, expect, vi } from 'vitest';
import { mapFeedEvents, feedEventId, feedStoreId, type FeedSourceInput } from './feed-events';
import type { CalendarItem, CalendarSource } from '../contract-calendar/types';

const item = (over: Partial<CalendarItem>): CalendarItem => ({
    id: 'i', title: '제목', start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false, ...over,
});

function source(id: string, list: CalendarSource['list'], editor?: CalendarSource['editor']): CalendarSource {
    return { id, label: `출처 ${id}`, list, onChange: () => ({ dispose() { } }), editor };
}
const input = (s: CalendarSource, colorIdx = 0): FeedSourceInput => ({ source: s, colorIdx });

describe('① 범위 — list(from,to) 에 범위를 넘기고, 받은 것만 그린다', () => {
    it('출처가 범위로 거른 항목만 CalEvent 로 나온다', () => {
        const all = [
            item({ id: 'in', start: '2026-11-10T09:00', end: '2026-11-10T10:00' }),
            item({ id: 'out', start: '2026-12-25T09:00', end: '2026-12-25T10:00' }),
        ];
        const list = vi.fn((from: string, to: string) => all.filter((it) => it.start >= from && it.start < to));
        const out = mapFeedEvents([input(source('s', list))], '2026-11-01T00:00', '2026-11-30T23:59');

        expect(list).toHaveBeenCalledWith('2026-11-01T00:00', '2026-11-30T23:59');   // 범위가 출처로 간다
        expect(out.map((e) => e.id)).toEqual([feedEventId('s', 'in')]);              // 범위 안 것만
    });

    it('CalEvent 필드가 항목·출처에서 바로 온다', () => {
        const s = source('s', () => [item({ id: 'a', title: '회의', memo: '3층', allDay: false })]);
        const [e] = mapFeedEvents([input(s)], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(e.id).toBe(feedEventId('s', 'a'));
        expect(e.storeId).toBe(feedStoreId('s'));
        expect(e.name).toBe('회의');
        expect(e.memo).toBe('3층');
        expect(e.allDay).toBe(false);
        expect(e.foreign).toEqual({ sourceId: 's', sourceLabel: '출처 s', readOnly: true, item: expect.objectContaining({ id: 'a' }) });
    });

    it('시작/끝이 못 읽히는 항목은 버린다', () => {
        const s = source('s', () => [item({ id: 'bad', start: '엉망', end: '망함' })]);
        expect(mapFeedEvents([input(s)], '2026-01-01T00:00', '2026-12-31T23:59')).toEqual([]);
    });
});

describe('④ 편집 가능 여부 — editor 유무로 readOnly', () => {
    const Editor = () => null;
    it('editor 가 없으면 readOnly true', () => {
        const [e] = mapFeedEvents([input(source('s', () => [item({})]))], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(e.foreign?.readOnly).toBe(true);
    });
    it('editor 가 있으면 readOnly false', () => {
        const [e] = mapFeedEvents([input(source('s', () => [item({})], Editor))], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(e.foreign?.readOnly).toBe(false);
    });
});

describe('⑤ 던지는 출처 격리 — 그 출처만 건너뛰고 달력은 산다', () => {
    it('한 출처가 list 에서 던져도 다른 출처 일정은 그대로 나온다', () => {
        const bad = source('bad', () => { throw new Error('깨짐'); });
        const good = source('good', () => [item({ id: 'g' })]);
        const out = mapFeedEvents([input(bad), input(good)], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(out.map((e) => e.id)).toEqual([feedEventId('good', 'g')]);
    });
});

describe('색 — color 토큰이 있으면 그 색, 없으면 출처 색인', () => {
    it('color 토큰 → 그 색인', () => {
        const [e] = mapFeedEvents([input(source('s', () => [item({ color: 'ok' })]), 0)], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(e.colorIdx).toBe(1);   // ok = 1
    });
    it('모르는/없는 color → 출처 색인', () => {
        const [e] = mapFeedEvents([input(source('s', () => [item({ color: '이상한거' })]), 3)], '2026-01-01T00:00', '2026-12-31T23:59');
        expect(e.colorIdx).toBe(3);
    });
});
