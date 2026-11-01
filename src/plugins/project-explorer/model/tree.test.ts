/**
 * 노드 나무 모델 검사 — 연산마다 하나 + normalize 세 함정(두 부모·사이클·고아) + flatten.
 *   layout/tree.test.ts 와 같은 결: 순수 함수라 입력/출력만 본다(React·DOM 0).
 */
import { describe, it, expect } from 'vitest';
import {
    type Tree, type Node,
    emptyTree, normalize, createNode, rename, move, remove, duplicate, toggleCollapse, setData, collapseAll,
    parentOf, flatten, filterIds,
} from './tree';

/** 검사용 나무를 손으로 짓는다 — id 를 직접 줘서 결과가 예측 가능하게(랜덤 uid 안 씀). */
function make(nodes: Record<string, Partial<Node> & { children?: string[] }>): Tree {
    const full: Record<string, Node> = {
        root: { id: 'root', type: 'folder', name: '루트', children: [] },
        trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] },
    };
    const referenced = new Set<string>();
    for (const n of Object.values(nodes)) for (const c of n.children ?? []) referenced.add(c);
    for (const [id, n] of Object.entries(nodes)) {
        full[id] = { id, type: n.type ?? 'folder', name: n.name ?? id, children: n.children ?? [], collapsed: n.collapsed, data: n.data };
    }
    // 아무 노드의 자식도 아닌 것은 루트 밑에 매단다(편의 — 테스트가 root.children 을 일일이 안 적게)
    full.root.children = Object.keys(nodes).filter((id) => !referenced.has(id));
    return normalize({ root: 'root', trash: 'trash', nodes: full, rev: 0 });
}

describe('emptyTree', () => {
    it('루트와 휴지통만 있다', () => {
        const t = emptyTree();
        expect(t.nodes[t.root]).toBeTruthy();
        expect(t.nodes[t.trash]).toBeTruthy();
        expect(Object.keys(t.nodes)).toHaveLength(2);
        expect(t.nodes[t.root].children).toEqual([]);
    });
});

describe('createNode', () => {
    it('부모 아래 끝에 꽂는다', () => {
        let t = emptyTree();
        t = createNode(t, 'root', { id: 'a', type: 'folder', name: 'A' });
        t = createNode(t, 'root', { id: 'b', type: 'folder', name: 'B' });
        expect(t.nodes.root.children).toEqual(['a', 'b']);
        expect(t.nodes.a.name).toBe('A');
    });

    it('index 자리에 꽂는다', () => {
        let t = emptyTree();
        t = createNode(t, 'root', { id: 'a', type: 'folder', name: 'A' });
        t = createNode(t, 'root', { id: 'b', type: 'folder', name: 'B', index: 0 });
        expect(t.nodes.root.children).toEqual(['b', 'a']);
    });

    it('없는 부모면 그대로', () => {
        const t = emptyTree();
        expect(createNode(t, 'nope', { id: 'a', type: 'folder', name: 'A' })).toBe(t);
    });

    it('data 를 담는다(불투명 칸)', () => {
        let t = emptyTree();
        t = createNode(t, 'root', { id: 'a', type: 'teacher', name: '김', data: { 시수: 18 } });
        expect(t.nodes.a.data).toEqual({ 시수: 18 });
    });
});

describe('rename', () => {
    it('이름을 바꾼다', () => {
        const t = make({ a: {} });
        expect(rename(t, 'a', '새이름').nodes.a.name).toBe('새이름');
    });
    it('앞뒤 공백을 다듬는다', () => {
        const t = make({ a: {} });
        expect(rename(t, 'a', '  둘  ').nodes.a.name).toBe('둘');
    });
    it('비면 원래 이름을 지킨다', () => {
        const t = make({ a: { name: '원래' } });
        expect(rename(t, 'a', '   ').nodes.a.name).toBe('원래');
    });
});

