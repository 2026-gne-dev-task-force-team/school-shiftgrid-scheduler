/**
 * 일정 순수 함수 — 범위 겹침·날짜 색인(C1) · 정렬·검색(C3). 🔴 노드·React 0 — CalEvent 평면 객체만.
 */
import { describe, it, expect } from 'vitest';
import { overlaps, eventsInRange, eventsInScope, buildDayIndex, sortEvents, filterEvents, type CalEvent, type StoreInfo } from './events';

/** 테스트용 일정 하나 — start/end 는 'YYYY-MM-DDTHH:mm' */
function ev(id: string, start: string, end: string, opts: Partial<CalEvent> = {}): CalEvent {
    return {
        id, storeId: opts.storeId ?? 's', name: opts.name ?? id, start, end,
        startMs: new Date(start).getTime(), endMs: new Date(end).getTime(),
        allDay: opts.allDay ?? false, memo: opts.memo ?? '', colorIdx: opts.colorIdx ?? 0,
    };
}

const FROM = new Date('2026-11-10T00:00').getTime();
const TO = new Date('2026-11-11T00:00').getTime();   // 11월 10일 하루 범위 [10 00:00, 11 00:00)

describe('overlaps — 반열린 구간', () => {
    it('안쪽은 겹친다', () => { expect(overlaps(FROM + 1000, TO - 1000, FROM, TO)).toBe(true); });
    it('맞닿은 뒤 경계는 안 겹친다(end === from)', () => { expect(overlaps(FROM - 3600_000, FROM, FROM, TO)).toBe(false); });
    it('맞닿은 앞 경계는 안 겹친다(start === to)', () => { expect(overlaps(TO, TO + 3600_000, FROM, TO)).toBe(false); });
});

describe('eventsInRange — 11월 10일 하루 범위', () => {
    const list = [
        ev('종일', '2026-11-10T00:00', '2026-11-11T00:00', { allDay: true }),   // ① 그 날 종일 — 포함
        ev('오전', '2026-11-10T09:00', '2026-11-10T10:00'),                     // ② 그 날 시간 — 포함
        ev('전날끝경계', '2026-11-09T23:00', '2026-11-10T00:00'),               // ③ 끝이 from 과 맞닿음 — 제외
        ev('다음날시작경계', '2026-11-11T00:00', '2026-11-11T01:00'),           // ④ 시작이 to 와 맞닿음 — 제외
        ev('걸침', '2026-11-09T22:00', '2026-11-10T02:00'),                     // ⑤ 전날밤→그날새벽 — 포함
        ev('딴날', '2026-11-20T09:00', '2026-11-20T10:00'),                     // ⑥ 완전 밖 — 제외
        ev('통째덮음', '2026-11-01T00:00', '2026-12-01T00:00'),                 // ⑦ 범위를 통째로 덮음 — 포함
    ];
    it('겹치는 넷만 남는다', () => {
        expect(eventsInRange(list, FROM, TO).map((e) => e.id).sort())
            .toEqual(['걸침', '오전', '종일', '통째덮음'].sort());
    });
    it('빈 목록은 빈 결과', () => { expect(eventsInRange([], FROM, TO)).toEqual([]); });
});

describe('eventsInScope — 저장소 범위(자손 포함 · 형제 제외 · null 이면 전부)', () => {
    // 나무: 루트 ▸ A(저장소) ▸ 폴더f ▸ B(자손 저장소) · C(형제 저장소)
    //   path 는 조상→자신(사이 폴더 포함). A=[A] · B=[A,f,B] · C=[C]
    const stores = new Map<string, StoreInfo>([
        ['A', { id: 'A', name: 'A', colorIdx: 0, path: ['A'] }],
        ['B', { id: 'B', name: 'B', colorIdx: 1, path: ['A', 'f', 'B'] }],
        ['C', { id: 'C', name: 'C', colorIdx: 2, path: ['C'] }],
    ]);
    const list = [
        ev('a1', '2026-11-10T09:00', '2026-11-10T10:00', { storeId: 'A' }),
        ev('b1', '2026-11-10T09:00', '2026-11-10T10:00', { storeId: 'B' }),   // A 의 자손 저장소
        ev('c1', '2026-11-10T09:00', '2026-11-10T10:00', { storeId: 'C' }),   // 형제 저장소
    ];

    it('A 로 좁히면 A 와 자손 B 는 포함 · 형제 C 는 제외', () => {
        expect(eventsInScope(list, stores, 'A').map((e) => e.id).sort()).toEqual(['a1', 'b1']);
    });
    it('자손 저장소 B 로 좁히면 B 것만(위로 안 올라간다)', () => {
        expect(eventsInScope(list, stores, 'B').map((e) => e.id)).toEqual(['b1']);
    });
    it('형제 저장소 C 로 좁히면 C 것만', () => {
        expect(eventsInScope(list, stores, 'C').map((e) => e.id)).toEqual(['c1']);
    });
    it('null 이면 거르지 않는다(전부)', () => {
        expect(eventsInScope(list, stores, null).map((e) => e.id)).toEqual(['a1', 'b1', 'c1']);
    });
});

describe('buildDayIndex — 여러 날 걸침은 각 날에', () => {
    it('시간 일정은 그 하루에만', () => {
        const idx = buildDayIndex([ev('a', '2026-11-10T09:00', '2026-11-10T10:00')]);
        expect(idx.get('2026-11-10')?.map((e) => e.id)).toEqual(['a']);
        expect(idx.get('2026-11-11')).toBeUndefined();
    });
    it('종일(다음날 자정까지)은 시작 날 하나만(반열린)', () => {
        const idx = buildDayIndex([ev('a', '2026-11-10T00:00', '2026-11-11T00:00', { allDay: true })]);
        expect(idx.get('2026-11-10')?.length).toBe(1);
        expect(idx.get('2026-11-11')).toBeUndefined();
    });
    it('사흘 걸치면 세 날에 다 들어간다', () => {
        const idx = buildDayIndex([ev('a', '2026-11-10T09:00', '2026-11-12T10:00')]);
        expect(idx.get('2026-11-10')?.length).toBe(1);
        expect(idx.get('2026-11-11')?.length).toBe(1);
        expect(idx.get('2026-11-12')?.length).toBe(1);
        expect(idx.get('2026-11-13')).toBeUndefined();
    });
});

describe('정렬·검색(C3)', () => {
    const list = [
        ev('나', '2026-11-10T11:00', '2026-11-10T12:00', { memo: '회의실 A' }),
        ev('가', '2026-11-10T09:00', '2026-11-10T10:00'),
        ev('종일', '2026-11-10T00:00', '2026-11-11T00:00', { allDay: true }),
    ];
    it('시작 이른 순, 같으면 종일 먼저', () => {
        expect(sortEvents(list).map((e) => e.id)).toEqual(['종일', '가', '나']);
    });
    it('제목으로 검색', () => { expect(filterEvents(list, '가').map((e) => e.id)).toEqual(['가']); });
    it('메모로도 검색', () => { expect(filterEvents(list, '회의실').map((e) => e.id)).toEqual(['나']); });
    it('빈 질의는 전부', () => { expect(filterEvents(list, '  ').length).toBe(3); });
});
