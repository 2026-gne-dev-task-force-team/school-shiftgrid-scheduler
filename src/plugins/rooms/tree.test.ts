/**
 * 방 안에 방 — 순수 트리 셈(노드·저장 없이 parentId 만으로). 요구명세: 방 안에 방·순환 막기·부모 지울 때 자식 최상위.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 방 이름만.
 */
import { describe, it, expect } from 'vitest';
import type { Room } from './contracts/rooms';
import { buildRoomTree, effectiveParentId, wouldCycle } from './tree';

/** 테스트용 방 한 칸 — listId 는 전부 같은 'L'. */
function R(id: string, parentId?: string): Room {
    return parentId ? { id, listId: 'L', name: id, parentId } : { id, listId: 'L', name: id };
}

describe('buildRoomTree — 방 안에 방을 깊이 우선으로 펼치고 depth 를 준다', () => {
    it('부모 다음에 자식이 한 단 들여서 온다(형제는 노드 순서 유지)', () => {
        // 건물(a) → 층(b) → 교실 자리(c) 같은 포함. d 는 따로 최상위.
        const rooms = [R('a'), R('b', 'a'), R('c', 'b'), R('d')];
        expect(buildRoomTree(rooms).map((x) => [x.room.id, x.depth])).toEqual([
            ['a', 0], ['b', 1], ['c', 2], ['d', 0],
        ]);
    });

    it('한 부모가 자식 여럿 — 들어온 순서대로 자식이 줄선다', () => {
        const rooms = [R('p'), R('c1', 'p'), R('c2', 'p'), R('c3', 'p')];
        expect(buildRoomTree(rooms).map((x) => [x.room.id, x.depth])).toEqual([
            ['p', 0], ['c1', 1], ['c2', 1], ['c3', 1],
        ]);
    });

    it('🔴 부모가 집합에 없으면(= 지워졌으면) 자식은 최상위로 올라온다', () => {
        // 'gone' 은 집합에 없다(휴지통으로 갔다 치자) — child 는 depth 0 으로 뜬다.
        const rooms = [R('child', 'gone'), R('solo')];
        expect(buildRoomTree(rooms).map((x) => [x.room.id, x.depth])).toEqual([
            ['child', 0], ['solo', 0],
        ]);
    });

    it('방어 — 저장 데이터에 사이클이 있어도 전부 한 번씩은 건진다(무한 루프 없음)', () => {
        const rooms = [R('x', 'y'), R('y', 'x')];   // 서로가 서로의 부모(정상 경로론 안 생긴다)
        const out = buildRoomTree(rooms);
        expect(out.map((x) => x.room.id).sort()).toEqual(['x', 'y']);
    });
});

describe('effectiveParentId — 유효한 부모일 때만', () => {
    it('부모가 집합에 있으면 그 id, 없으면 null', () => {
        const rooms = [R('a'), R('b', 'a'), R('c', 'ghost')];
        expect(effectiveParentId(rooms, 'b')).toBe('a');
        expect(effectiveParentId(rooms, 'c')).toBeNull();   // ghost 는 집합에 없다
        expect(effectiveParentId(rooms, 'a')).toBeNull();   // 최상위
    });
});

describe('wouldCycle — 자기 자손을 부모로 두면 참', () => {
    const rooms = [R('a'), R('b', 'a'), R('c', 'b')];   // a → b → c
    it('자기 자신을 부모로 = 순환', () => {
        expect(wouldCycle(rooms, 'a', 'a')).toBe(true);
    });
    it('자손을 부모로 = 순환 (a 의 부모를 c 로)', () => {
        expect(wouldCycle(rooms, 'a', 'c')).toBe(true);
        expect(wouldCycle(rooms, 'a', 'b')).toBe(true);
    });
    it('무관한 방을 부모로 = 순환 아님', () => {
        const rooms2 = [R('a'), R('b', 'a'), R('d')];
        expect(wouldCycle(rooms2, 'd', 'a')).toBe(false);   // d 를 a 밑으로 — 괜찮다
        expect(wouldCycle(rooms2, 'd', 'b')).toBe(false);
    });
    it('null(최상위로) 은 순환 아님', () => {
        expect(wouldCycle(rooms, 'c', null)).toBe(false);
    });
});