describe('move', () => {
    it('다른 부모 밑으로 옮긴다', () => {
        const t = make({ a: { children: ['c'] }, b: {}, c: {} });
        const r = move(t, 'c', 'b');
        expect(r.nodes.a.children).toEqual([]);
        expect(r.nodes.b.children).toEqual(['c']);
    });
    it('같은 부모 안 순서를 바꾼다', () => {
        const t = make({ p: { children: ['x', 'y', 'z'] }, x: {}, y: {}, z: {} });
        const r = move(t, 'z', 'p', 0);
        expect(r.nodes.p.children).toEqual(['z', 'x', 'y']);
    });
    it('제 자손 밑으로는 못 간다(사이클 방지)', () => {
        const t = make({ a: { children: ['b'] }, b: {} });
        expect(move(t, 'a', 'b')).toBe(t);
    });
    it('루트는 못 움직인다', () => {
        const t = make({ a: {} });
        expect(move(t, 'root', 'a')).toBe(t);
    });
    it('컨테이너 안으로 넣는다(index 생략 = 끝)', () => {
        const t = make({ box: { children: ['x'] }, x: {}, y: {} });
        const r = move(t, 'y', 'box');
        expect(r.nodes.box.children).toEqual(['x', 'y']);
        expect(r.nodes.root.children).toEqual(['box']);   // y 가 루트에서 빠졌다
    });
    it('canAccept 가 막으면 그대로, 허용하면 옮긴다(드래그 최종 관문)', () => {
        const t = make({ box: {}, item: { type: 'leaf' } });
        expect(move(t, 'item', 'box', undefined, () => false)).toBe(t);
        expect(move(t, 'item', 'box', undefined, () => true).nodes.box.children).toEqual(['item']);
    });
});

describe('duplicate', () => {
    it('깊은 복제 — 새 id, 원본 바로 뒤 형제, 자식째', () => {
        const t = make({ p: { children: ['a'] }, a: { name: '원본', children: ['b'] }, b: { name: '자식' } });
        let i = 0;
        const r = duplicate(t, 'a', () => `dup${i++}`);
        expect(r.nodes.p.children).toEqual(['a', 'dup0']);   // 원본(a) 바로 뒤
        expect(r.nodes.dup0.name).toBe('원본');
        expect(r.nodes.dup0.children).toEqual(['dup1']);
        expect(r.nodes.dup1.name).toBe('자식');
        expect(r.nodes.a.children).toEqual(['b']);           // 원본은 그대로
    });
    it('뿌리·휴지통은 복제 안 한다', () => {
        const t = make({});
        expect(duplicate(t, 'root')).toBe(t);
        expect(duplicate(t, 'trash')).toBe(t);
    });
});

describe('filterIds (검색)', () => {
    it('맞는 노드 + 그 조상만 담는다', () => {
        const t = make({ p: { children: ['a'] }, a: { name: 'needle' }, other: { name: '딴것' } });
        const keep = filterIds(t, 'root', (n) => n.name.includes('needle'));
        expect(keep.has('a')).toBe(true);
        expect(keep.has('p')).toBe(true);     // 조상은 길로 남긴다
        expect(keep.has('other')).toBe(false);
    });
});

describe('remove → 휴지통', () => {
    it('영구삭제가 아니라 휴지통 가지로 옮긴다', () => {
        const base = make({ a: { children: ['c'] }, c: {} });
        const r = remove(base, 'c');
        expect(r.nodes.a.children).toEqual([]);
        expect(r.nodes.trash.children).toEqual(['c']);
        expect(r.nodes.c).toBeTruthy();   // 노드는 살아 있다
    });
    it('자식째 휴지통으로 — 손주는 그 밑에 그대로', () => {
        const base = make({ a: { children: ['b'] }, b: { children: ['c'] }, c: {} });
        const r = remove(base, 'a');
        expect(r.nodes.trash.children).toEqual(['a']);
        expect(r.nodes.a.children).toEqual(['b']);
        expect(r.nodes.b.children).toEqual(['c']);
    });
    it('휴지통 자체는 못 지운다', () => {
        const t = make({});
        expect(remove(t, 'trash')).toBe(t);
    });
});

describe('toggleCollapse / setData', () => {
    it('접힘을 토글한다', () => {
        const t = make({ a: {} });
        expect(toggleCollapse(t, 'a').nodes.a.collapsed).toBe(true);
        expect(toggleCollapse(toggleCollapse(t, 'a'), 'a').nodes.a.collapsed).toBe(false);
    });
    it('data 를 덮어쓴다', () => {
        const t = make({ a: {} });
        expect(setData(t, 'a', { k: 1 }).nodes.a.data).toEqual({ k: 1 });
    });
});

describe('collapseAll', () => {
    it('자식 있는 노드만 접는다(루트·휴지통·잎은 그대로)', () => {
        const t = make({ a: { children: ['b'] }, b: {}, lone: {} });
        const r = collapseAll(t);
        expect(r.nodes.a.collapsed).toBe(true);
        expect(r.nodes.b.collapsed).toBeFalsy();     // 잎
        expect(r.nodes.lone.collapsed).toBeFalsy();  // 잎
        expect(r.nodes.root.collapsed).toBeFalsy();
    });
});

