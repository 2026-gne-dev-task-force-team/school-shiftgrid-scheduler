import { describe, expect, it } from 'vitest';
import { buildTree } from './subitems';

interface R { id: string; parent: string | null }
const rs = (...ids: [string, string | null][]): R[] => ids.map(([id, parent]) => ({ id, parent }));
const tree = (records: R[], collapsed: string[] = []) =>
    buildTree(records, (r) => r.id, (r) => r.parent, (id) => collapsed.includes(id))
        .map((t) => `${'·'.repeat(t.depth)}${t.row.id}${t.hasChildren ? '+' : ''}`);

describe('buildTree — 하위 항목 펴기', () => {
    it('평평한 목록은 그대로(깊이 0 · 자식 없음)', () => {
        expect(tree(rs(['a', null], ['b', null]))).toEqual(['a', 'b']);
    });
    it('부모-자식은 깊이로 · 형제 순서는 입력 순서', () => {
        expect(tree(rs(['a', null], ['a1', 'a'], ['a2', 'a'], ['b', null]))).toEqual(['a+', '·a1', '·a2', 'b']);
    });
    it('손주까지 깊이-우선', () => {
        expect(tree(rs(['a', null], ['a1', 'a'], ['a1x', 'a1'], ['b', null]))).toEqual(['a+', '·a1+', '··a1x', 'b']);
    });
    it('접힌 부모의 자손은 안 보인다(자식 표식은 남는다)', () => {
        expect(tree(rs(['a', null], ['a1', 'a'], ['a1x', 'a1'], ['b', null]), ['a'])).toEqual(['a+', 'b']);
    });
    it('일부만 접기', () => {
        expect(tree(rs(['a', null], ['a1', 'a'], ['a1x', 'a1']), ['a1'])).toEqual(['a+', '·a1+']);
    });
    it('유령 부모(목록에 없는 부모)는 뿌리로 올린다 — 미아 방지', () => {
        expect(tree(rs(['orphan', 'gone'], ['b', null]))).toEqual(['orphan', 'b']);
    });
    it('순환(자기참조)이어도 무한 루프 없이 한 번씩만', () => {
        const out = tree(rs(['a', 'b'], ['b', 'a']));
        expect(out.length).toBe(2);
    });
});
