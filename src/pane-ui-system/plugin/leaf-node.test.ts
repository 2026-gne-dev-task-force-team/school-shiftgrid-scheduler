// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('leaf-node — 저장 키 고정(새로고침 흉내)', () => {
    // 🔴 키는 사용자 자료 호환이라 바뀌면 빨개져야 맞다 — 리터럴로 박는다. 접두사는 기본값 'pane-ui-system'.
    const KEY = 'pane-ui-system.leaf-node';
    beforeEach(() => { localStorage.clear(); vi.resetModules(); });

    it('모듈을 새로 불러와도(새로고침) 미리 저장된 값을 읽는다', async () => {
        localStorage.setItem(KEY, JSON.stringify({ 'leaf-x': 'node-9' }));
        const m = await import('./leaf-node');
        expect(m.readLeafNode('leaf-x')).toBe('node-9');
    });
    it('쓰면 그 키 문자열에 JSON 으로 남는다', async () => {
        const m = await import('./leaf-node');
        m.writeLeafNode('leaf-y', 'n7');
        expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ 'leaf-y': 'n7' });
    });
    it('다른 키에 있는 옛 저장분은 못 읽는다', async () => {
        localStorage.setItem('pane-ui-system.leaf-node-old', JSON.stringify({ 'leaf-z': 'n1' }));
        const m = await import('./leaf-node');
        expect(m.readLeafNode('leaf-z')).toBeNull();
    });
});
