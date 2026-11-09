import { describe, it, expect } from 'vitest';
import { pasteToTsv, reorderSteps } from './table-slot';

const cols = [{ key: 'name', title: '이름' }, { key: 'memo', title: '메모' }];

describe('레코드 뷰 콜백 → 표 자리 콜백', () => {
    it('붙여넣기: 보이는 칸 순서가 달라도 이 자리 열 순서의 TSV 로', () => {
        expect(pasteToTsv({ keys: ['memo', 'name'], rows: [['m1', 'n1'], ['', 'n2']] }, cols)).toBe('n1\tm1\nn2\t');
        expect(pasteToTsv({ keys: ['name', null], rows: [['n', 'x']] }, cols)).toBe('n\t');
    });
    it('순서: beforeId 앞으로(null 이면 끝) → 한 칸씩 몇 번', () => {
        const ids = ['a', 'b', 'c', 'd'];
        expect(reorderSteps(ids, 'a', 'd')).toEqual({ dir: 1, n: 2 });
        expect(reorderSteps(ids, 'a', null)).toEqual({ dir: 1, n: 3 });
        expect(reorderSteps(ids, 'd', 'a')).toEqual({ dir: -1, n: 3 });
        expect(reorderSteps(ids, 'b', 'c')).toBeNull();
        expect(reorderSteps(ids, 'x', 'a')).toBeNull();
    });
});
