/**
 * 붙여 넣기 파서 — 엑셀·한글 표에서 복사한 탭·줄바꿈 텍스트를 사람 줄들로(요구명세: 첫 칸 이름·둘째 칸 메모·빈 줄 무시).
 */
import { describe, it, expect } from 'vitest';
import { parsePasted } from './parse';

describe('parsePasted — 탭/CRLF/빈 줄/한 칸만', () => {
    it('탭 = 이름·메모 두 칸으로 가른다', () => {
        expect(parsePasted('홍길동\t반장\n임꺽정\t부반장')).toEqual([
            { name: '홍길동', memo: '반장' },
            { name: '임꺽정', memo: '부반장' },
        ]);
    });

    it('CRLF·CR 줄끝이 섞여도 LF 와 같게 가른다', () => {
        expect(parsePasted('가나다\t메모1\r\n라마바\t메모2\r사아자\t메모3')).toEqual([
            { name: '가나다', memo: '메모1' },
            { name: '라마바', memo: '메모2' },
            { name: '사아자', memo: '메모3' },
        ]);
    });

    it('빈 줄(그리고 공백뿐인 줄)은 무시한다', () => {
        expect(parsePasted('첫째\t메모\n\n   \n둘째\t메모2\n')).toEqual([
            { name: '첫째', memo: '메모' },
            { name: '둘째', memo: '메모2' },
        ]);
    });

    it('한 칸만(탭 없음) 이면 이름만, 메모는 없다', () => {
        expect(parsePasted('혼자\n또혼자')).toEqual([
            { name: '혼자' },
            { name: '또혼자' },
        ]);
    });

    it('이름이 비고 메모만 있는 줄(앞 탭)은 버린다 — 이름이 필수', () => {
        expect(parsePasted('\t메모만있음\n제대로\t메모')).toEqual([
            { name: '제대로', memo: '메모' },
        ]);
    });

    it('셋째 칸부터는 버린다(칸은 이름·메모뿐)', () => {
        expect(parsePasted('이름\t메모\t버릴것\t또버릴것')).toEqual([
            { name: '이름', memo: '메모' },
        ]);
    });

    it('앞뒤 공백은 다듬는다 · 메모가 공백뿐이면 없는 것', () => {
        expect(parsePasted('  여유  \t   \n  둘째  \t  진짜메모  ')).toEqual([
            { name: '여유' },
            { name: '둘째', memo: '진짜메모' },
        ]);
    });

    it('빈 텍스트는 빈 배열', () => {
        expect(parsePasted('')).toEqual([]);
        expect(parsePasted('\n\n  \n')).toEqual([]);
    });
});
