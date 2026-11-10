// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readLeafNode, writeLeafNode } from './leaf-node';

describe('leaf-node — 탭이 보던 노드 기억', () => {
    it('쓴 값을 같은 탭 id 로 읽고, 다른 탭·없는 탭은 null', () => {
        writeLeafNode('leaf-a', 'n1');
        expect(readLeafNode('leaf-a')).toBe('n1');
        expect(readLeafNode('leaf-b')).toBeNull();
        expect(readLeafNode(undefined)).toBeNull();
    });
    it('덮어쓰면 마지막 값', () => {
        writeLeafNode('leaf-c', 'n1'); writeLeafNode('leaf-c', 'n2');
        expect(readLeafNode('leaf-c')).toBe('n2');
    });
});