describe('normalize — 세 함정', () => {
    it('고아를 떨군다(어디서도 안 닿는 노드)', () => {
        const t = normalize({
            root: 'root', trash: 'trash', rev: 0,
            nodes: {
                root: { id: 'root', type: 'folder', name: 'r', children: [] },
                trash: { id: 'trash', type: 'folder', name: 't', children: [] },
                orphan: { id: 'orphan', type: 'folder', name: 'o', children: [] },
            },
        });
        expect(t.nodes.orphan).toBeUndefined();
    });

    it('두 부모를 떨군다(먼저 본 부모가 이긴다)', () => {
        const t = normalize({
            root: 'root', trash: 'trash', rev: 0,
            nodes: {
                root: { id: 'root', type: 'folder', name: 'r', children: ['a', 'b'] },
                trash: { id: 'trash', type: 'folder', name: 't', children: [] },
                a: { id: 'a', type: 'folder', name: 'a', children: ['c'] },
                b: { id: 'b', type: 'folder', name: 'b', children: ['c'] },
                c: { id: 'c', type: 'folder', name: 'c', children: [] },
            },
        });
        expect(t.nodes.a.children).toEqual(['c']);   // a 가 먼저 — c 를 지킨다
        expect(t.nodes.b.children).toEqual([]);      // b 에서 c 를 뗀다
        expect(parentOf(t, 'c')).toBe('a');
    });

    it('사이클을 끊는다(A→B→A)', () => {
        const t = normalize({
            root: 'root', trash: 'trash', rev: 0,
            nodes: {
                root: { id: 'root', type: 'folder', name: 'r', children: ['a'] },
                trash: { id: 'trash', type: 'folder', name: 't', children: [] },
                a: { id: 'a', type: 'folder', name: 'a', children: ['b'] },
                b: { id: 'b', type: 'folder', name: 'b', children: ['a'] },  // ← 사이클
            },
        });
        expect(t.nodes.a.children).toEqual(['b']);
        expect(t.nodes.b.children).toEqual([]);      // b→a 를 끊는다
    });

    it('없는 자식 id 를 떨군다', () => {
        const t = normalize({
            root: 'root', trash: 'trash', rev: 0,
            nodes: {
                root: { id: 'root', type: 'folder', name: 'r', children: ['a', 'ghost'] },
                trash: { id: 'trash', type: 'folder', name: 't', children: [] },
                a: { id: 'a', type: 'folder', name: 'a', children: [] },
            },
        });
        expect(t.nodes.root.children).toEqual(['a']);
    });

    it('루트·휴지통이 없으면 되살린다', () => {
        const t = normalize({ root: 'root', trash: 'trash', rev: 0, nodes: {} });
        expect(t.nodes.root).toBeTruthy();
        expect(t.nodes.trash).toBeTruthy();
    });
});

describe('flatten', () => {
    const isContainer = (type: string) => type === 'folder';

    it('rootId 의 자손만, 깊이와 함께', () => {
        const t = make({ a: { children: ['b'] }, b: { children: ['c'] }, c: { type: 'leaf' } });
        const rows = flatten(t, 'root', isContainer);
        expect(rows.map((r) => [r.id, r.depth])).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    });

    it('접힌 컨테이너 밑은 안 펼친다', () => {
        const t = make({ a: { children: ['b'], collapsed: true }, b: {} });
        const rows = flatten(t, 'root', isContainer);
        expect(rows.map((r) => r.id)).toEqual(['a']);
        expect(rows[0].hasChildren).toBe(true);
    });

    it('컨테이너가 아닌 타입은 자식이 있어도 안 펼친다', () => {
        const t = make({ a: { type: 'leaf', children: ['b'] }, b: {} });
        const rows = flatten(t, 'root', isContainer);
        expect(rows.map((r) => r.id)).toEqual(['a']);  // a 는 leaf — 펼침 대상 아님
        expect(rows[0].hasChildren).toBe(false);
    });

    it('휴지통 가지는 안 나온다(루트 밖)', () => {
        const base = make({ a: {} });
        const r = remove(base, 'a');
        expect(flatten(r, 'root', isContainer).map((x) => x.id)).toEqual([]);
    });
});
