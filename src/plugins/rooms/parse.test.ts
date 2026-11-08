/**
 * 붙여 넣기 파서 — 엑셀·한글 표에서 복사한 탭·줄바꿈 텍스트를 방 줄들로(요구명세: 첫 칸 이름·둘째 칸 메모·빈 줄 무시).
 *   ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
 */
import { describe, it, expect } from 'vitest';
import { parsePasted } from './parse';

describe('parsePasted — 탭/CRLF/빈 줄/한 칸만', () => {
    it('탭 = 이름·메모 두 칸으로 가른다', () => {
        expect(parsePasted('1층 복도 끝 방\t창고\n2층 계단 옆 방\t비품')).toEqual([
            { name: '1층 복도 끝 방', memo: '창고' },
            { name: '2층 계단 옆 방', memo: '비품' },
        ]);
    });

    it('CRLF·CR 줄끝이 섞여도 LF 와 같게 가른다', () => {
        expect(parsePasted('가 방\t메모1\r\n나 방\t메모2\r다 방\t메모3')).toEqual([
            { name: '가 방', memo: '메모1' },
            { name: '나 방', memo: '메모2' },
            { name: '다 방', memo: '메모3' },
        ]);
    });

    it('빈 줄(그리고 공백뿐인 줄)은 무시한다', () => {
        expect(parsePasted('첫 방\t메모\n\n   \n둘째 방\t메모2\n')).toEqual([
            { name: '첫 방', memo: '메모' },
            { name: '둘째 방', memo: '메모2' },
        ]);
    });

    it('한 칸만(탭 없음) 이면 이름만, 메모는 없다', () => {
        expect(parsePasted('혼자 방\n또 혼자 방')).toEqual([
            { name: '혼자 방' },
            { name: '또 혼자 방' },
        ]);
    });

    it('이름이 비고 메모만 있는 줄(앞 탭)은 버린다 — 이름이 필수', () => {
        expect(parsePasted('\t메모만있음\n제대로 방\t메모')).toEqual([
            { name: '제대로 방', memo: '메모' },
        ]);
    });

    it('셋째 칸부터는 버린다(칸은 이름·메모뿐)', () => {
        expect(parsePasted('이름 방\t메모\t버릴것\t또버릴것')).toEqual([
            { name: '이름 방', memo: '메모' },
        ]);
    });

    it('앞뒤 공백은 다듬는다 · 메모가 공백뿐이면 없는 것', () => {
        expect(parsePasted('  여유 방  \t   \n  둘째 방  \t  진짜메모  ')).toEqual([
            { name: '여유 방' },
            { name: '둘째 방', memo: '진짜메모' },
        ]);
    });

    it('빈 텍스트는 빈 배열', () => {
        expect(parsePasted('')).toEqual([]);
        expect(parsePasted('\n\n  \n')).toEqual([]);
    });
});
