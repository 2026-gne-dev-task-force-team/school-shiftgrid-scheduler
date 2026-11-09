import { describe, expect, it } from 'vitest';
import { josa, pickJosa, batchim } from './josa';

describe('josa', () => {
    it('받침 있음/없음', () => {
        expect(josa('목록', '을/를')).toBe('목록을');
        expect(josa('노트', '을/를')).toBe('노트를');
        expect(josa('목록', '이/가')).toBe('목록이');
        expect(josa('노트', '이/가')).toBe('노트가');
        expect(josa('목록', '은/는')).toBe('목록은');
        expect(josa('노트', '과/와')).toBe('노트와');
    });
    it('으로/로 — ㄹ 받침은 로', () => {
        expect(josa('파일', '으로/로')).toBe('파일로');
        expect(josa('목록', '으로/로')).toBe('목록으로');
        expect(josa('노트', '으로/로')).toBe('노트로');
    });
    it('숫자·영문·괄호 끝', () => {
        expect(pickJosa('3', '을/를')).toBe('을');     // 삼
        expect(pickJosa('2', '을/를')).toBe('를');     // 이
        expect(pickJosa('1', '으로/로')).toBe('로');   // 일
        expect(pickJosa('Table', '이/가')).toBe('가');
        expect(pickJosa('「목록」', '을/를')).toBe('을');
        expect(batchim('')).toBe('none');
    });
});
