/**
 * 항목 안의 트리 셈 — 순수(노드·저장 없이 parentId 만으로). 요구명세: 방 안에 방·순환 막기·부모 지울 때 자식 최상위.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
 */
import { describe, it, expect } from 'vitest';
import { effectiveParentId, wouldCycle, type TreeItem } from './tree';

/** 테스트용 항목 한 칸. */
function R(id: string, parentId?: string): TreeItem {
    return parentId ? { id, parentId } : { id };
}

describe('effectiveParentId — 유효한 부모일 때만(부모가 사라지면 최상위)', () => {
    it('부모가 집합에 있으면 그 id, 없으면 null', () => {
        const items = [R('a'), R('b', 'a'), R('c', 'ghost')];
        expect(effectiveParentId(items, 'b')).toBe('a');
        expect(effectiveParentId(items, 'c')).toBeNull();   // ghost 는 집합에 없다(지워졌다)
        expect(effectiveParentId(items, 'a')).toBeNull();   // 최상위
    });
});

describe('wouldCycle — 자기 자손을 부모로 두면 참', () => {
    const items = [R('a'), R('b', 'a'), R('c', 'b')];   // a → b → c
    it('자기 자신을 부모로 = 순환', () => {
        expect(wouldCycle(items, 'a', 'a')).toBe(true);
    });
    it('자손을 부모로 = 순환 (a 의 부모를 c 로)', () => {
        expect(wouldCycle(items, 'a', 'c')).toBe(true);
        expect(wouldCycle(items, 'a', 'b')).toBe(true);
    });
    it('무관한 항목을 부모로 = 순환 아님', () => {
        const items2 = [R('a'), R('b', 'a'), R('d')];
        expect(wouldCycle(items2, 'd', 'a')).toBe(false);   // d 를 a 밑으로 — 괜찮다
        expect(wouldCycle(items2, 'd', 'b')).toBe(false);
    });
    it('null(최상위로) 은 순환 아님', () => {
        expect(wouldCycle(items, 'c', null)).toBe(false);
    });
});
