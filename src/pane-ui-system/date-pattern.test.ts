import { describe, it, expect } from 'vitest';
import { expandPattern, patternSummary, ruleToPattern, patternToRRule, rruleToPattern, isPattern, type DatePattern } from './date-pattern';

describe('expandPattern', () => {
    it('규칙 둘 합집합 — 매주 월 + 매월 1일, 겹치는 6/1 은 한 번', () => {
        const p: DatePattern = { rules: [{ freq: 'weekly', weekdays: [1] }, { freq: 'monthly', monthDay: 1 }] };
        expect(expandPattern(p, '2026-06-01', '2026-06-01', '2026-07-02'))
            .toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-01']);
    });
    it('rdates 더하기 · exdates 빼기', () => {
        const p: DatePattern = { rules: [{ freq: 'weekly' }], rdates: ['2026-11-05', '2027-01-01'], exdates: ['2026-11-09'] };
        expect(expandPattern(p, '2026-11-02', '2026-11-01', '2026-11-17')).toEqual(['2026-11-02', '2026-11-05', '2026-11-16']);
    });
    it('except 기간 — 방학 7/20~8/20 빠짐(양끝 포함)', () => {
        const p: DatePattern = { rules: [{ freq: 'weekly' }], except: [{ from: '2026-07-20', to: '2026-08-20' }] };
        expect(expandPattern(p, '2026-07-06', '2026-07-01', '2026-09-01'))
            .toEqual(['2026-07-06', '2026-07-13', '2026-08-24', '2026-08-31']);
        // 끝날(8/24 월)이 회차와 겹쳐도 빠진다 — 양끝 포함
        expect(expandPattern({ ...p, except: [{ from: '2026-07-20', to: '2026-08-24' }] }, '2026-07-06', '2026-07-01', '2026-09-01'))
            .toEqual(['2026-07-06', '2026-07-13', '2026-08-31']);
    });
    it('시각 있는 start — 날짜만 준 rdate 에 그 시각이 붙는다', () => {
        const p: DatePattern = { rules: [{ freq: 'weekly' }], rdates: ['2026-11-05'] };
        expect(expandPattern(p, '2026-11-02T09:00', '2026-11-02', '2026-11-10'))
            .toEqual(['2026-11-02T09:00', '2026-11-05T09:00', '2026-11-09T09:00']);
    });
});

describe('patternSummary', () => {
    const one = (r: DatePattern['rules'][number], start = '2026-11-02') => patternSummary({ rules: [r] }, start);
    it('꼴들', () => {
        expect(one({ freq: 'weekly', weekdays: [3, 1] })).toBe('매주 월·수');
        expect(one({ freq: 'weekly', interval: 2, weekdays: [2] })).toBe('2주마다 화');
        expect(one({ freq: 'monthly', monthDay: 15 })).toBe('매월 15일');
        expect(one({ freq: 'monthly', nth: { n: 3, weekday: 4 } })).toBe('매월 셋째 목요일');
        expect(one({ freq: 'monthly', monthDay: -1 })).toBe('매월 말일');
        expect(one({ freq: 'yearly' }, '2027-03-02')).toBe('매년 3월 2일');
        expect(one({ freq: 'daily' })).toBe('매일');
    });
    it('여럿 · 시각 · 끝 · 빼기/더함', () => {
        const p: DatePattern = {
            rules: [{ freq: 'weekly', count: 10 }, { freq: 'monthly', monthDay: 1, until: '2026-12-31' }],
            except: [{ from: '2026-12-20', to: '2026-12-31' }], exdates: ['2026-11-09', '2026-11-16'], rdates: ['2026-11-05'],
        };
        expect(patternSummary(p, '2026-11-02T09:00')).toBe('매주 월 + 매월 1일 9:00 · 10회 · 12월 31일까지 · 기간 빼기 1 · 빠짐 2 · 더함 1');
    });
});

describe('변환', () => {
    it('ruleToPattern — exdates 는 패턴 쪽으로', () => {
        expect(ruleToPattern({ freq: 'daily', exdates: ['2026-01-02'] })).toEqual({ rules: [{ freq: 'daily' }], exdates: ['2026-01-02'] });
        expect(ruleToPattern({ freq: 'daily' })).toEqual({ rules: [{ freq: 'daily' }] });
        expect(isPattern({ rules: [] })).toBe(true);
        expect(isPattern({ freq: 'daily' })).toBe(false);
    });
    it('RRULE 왕복', () => {
        const p: DatePattern = {
            rules: [{ freq: 'weekly', interval: 2, weekdays: [1, 3], count: 10 }, { freq: 'monthly', nth: { n: -1, weekday: 5 }, until: '2026-12-31' }],
            rdates: ['2026-11-05'], exdates: ['2026-11-04'],
        };
        const lines = patternToRRule(p, '2026-11-02');
        expect(lines).toEqual([
            'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10',
            'RRULE:FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20261231',
            'RDATE;VALUE=DATE:20261105',
            'EXDATE;VALUE=DATE:20261104',
        ]);
        expect(rruleToPattern(lines)).toEqual(p);
        expect(rruleToPattern(patternToRRule({ rules: [{ freq: 'daily' }], rdates: ['2026-11-05'] }, '2026-11-02T09:00')))
            .toEqual({ rules: [{ freq: 'daily' }], rdates: ['2026-11-05T09:00'] });
    });
});
