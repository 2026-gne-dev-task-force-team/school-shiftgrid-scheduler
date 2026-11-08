/**
 * TSV 왕복 검산 — 탭·줄바꿈 기본 + 🔴 따옴표 안 줄바꿈·탭·따옴표 보존(붙여넣기 매트릭스 M2).
 */
import { describe, expect, it } from 'vitest';
import { parseClipboard, toTsv } from './tsv';

describe('parseClipboard — 기본', () => {
    it('탭=칸, 줄바꿈=행', () => {
        expect(parseClipboard('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    });
    it('CRLF 도 LF 처럼 행을 가른다', () => {
        expect(parseClipboard('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    });
    it('꼬리 빈 줄 하나는 버린다(엑셀 복사)', () => {
        expect(parseClipboard('a\tb\n')).toEqual([['a', 'b']]);
    });
    it('빈 글자는 빈 2차원', () => {
        expect(parseClipboard('')).toEqual([[]]);
    });
});

describe('parseClipboard — 🔴 따옴표 보존(엑셀 칸 안 줄바꿈)', () => {
    it('따옴표 안 줄바꿈은 한 칸으로 보존한다', () => {
        // 엑셀: A1="가\n나", B1="다"  → "가\n나"<TAB>다
        expect(parseClipboard('"가\n나"\t다')).toEqual([['가\n나', '다']]);
    });
    it('따옴표 안 탭도 한 칸으로 보존한다', () => {
        expect(parseClipboard('"왼\t오"\t옆')).toEqual([['왼\t오', '옆']]);
    });
    it('칸 안 리터럴 따옴표(""→")', () => {
        expect(parseClipboard('"그는 ""안녕"" 했다"\tx')).toEqual([['그는 "안녕" 했다', 'x']]);
    });
    it('따옴표 칸과 보통 칸이 여러 줄 섞여도 행이 안 어긋난다', () => {
        expect(parseClipboard('"줄1\n줄2"\tb\nc\td')).toEqual([['줄1\n줄2', 'b'], ['c', 'd']]);
    });
});

describe('toTsv — 되돌리기(왕복)', () => {
    it('평범한 칸은 그대로', () => {
        expect(toTsv([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
    });
    it('칸 안 줄바꿈·탭·따옴표는 감싼다', () => {
        expect(toTsv([['가\n나', '다']])).toBe('"가\n나"\t다');
        expect(toTsv([['왼\t오']])).toBe('"왼\t오"');
        expect(toTsv([['그 "말"']])).toBe('"그 ""말"""');
    });
    it('🔴 왕복: parse(toTsv(x)) === x (칸 안 줄바꿈 포함)', () => {
        const grid = [['가\n나', '다', '라\t마'], ['x', '그 "값"', 'z']];
        expect(parseClipboard(toTsv(grid))).toEqual(grid);
    });
});
