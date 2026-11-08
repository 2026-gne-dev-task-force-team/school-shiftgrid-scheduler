import { describe, it, expect } from 'vitest';
import { uniqueName } from './naming';

describe('uniqueName — 겹치면 뒤에 숫자', () => {
    it('안 겹치면 base 그대로', () => {
        expect(uniqueName('명단', [])).toBe('명단');
        expect(uniqueName('명단', ['다른 것'])).toBe('명단');
    });

    it('base 가 겹치면 「base 2」', () => {
        expect(uniqueName('명단', ['명단'])).toBe('명단 2');
    });

    it('2 도 겹치면 처음 비는 자리로', () => {
        expect(uniqueName('표', ['표', '표 2', '표 3'])).toBe('표 4');
    });

    it('중간이 비어 있어도 가장 앞의 빈 자리를 쓴다', () => {
        // 표 3 은 있지만 표 2 가 없으면 「표 2」가 먼저 빈다
        expect(uniqueName('표', ['표', '표 3'])).toBe('표 2');
    });

    it('Set 로 넘겨도 같다', () => {
        expect(uniqueName('페이지', new Set(['페이지', '페이지 2']))).toBe('페이지 3');
    });
});
