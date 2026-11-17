// D3 판 고르기 순수 함수 — 경계: 기간 겹침·빈틈·같은 시작일 두 판·기간 없는 옛 판·미래 판만 있는 날.
import { describe, expect, it } from 'vitest';
import { archiveNumberOf, docOf, inPeriod, newestFirst, periodOf, pickVersion, type DocPeriod } from './doc-pick.ts';

type V = DocPeriod & { name: string };
const v = (name: string, validFrom: string | null, validTo: string | null): V => ({ name, validFrom, validTo });
const pick = (newest: V[], date: string) => pickVersion(newest, (x) => x, date)?.name ?? null;

describe('inPeriod', () => {
    it('양 끝을 포함한다', () => {
        const p = { validFrom: '2026-03-02', validTo: '2026-07-20' };
        expect(inPeriod(p, '2026-03-02')).toBe(true);
        expect(inPeriod(p, '2026-07-20')).toBe(true);
        expect(inPeriod(p, '2026-03-01')).toBe(false);
        expect(inPeriod(p, '2026-07-21')).toBe(false);
    });
    it('null 끝은 열려 있다', () => {
        expect(inPeriod({ validFrom: null, validTo: null }, '1999-01-01')).toBe(true);
        expect(inPeriod({ validFrom: '2026-09-01', validTo: null }, '2030-01-01')).toBe(true);
        expect(inPeriod({ validFrom: null, validTo: '2026-08-31' }, '2026-09-01')).toBe(false);
    });
});

describe('pickVersion — 기간 맞는 것 중 최신, 없으면 최신', () => {
    const spring = v('doc@3', '2026-03-02', '2026-07-20');
    const fall = v('doc', '2026-08-24', '2027-02-28');
    it('그날을 덮는 판을 고른다', () => {
        expect(pick([fall, spring], '2026-05-01')).toBe('doc@3');
        expect(pick([fall, spring], '2026-09-01')).toBe('doc');
    });
    it('기간이 겹치면 최신', () => {
        const overlap = v('doc', '2026-06-01', '2027-02-28');
        expect(pick([overlap, spring], '2026-06-15')).toBe('doc');
        expect(pick([overlap, spring], '2026-05-31')).toBe('doc@3');
    });
    it('빈틈(어느 기간에도 안 드는 날)이면 최신', () => {
        expect(pick([fall, spring], '2026-08-01')).toBe('doc');
    });
    it('같은 시작일 두 판이면 최신', () => {
        expect(pick([v('doc', '2026-03-02', null), v('doc@5', '2026-03-02', null)], '2026-04-01')).toBe('doc');
        expect(pick([v('doc@7', '2026-03-02', '2026-12-31'), v('doc@5', '2026-03-02', '2026-12-31')], '2026-04-01')).toBe('doc@7');
    });
    it('기간 없는 옛 판은 언제나 맞는다 — 지금 판 기간 밖이면 옛 판', () => {
        const old = v('doc@1', null, null);
        expect(pick([fall, old], '2026-05-01')).toBe('doc@1');
        expect(pick([fall, old], '2026-09-01')).toBe('doc');
    });
    it('미래 판만 있는 날이면 최신(아무것도 안 맞아도 판은 준다)', () => {
        expect(pick([v('doc', '2027-03-02', null)], '2026-11-17')).toBe('doc');
        expect(pick([v('doc', '2027-03-02', null), v('doc@2', '2027-01-01', null)], '2026-11-17')).toBe('doc');
    });
    it('빈 목록이면 null', () => {
        expect(pick([], '2026-11-17')).toBeNull();
    });
});

describe('본문 꼴·이름', () => {
    it('감싼 꼴은 기간·시간표를 읽고, 옛 판은 기간 없음', () => {
        const grid = { tracks: [] };
        expect(periodOf({ doc: grid, validFrom: '2026-03-02', validTo: null })).toEqual({ validFrom: '2026-03-02', validTo: null });
        expect(docOf({ doc: grid, validFrom: '2026-03-02', validTo: null })).toBe(grid);
        expect(periodOf(grid)).toEqual({ validFrom: null, validTo: null });
        expect(docOf(grid)).toBe(grid);
        expect(periodOf(null)).toEqual({ validFrom: null, validTo: null });
    });
    it('날짜 꼴이 아닌 기간은 제한 없음으로 본다', () => {
        expect(periodOf({ doc: {}, validFrom: '3월', validTo: 20260720 })).toEqual({ validFrom: null, validTo: null });
    });
    it('보관 번호·최신 순서 — doc 먼저, n 큰 쪽(숫자로 비교)', () => {
        expect(archiveNumberOf('doc@12')).toBe(12);
        expect(archiveNumberOf('doc')).toBeNull();
        expect(archiveNumberOf('doc@x')).toBeNull();
        expect(newestFirst(['doc@2', 'doc@10', 'ops.fixed', 'doc', 'doc@9'])).toEqual(['doc', 'doc@10', 'doc@9', 'doc@2']);
        expect(newestFirst(['doc@1'])).toEqual(['doc@1']);
    });
});
