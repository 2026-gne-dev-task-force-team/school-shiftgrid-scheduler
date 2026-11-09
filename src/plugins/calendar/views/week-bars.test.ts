import { describe, expect, it } from 'vitest';
import { buildDayIndex, parseLocal, type CalEvent } from '../events';
import { layoutWeek, overflowOf } from './week-bars';

const ev = (id: string, start: string, end: string, allDay = true): CalEvent => ({
    id, storeId: 's', name: id, start, end, startMs: parseLocal(start).getTime(), endMs: parseLocal(end).getTime(), allDay, memo: '', colorIdx: 0,
});
// 2026-11-08(일) ~ 11-14(토) 한 주
const WEEK = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];

describe('월 보기 주 줄 배치(F7) — 여러 날 일정은 이어진 막대 하나', () => {
    it('9~19일 종일 일정 하나 = 이 주에선 월~토 막대 하나(다음 주로 이어짐) — 날마다 칩 여러 개가 아니다', () => {
        const idx = buildDayIndex([ev('a', '2026-11-09T00:00', '2026-11-20T00:00')]);
        const { bars, lanes } = layoutWeek(WEEK, idx);
        expect(bars).toHaveLength(1);
        expect(bars[0]).toMatchObject({ col: 1, span: 6, lane: 0, multi: true, contL: false, contR: true });
        expect(lanes).toBe(1);
        // 다음 주(15~21일)에선 앞에서 이어 와 19일까지
        const next = layoutWeek(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'], idx);
        expect(next.bars[0]).toMatchObject({ col: 0, span: 5, contL: true, contR: false });
    });

    it('막대가 먼저 줄을 잡고, 하루짜리는 비는 줄로 — 같은 칸에서 안 겹친다', () => {
        const idx = buildDayIndex([
            ev('day', '2026-11-10T09:00', '2026-11-10T10:00', false),
            ev('long', '2026-11-09T00:00', '2026-11-12T00:00'),
            ev('later', '2026-11-13T00:00', '2026-11-14T00:00'),
            ev('a', '2026-11-09T00:00', '2026-11-10T00:00'),   // 막대와 같은 날 시작 · 이름이 앞서도 막대 밑으로
        ]);
        const { bars } = layoutWeek(WEEK, idx);
        const by = Object.fromEntries(bars.map((b) => [b.e.id, b]));
        expect(by.long).toMatchObject({ col: 1, span: 3, lane: 0, multi: true });
        expect(by.a).toMatchObject({ col: 1, span: 1, lane: 1, multi: false });
        expect(by.day).toMatchObject({ col: 2, span: 1, lane: 1, multi: false });
        expect(by.later).toMatchObject({ col: 5, lane: 0, multi: false });   // 비어 있는 칸이면 맨 위 줄
    });

    it('시각 일정도 날을 넘기면 막대다', () => {
        const { bars } = layoutWeek(WEEK, buildDayIndex([ev('t', '2026-11-09T15:00', '2026-11-10T11:00', false)]));
        expect(bars[0]).toMatchObject({ col: 1, span: 2, multi: true });
    });

    it('넘치면 마지막 줄을 「+N」 자리로 — 칸마다 숨은 수', () => {
        const idx = buildDayIndex(['a', 'b', 'c'].map((id) => ev(id, '2026-11-09T00:00', '2026-11-10T00:00')));
        const { bars, lanes } = layoutWeek(WEEK, idx);
        expect(lanes).toBe(3);
        expect(overflowOf(bars, lanes, 3)).toEqual({ cutoff: 3, hidden: [0, 0, 0, 0, 0, 0, 0] });
        expect(overflowOf(bars, lanes, 2)).toEqual({ cutoff: 1, hidden: [0, 2, 0, 0, 0, 0, 0] });
    });
});
