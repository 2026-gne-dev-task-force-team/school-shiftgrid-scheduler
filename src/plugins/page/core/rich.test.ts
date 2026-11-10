import { describe, expect, it } from 'vitest';
import { isPlain, nodeIdsIn, nodeToken, parseRich, richToPlain } from './rich';

describe('리치 글자 파서', () => {
    it('맨 글자는 text 하나', () => {
        expect(isPlain('3학년 1반')).toBe(true);
        expect(parseRich('3학년 1반')).toEqual([{ t: 'text', s: '3학년 1반' }]);
    });

    it('굵게·기울임·취소선', () => {
        expect(parseRich('**굵게**')).toEqual([{ t: 'b', c: [{ t: 'text', s: '굵게' }] }]);
        expect(parseRich('*기울*')).toEqual([{ t: 'i', c: [{ t: 'text', s: '기울' }] }]);
        expect(parseRich('~~취소~~')).toEqual([{ t: 's', c: [{ t: 'text', s: '취소' }] }]);
        expect(parseRich('*a **b** c*')).toEqual([{ t: 'i', c: [{ t: 'text', s: 'a ' }, { t: 'b', c: [{ t: 'text', s: 'b' }] }, { t: 'text', s: ' c' }] }]);
    });

    it('줄바꿈은 br · 서식은 줄을 못 넘는다', () => {
        expect(parseRich('가\n나')).toEqual([{ t: 'text', s: '가' }, { t: 'br' }, { t: 'text', s: '나' }]);
        expect(richToPlain('**가\n나**')).toBe('**가\n나**');
    });

    it('글자색 — 아는 색만', () => {
        expect(parseRich('[빨강]{.bad}')).toEqual([{ t: 'color', color: 'bad', c: [{ t: 'text', s: '빨강' }] }]);
        expect(parseRich('[보라]{.purple}')).toEqual([{ t: 'text', s: '[보라]{.purple}' }]);
    });

    it('링크 — 안전한 것만', () => {
        expect(parseRich('[여기](https://a.b/c)')).toEqual([{ t: 'link', href: 'https://a.b/c', c: [{ t: 'text', s: '여기' }] }]);
        expect(parseRich('[나쁨](javascript:alert(1))')).toEqual([{ t: 'text', s: '[나쁨](javascript:alert(1))' }]);
    });

    it('노드 토큰 — id 를 뽑고 겹치면 한 번', () => {
        const t = `${nodeToken('n1')}·${nodeToken('n2')}·${nodeToken('n1')}`;
        expect(nodeIdsIn(t)).toEqual(['n1', 'n2']);
        expect(parseRich(nodeToken('n1'))).toEqual([{ t: 'node', id: 'n1' }]);
        expect(richToPlain(`${nodeToken('n1')} 담당`, (id) => (id === 'n1' ? '홍길동' : undefined))).toBe('홍길동 담당');
    });

    it('깨진 문법은 글자 그대로 — 잃는 글자 0', () => {
        for (const s of ['**열림', '~~열림', '*', '[열림', '⟦node:', '⟦node:a b⟧', '2 * 3 = 6']) {
            expect(richToPlain(s)).toBe(s);
        }
    });
});
