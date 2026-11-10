/**
 * 붙여 넣기 파서 — 엑셀·한글 표에서 복사한 탭·줄바꿈 텍스트를 칸 값 줄들로(열 i = keys[i] · 첫 칸 제목 필수 · 빈 줄 무시).
 */
import { describe, it, expect } from 'vitest';
import { parseRows } from './parse';

const KEYS = ['name', 'memo'];

describe('parseRows — 탭/CRLF/빈 줄/한 칸만', () => {
    it('탭 = 열 순서대로 칸 key 에 가른다', () => {
        expect(parseRows('홍길동\t반장\n임꺽정\t부반장', KEYS)).toEqual([
            { name: '홍길동', memo: '반장' },
            { name: '임꺽정', memo: '부반장' },
        ]);
    });

    it('CRLF·CR 줄끝이 섞여도 LF 와 같게 가른다', () => {
        expect(parseRows('가나다\t메모1\r\n라마바\t메모2\r사아자\t메모3', KEYS)).toEqual([
            { name: '가나다', memo: '메모1' },
            { name: '라마바', memo: '메모2' },
            { name: '사아자', memo: '메모3' },
        ]);
    });

    it('빈 줄(그리고 공백뿐인 줄)은 무시한다', () => {
        expect(parseRows('첫째\t메모\n\n   \n둘째\t메모2\n', KEYS)).toEqual([
            { name: '첫째', memo: '메모' },
            { name: '둘째', memo: '메모2' },
        ]);
    });

    it('한 칸만(탭 없음) 이면 제목만, 나머지는 없다', () => {
        expect(parseRows('혼자\n또혼자', KEYS)).toEqual([{ name: '혼자' }, { name: '또혼자' }]);
    });

    it('제목이 비고 다른 칸만 있는 줄(앞 탭)은 버린다 — 제목이 필수', () => {
        expect(parseRows('\t메모만있음\n제대로\t메모', KEYS)).toEqual([{ name: '제대로', memo: '메모' }]);
    });

    it('칸 수보다 열이 많으면 남는 열은 버린다', () => {
        expect(parseRows('가\t나\t다\t라', KEYS)).toEqual([{ name: '가', memo: '나' }]);
    });
});

describe('parseRows — 따옴표 칸(공용 clipboard-tsv)', () => {
    it('줄바꿈이 든 따옴표 칸은 한 칸으로 들어간다', () => {
        expect(parseRows('"가\n나"\t메모\n다\t라', KEYS)).toEqual([
            { name: '가\n나', memo: '메모' },
            { name: '다', memo: '라' },
        ]);
    });

    it('탭이 든 따옴표 칸도 한 칸으로 들어간다', () => {
        expect(parseRows('이름\t"메\t모"', KEYS)).toEqual([{ name: '이름', memo: '메\t모' }]);
    });
});
