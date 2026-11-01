/**
 * 가지 내보내기/들여오기(N5) 검사 — 순수 함수라 입력/출력만 본다.
 *   🔴 핵심: 같은 파일을 두 번 들여와도 「덮지 않고」 새 가지로 — 노드 수 정확히 두 배, id 겹침 0.
 */
import { describe, it, expect } from 'vitest';
import { type Tree, type Node, normalize, countUnder } from './tree';
import { BRANCH_FORMAT, exportBranch, importBranch, validateBranchFile } from './transfer';

/** 검사용 나무 — a[ b, c[ d ] ]. a 가지 크기 4(a,b,c,d). */
function sample(): Tree {
    const nodes: Record<string, Node> = {
        root: { id: 'root', type: 'folder', name: '루트', children: ['a'] },
        trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] },
        a: { id: 'a', type: 'folder', name: 'A', children: ['b', 'c'] },
        b: { id: 'b', type: 'pt.sample', name: 'B', children: [], data: { v: 1 } },
        c: { id: 'c', type: 'folder', name: 'C', children: ['d'] },
        d: { id: 'd', type: 'pt.sample', name: 'D', children: [] },
    };
    return normalize({ root: 'root', trash: 'trash', nodes, rev: 0 });
}

describe('exportBranch', () => {
    it('가지 통째(자신+자손)를 담고 data 는 지킨다 · 루트/휴지통은 못 내보낸다', () => {
        const t = sample();
        const file = exportBranch(t, 'a', () => '2026-11-01T00:00:00Z')!;
        expect(file.format).toBe(BRANCH_FORMAT);
        expect(file.version).toBe(1);
        expect(file.root).toBe('a');
        expect(Object.keys(file.nodes).sort()).toEqual(['a', 'b', 'c', 'd']);
        expect(file.nodes.b.data).toEqual({ v: 1 });
        expect(exportBranch(t, 'root')).toBeNull();
        expect(exportBranch(t, 'trash')).toBeNull();
        expect(exportBranch(t, '없음')).toBeNull();
    });
});

describe('validateBranchFile', () => {
    it('모양이 틀린 것은 null', () => {
        expect(validateBranchFile(null)).toBeNull();
        expect(validateBranchFile({})).toBeNull();
        expect(validateBranchFile({ format: 'x', version: 1, root: 'a', nodes: {} })).toBeNull();
        expect(validateBranchFile({ format: BRANCH_FORMAT, version: 2, root: 'a', nodes: { a: { id: 'a', type: 'folder', name: 'A' } } })).toBeNull();
        expect(validateBranchFile({ format: BRANCH_FORMAT, version: 1, root: 'z', nodes: { a: { id: 'a', type: 'folder', name: 'A' } } })).toBeNull();
    });
    it('옳은 것은 BranchFile', () => {
        const ok = validateBranchFile({ format: BRANCH_FORMAT, version: 1, exportedAt: '', root: 'a', nodes: { a: { id: 'a', type: 'folder', name: 'A', children: [] } } });
        expect(ok?.root).toBe('a');
    });
});

describe('importBranch — 덮지 않고 새 가지로', () => {
    it('같은 파일을 두 번 들여오면 노드 수 정확히 두 배 · id 겹침 0', () => {
        const file = exportBranch(sample(), 'a')!;
        let i = 0;
        const gen = () => `x${i++}`;

        // 빈 나무에 두 번 들여온다.
        let t: Tree = normalize({ root: 'root', trash: 'trash', nodes: { root: { id: 'root', type: 'folder', name: '루트', children: [] }, trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] } }, rev: 0 });

        const idsBefore = new Set(Object.keys(t.nodes));
        const r1 = importBranch(t, 'root', file, gen)!;
        t = r1.tree;
        const after1 = new Set(Object.keys(t.nodes));
        const added1 = [...after1].filter((x) => !idsBefore.has(x));
        expect(countUnder(t, t.root)).toBe(4);              // 가지 하나(4)

        const r2 = importBranch(t, 'root', file, gen)!;
        t = r2.tree;
        const added2 = [...new Set(Object.keys(t.nodes))].filter((x) => !after1.has(x));
        expect(countUnder(t, t.root)).toBe(8);              // 두 배

        // 🔴 id 겹침 0 — 두 들여오기가 만든 id 가 하나도 안 겹친다
        expect(added1.some((x) => added2.includes(x))).toBe(false);
        expect(r1.newRootId).not.toBe(r2.newRootId);
    });

    it('구조·data 를 지키며 children 을 새 id 로 다시 잇는다', () => {
        const file = exportBranch(sample(), 'a')!;
        let i = 0;
        const t = normalize({ root: 'root', trash: 'trash', nodes: { root: { id: 'root', type: 'folder', name: '루트', children: [] }, trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] } }, rev: 0 });
        const r = importBranch(t, 'root', file, () => `n${i++}`)!;
        const newA = r.tree.nodes[r.newRootId];
        expect(newA.name).toBe('A');
        expect(newA.children).toHaveLength(2);                 // b, c 재매핑
        const newC = r.tree.nodes[newA.children[1]];
        expect(newC.name).toBe('C');
        expect(newC.children).toHaveLength(1);                 // d 재매핑
        const newB = r.tree.nodes[newA.children[0]];
        expect(newB.data).toEqual({ v: 1 });                  // data 지킴
        // 옛 id 는 하나도 안 남는다(전부 재발급)
        expect(r.tree.nodes.a).toBeUndefined();
        expect(r.tree.nodes.b).toBeUndefined();
    });

    it('부모가 없으면 루트 밑으로', () => {
        const file = exportBranch(sample(), 'a')!;
        let i = 0;
        const t = normalize({ root: 'root', trash: 'trash', nodes: { root: { id: 'root', type: 'folder', name: '루트', children: [] }, trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] } }, rev: 0 });
        const r = importBranch(t, '없는부모', file, () => `n${i++}`)!;
        expect(r.tree.nodes.root.children).toContain(r.newRootId);
    });
});
