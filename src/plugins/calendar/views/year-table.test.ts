/**
 * year-table 검산 — 순수 계산이라 종료코드로 전부 잰다(React·DOM 0).
 *   12열 × 31행 고정 · 없는 날 null · 윤년 2월 · 짧은 달 31일 · 요일 · 오늘 갈림 · 연도 라벨.
 */
import { describe, it, expect } from 'vitest';
import { yearTable, yearLabel } from './year-table';

describe('yearTable — 12달 × 31일 표', () => {
    it('12열(달) × 31행(일)', () => {
        const t = yearTable(2026);
        expect(t.length).toBe(12);
        expect(t.every((col) => col.length === 31)).toBe(true);
    });

    it('cells[m-1][d-1] 에 그 날이 온다', () => {
        const t = yearTable(2026);
        const c = t[11 - 1][1 - 1];   // 11월 1일
        expect(c).not.toBeNull();
        expect(c!.y).toBe(2026);
        expect(c!.m).toBe(11);
        expect(c!.d).toBe(1);
        expect(c!.iso).toBe('2026-11-01');
    });

    it('2026 2월은 29·30·31일이 없다(null), 28일은 있다', () => {
        const feb = yearTable(2026)[2 - 1];
        expect(feb[28 - 1]).not.toBeNull();   // 28일
        expect(feb[29 - 1]).toBeNull();       // 29일
        expect(feb[30 - 1]).toBeNull();
        expect(feb[31 - 1]).toBeNull();
    });

    it('2028 2월은 29일이 있고(윤년) 30일은 없다', () => {
        const feb = yearTable(2028)[2 - 1];
        expect(feb[29 - 1]).not.toBeNull();   // 29일
        expect(feb[29 - 1]!.iso).toBe('2028-02-29');
        expect(feb[30 - 1]).toBeNull();
    });

    it('4·6·9·11월은 31일이 없다(30일까지)', () => {
        const t = yearTable(2026);
        for (const m of [4, 6, 9, 11]) {
            expect(t[m - 1][31 - 1], `${m}월 31일`).toBeNull();
            expect(t[m - 1][30 - 1], `${m}월 30일`).not.toBeNull();
        }
        // 31일이 있는 달도 확인
        for (const m of [1, 3, 5, 7, 8, 10, 12]) {
            expect(t[m - 1][31 - 1], `${m}월 31일`).not.toBeNull();
        }
    });

    it('2026-11-01 의 weekday 는 0(일요일)', () => {
        expect(yearTable(2026)[11 - 1][1 - 1]!.weekday).toBe(0);
    });

    it('today 를 주면 그 칸만 isToday', () => {
        const t = yearTable(2026, new Date(2026, 10, 15));   // 2026-11-15
        expect(t[11 - 1][15 - 1]!.isToday).toBe(true);
        const hits = t.flat().filter((c) => c && c.isToday);
        expect(hits.length).toBe(1);
    });

    it('today 를 안 주면 아무 칸도 오늘이 아니다(결정적)', () => {
        const t = yearTable(2026);
        expect(t.flat().some((c) => c && c.isToday)).toBe(false);
    });

    it('today 가 다른 해면 그 해 표엔 isToday 가 없다', () => {
        const t = yearTable(2027, new Date(2026, 10, 15));
        expect(t.flat().some((c) => c && c.isToday)).toBe(false);
    });
});

describe('yearLabel', () => {
    it('한국어 꼴', () => {
        expect(yearLabel(2026)).toBe('2026년');
        expect(yearLabel(2028)).toBe('2028년');
    });
});
