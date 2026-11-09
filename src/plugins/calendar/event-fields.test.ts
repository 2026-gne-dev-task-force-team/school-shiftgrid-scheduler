import { describe, expect, it } from 'vitest';
import { applyEventValue, eventFields, eventToValues, valuesToEvent, eventToStored, storedToEvent, type EventForm } from './event-fields';

const ALL_DAY_ONE: EventForm = { name: '소풍', memo: '도시락', allDay: true, start: '2026-11-10T00:00', end: '2026-11-11T00:00' };
const ALL_DAY_MULTI: EventForm = { name: '수련회', memo: '', allDay: true, start: '2026-11-10T00:00', end: '2026-11-13T00:00' };
const TIMED: EventForm = { name: '회의', memo: '3층', allDay: false, start: '2026-11-10T14:30', end: '2026-11-10T16:00' };

describe('일정 어댑터 — 왕복', () => {
    it.each([['종일 하루', ALL_DAY_ONE], ['종일 여러 날', ALL_DAY_MULTI], ['시각 있음', TIMED]])('%s: valuesToEvent(eventToValues(e)) = e', (_n, e) => {
        expect(valuesToEvent(eventToValues(e))).toEqual(e);
    });
    it('종일은 반열린 끝을 「마지막 날」로 보이고 하루짜리는 end 를 생략한다', () => {
        expect(eventToValues(ALL_DAY_ONE).when).toEqual({ start: '2026-11-10' });
        expect(eventToValues(ALL_DAY_MULTI).when).toEqual({ start: '2026-11-10', end: '2026-11-12' });
    });
    it('「언제」 칸의 시각 유무는 종일이 정한다', () => {
        expect(eventFields(true).find((f) => f.key === 'when')!.config).toEqual({ time: false, range: true });
        expect(eventFields(false).find((f) => f.key === 'when')!.config).toEqual({ time: true, range: true });
    });
});

describe('일정 어댑터 — 칸 하나가 바뀔 때', () => {
    it('종일 켜기 → 시작 날 하루 종일 · 끄기 → 그날 09:00~10:00', () => {
        expect(applyEventValue(TIMED, 'allDay', true)).toEqual({ ...TIMED, allDay: true, start: '2026-11-10T00:00', end: '2026-11-11T00:00' });
        expect(applyEventValue(ALL_DAY_ONE, 'allDay', false)).toEqual({ ...ALL_DAY_ONE, allDay: false, start: '2026-11-10T09:00', end: '2026-11-10T10:00' });
    });
    it('끝이 시작보다 앞서면 한 시간 뒤로 당긴다', () => {
        const next = applyEventValue(TIMED, 'when', { start: '2026-11-10T14:30', end: '2026-11-10T13:00' });
        expect(next).toMatchObject({ start: '2026-11-10T14:30', end: '2026-11-10T15:30' });
    });
    it('제목을 비우면 「새 일정」 · 「언제」를 비우면 무시(null)', () => {
        expect(applyEventValue(TIMED, 'name', '  ')?.name).toBe('새 일정');
        expect(applyEventValue(TIMED, 'when', null)).toBeNull();
    });
});

describe('저장 모양(P4b) — 일정 노드 data = 컬렉션 레코드', () => {
    const cases = [
        { start: '2026-11-09T00:00', end: '2026-11-10T00:00', allDay: true },                    // 종일 하루
        { start: '2026-11-09T00:00', end: '2026-11-20T00:00', allDay: true, memo: '연수' },      // 종일 여러 날
        { start: '2026-11-09T09:30', end: '2026-11-11T17:00', allDay: false, uid: 'u1' },        // 시각 · 여러 날 · ics uid
    ];
    it('왕복 — storedToEvent(eventToStored(d)) = d', () => {
        for (const d of cases) expect(storedToEvent(eventToStored(d))).toEqual(d);
    });
    it('「종일」은 저장 안 한다 — 언제에 시각이 없으면 종일', () => {
        expect(eventToStored(cases[1])).toEqual({ values: { when: { start: '2026-11-09', end: '2026-11-19' }, memo: '연수' } });
        expect(eventToStored(cases[2]).values.when).toEqual({ start: '2026-11-09T09:30', end: '2026-11-11T17:00' });
    });
    it('사용자 칸 값은 남기고, 메모를 비우면 지운다', () => {
        const prev = { f_room: '강당', memo: '옛 메모' };
        expect(eventToStored(cases[0], prev).values).toEqual({ f_room: '강당', when: { start: '2026-11-09' } });
    });
    it('언제가 없거나 깨졌으면 null(안 그린다)', () => {
        expect(storedToEvent({})).toBeNull();
        expect(storedToEvent({ values: { when: { start: 'x' } } })).toBeNull();
        expect(storedToEvent({ start: '2026-11-09T00:00', end: '2026-11-10T00:00', allDay: true })).toBeNull();   // 옛 모양은 안 읽는다(이행 0)
    });
});
