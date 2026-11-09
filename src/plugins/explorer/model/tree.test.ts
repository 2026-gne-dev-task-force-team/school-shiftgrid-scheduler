/**
 * 노드 나무 모델 검사 — 연산마다 하나 + normalize 세 함정(두 부모·사이클·고아) + flatten.
 *   layout/tree.test.ts 와 같은 결: 순수 함수라 입력/출력만 본다(React·DOM 0).
 */
import { describe, it, expect } from 'vitest';
import {
    type Tree, type Node,
    emptyTree, normalize, createNode, rename, move, remove, toggleCollapse, setData,
    restore, purge, purgeAll, countUnder, topmostOnly,
    parentOf, flatten, filterIds, newFolderParent,
    emptyHistory, record, undo, redo,
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

// 🔴 item 7 회귀 — 깊은 노드를 「바깥(루트)」으로 꺼내는 길. resolveDrop 은 DOM 이라 못 재니,
//    그 연산이 기대는 move() 의 결과(루트 끝 append · 루트 형제 되기)를 순수 함수로 못 박는다.
describe('폴더 밖으로 꺼내기 (move → 루트)', () => {
    it('빈 바닥 → 루트 맨 끝: 깊은 노드를 루트에 index 생략으로 꽂으면 루트 자식 끝에 붙는다', () => {
        const t = make({ p: { children: ['a'] }, a: { children: ['b'] }, b: {}, other: {} });
        // root.children = ['p','other'] (b 는 a 밑 · a 는 p 밑)
        const r = move(t, 'b', 'root');
        expect(r.nodes.root.children).toEqual(['p', 'other', 'b']);   // 맨 끝
        expect(r.nodes.a.children).toEqual([]);                        // 깊은 부모에서 빠졌다
        expect(parentOf(r, 'b')).toBe('root');
    });
    it('깊은 폴더 → 루트 형제: 중첩 폴더를 루트로 옮기면 부모가 루트가 된다', () => {
        const t = make({ p: { children: ['a'] }, a: { children: ['b'] }, b: { children: ['c'] }, c: {} });
        const r = move(t, 'a', 'root');
        expect(parentOf(r, 'a')).toBe('root');       // 루트 형제
        expect(r.nodes.p.children).toEqual([]);      // 옛 부모에서 빠졌다
        expect(r.nodes.a.children).toEqual(['b']);   // 가지는 통째로 따라온다
        expect(parentOf(r, 'b')).toBe('a');
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
    it('trashedFrom 에 원래 부모를 적는다', () => {
        const base = make({ p: { children: ['a'] }, a: {} });
        const r = remove(base, 'a');
        expect(r.nodes.a.trashedFrom).toBe('p');
    });
});

describe('restore (복원)', () => {
    it('원래 부모가 살아 있으면 거기 끝에 · trashedFrom 은 지워진다', () => {
        let t = make({ p: { children: ['x', 'a'] }, x: {}, a: {} });
        t = remove(t, 'a');
        expect(t.nodes.trash.children).toEqual(['a']);
        const back = restore(t, 'a');
        expect(back.nodes.p.children).toEqual(['x', 'a']);   // 끝에
        expect(back.nodes.a.trashedFrom).toBeUndefined();    // normalize 가 지웠다
        expect(back.nodes.trash.children).toEqual([]);
    });
    it('원래 부모가 사라졌으면 루트로', () => {
        let t = make({ p: { children: ['b'] }, b: {} });
        t = remove(t, 'b');     // b → 휴지통(trashedFrom=p)
        t = purge(t, 'p');      // 부모 영구 삭제
        const r = restore(t, 'b');
        expect(r.nodes.root.children).toContain('b');
        expect(r.nodes.b.trashedFrom).toBeUndefined();
    });
});

describe('purge / purgeAll (영구 삭제)', () => {
    it('가지째 사라진다(자손까지)', () => {
        let t = make({ a: { children: ['b'] }, b: { children: ['c'] }, c: {} });
        t = remove(t, 'a');
        const p = purge(t, 'a');
        expect(p.nodes.a).toBeUndefined();
        expect(p.nodes.b).toBeUndefined();
        expect(p.nodes.c).toBeUndefined();
        expect(p.nodes.trash.children).toEqual([]);
    });
    it('뿌리·휴지통은 영구삭제 안 한다', () => {
        const t = make({});
        expect(purge(t, 'root')).toBe(t);
        expect(purge(t, 'trash')).toBe(t);
    });
    it('purgeAll 이 휴지통을 비운다', () => {
        let t = make({ a: {}, b: {} });
        t = remove(t, 'a'); t = remove(t, 'b');
        expect(t.nodes.trash.children).toHaveLength(2);
        const e = purgeAll(t);
        expect(e.nodes.trash.children).toEqual([]);
        expect(e.nodes.a).toBeUndefined();
        expect(e.nodes.b).toBeUndefined();
    });
});

describe('countUnder', () => {
    it('자손 수(자신 제외)', () => {
        const t = make({ a: { children: ['b'] }, b: {}, c: {} });
        expect(countUnder(t, 'root')).toBe(3);   // a,b,c
        expect(countUnder(t, 'a')).toBe(1);      // b
    });

    it('isRecord 를 주면 레코드성(일정 등)은 안 센다 — 상태바 「노드 N」', () => {
        // 폴더 2(a,b) + 레코드 3(e1,e2,e3) — e1,e2 는 a 밑, e3 은 루트 직속
        const t = make({
            a: { type: 'folder', children: ['e1', 'e2'] },
            b: { type: 'folder' },
            e1: { type: 'evt' }, e2: { type: 'evt' }, e3: { type: 'evt' },
        });
        const isRec = (type: string) => type === 'evt';
        expect(countUnder(t, 'root')).toBe(5);              // 옛 동작 — 전부
        expect(countUnder(t, 'root', isRec)).toBe(2);       // 🔴 폴더 2만(레코드 3 제외)
        expect(countUnder(t, 'a', isRec)).toBe(0);          // a 밑은 레코드뿐
    });
});

describe('topmostOnly — 조상-자손이 같이 고르면 조상만', () => {
    // f1 ▸ g1 ▸ h1 · f2 — 깊은 사슬 + 형제
    const t = make({ f1: { children: ['g1'] }, g1: { children: ['h1'] }, h1: {}, f2: {} });

    it('조상이 함께 고르면 자손을 뺀다(자손은 따라간다)', () => {
        expect(topmostOnly(t, ['f1', 'g1', 'h1'])).toEqual(['f1']);
    });
    it('조상-자손이 아니면 전부 남는다(입력 순서 유지)', () => {
        expect(topmostOnly(t, ['f2', 'f1'])).toEqual(['f2', 'f1']);
    });
    it('중간만 둘이면 그 중간만(그 밑 h1 은 빠진다)', () => {
        expect(topmostOnly(t, ['g1', 'h1'])).toEqual(['g1']);
    });
});

describe('되돌리기 더미(순수)', () => {
    const t0 = emptyTree();
    const t1: Tree = { ...t0, rev: 1 };
    const t2: Tree = { ...t0, rev: 2 };

    it('record → undo → redo', () => {
        let h = emptyHistory();
        h = record(h, t0);
        h = record(h, t1);
        const u = undo(h, t2)!;
        expect(u.value).toBe(t1);
        const u2 = undo(u.history, u.value)!;
        expect(u2.value).toBe(t0);
        expect(undo(u2.history, u2.value)).toBeNull();   // 과거가 비면 null
        const r = redo(u2.history, u2.value)!;
        expect(r.value).toBe(t1);
    });
    it('record 는 미래를 비운다(새 분기)', () => {
        let h = { past: [t0], future: [t1] };
        h = record(h, t2);
        expect(h.future).toEqual([]);
    });
    it('limit 넘으면 오래된 걸 버린다', () => {
        let h = emptyHistory();
        for (let i = 0; i < 5; i++) h = record(h, { ...t0, rev: i }, 3);
        expect(h.past).toHaveLength(3);
        expect(h.past[0].rev).toBe(2);   // rev 0·1 은 버려졌다
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

    it('주어진 뿌리의 자손만, 깊이와 함께', () => {
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

    it('레코드성(isRecord) 자식은 그 줄도 그 아래도 건너뛴다', () => {
        // f(폴더) ▸ ev(레코드) ▸ attach(레코드 밑 노드) · g(폴더)
        const t = make({ f: { children: ['ev'] }, ev: { type: 'cal.event', children: ['attach'] }, attach: { type: 'leaf' }, g: {} });
        const isRecord = (type: string) => type === 'cal.event';
        const rows = flatten(t, 'root', isContainer, { isRecord });
        expect(rows.map((r) => r.id)).toEqual(['f', 'g']);   // ev 도, 그 밑 attach 도 안 나온다
    });

    it('isRecord 없으면 옛 동작 그대로(레코드도 보인다)', () => {
        const t = make({ f: { children: ['ev'] }, ev: { type: 'cal.event' } });
        expect(flatten(t, 'root', isContainer).map((r) => r.id)).toEqual(['f', 'ev']);
    });

    // 🔴 쥔님 2026-11-02: *"하위 레코드 노드 보고 하위 토글 보이는게 아니고, 다른 하위 노드가 붙엇을때"* —
    //    ▸ 토글(hasChildren)은 보이는(레코드 아닌) 자식이 있을 때만 선다.
    it('레코드만 든 컨테이너 → hasChildren false(일정만 든 저장소엔 ▸ 안 선다)', () => {
        const t = make({ s: { children: ['ev1', 'ev2'] }, ev1: { type: 'cal.event' }, ev2: { type: 'cal.event' } });
        const isRecord = (type: string) => type === 'cal.event';
        const rows = flatten(t, 'root', isContainer, { isRecord });
        const s = rows.find((r) => r.id === 's')!;
        expect(s.hasChildren).toBe(false);
    });

    it('폴더(보이는 하위) 하나 붙으면 hasChildren true', () => {
        const t = make({ s: { children: ['ev1', 'sub'] }, ev1: { type: 'cal.event' }, sub: { type: 'folder' } });
        const isRecord = (type: string) => type === 'cal.event';
        const rows = flatten(t, 'root', isContainer, { isRecord });
        const s = rows.find((r) => r.id === 's')!;
        expect(s.hasChildren).toBe(true);
    });
});

describe('레코드성 노드는 저장·삭제·휴지통·복원·비우기가 일반 노드와 같다 (캐스케이딩 공짜)', () => {
    // f(폴더) ▸ ev(레코드) — 탐색기엔 ev 가 안 보여도 tree.nodes 에선 일반 노드다.
    const base = () => make({ f: { children: ['ev'] }, ev: { type: 'cal.event', name: '회의' } });

    it('부모 묶음 remove → 휴지통 안 레코드도 같이 간다(tree.nodes 로 확인)', () => {
        const r = remove(base(), 'f');
        expect(r.nodes['ev']).toBeTruthy();                      // 아직 있다
        expect(parentOf(r, 'ev')).toBe('f');                     // f 밑에 그대로(가지째 이동)
        expect(parentOf(r, 'f')).toBe('trash');                  // f 는 휴지통으로
    });

    it('restore → 레코드도 같이 돌아온다', () => {
        let r = remove(base(), 'f');
        r = restore(r, 'f');
        expect(parentOf(r, 'f')).toBe('root');
        expect(r.nodes['ev']).toBeTruthy();
        expect(parentOf(r, 'ev')).toBe('f');
    });

    it('purge → 레코드도 같이 영구 삭제된다', () => {
        let r = remove(base(), 'f');
        r = purge(r, 'f');
        expect(r.nodes['f']).toBeUndefined();
        expect(r.nodes['ev']).toBeUndefined();                   // 🔴 가지째 사라졌다
    });
});

describe('유도(가상) id(`/`) 는 저장 연산이 거부한다 (N4)', () => {
    // 유도 자식의 id 는 `<부모id>/<key>` — Tree.nodes 에 없고, move·remove 가 손대지 않는다.
    it('move·remove 는 `/` 든 id 에 나무를 그대로 돌려준다', () => {
        const t = make({ a: { children: [] } });
        expect(move(t, 'a/d1', 'a')).toBe(t);        // 가상 id 를 옮기려 해도 변화 없음(객체 동일)
        expect(remove(t, 'a/d1')).toBe(t);
        // 실노드 'a' 를 가상 부모(a/d1) 밑으로 — 부모가 실물이 아니라 거부(a 는 그대로 루트 밑)
        const moved = move(t, 'a', 'a/d1');
        expect(parentOf(moved, 'a')).toBe('root');
    });
});

describe('newFolderParent — 새 폴더는 늘 어떤 폴더 하위로', () => {
    // 폴더만 컨테이너, file 은 아니다(등록 표 대신 테스트가 주입하는 판정)
    const isC = (type: string) => type === 'folder';
    // f1(폴더) ▸ file1(파일) · f2(폴더) — file1 만 f1 의 자식, 나머지는 루트 직속
    const base = () => make({
        f1: { type: 'folder', children: ['file1'] },
        file1: { type: 'file' },
        f2: { type: 'folder' },
    });

    // ── via 'context'(우클릭 = 「이 노드에서」, 기본값) — 컨테이너면 그 안, 파일이면 그 부모 ──
    it('[context] 컨테이너를 고르면 그 안', () => {
        expect(newFolderParent(base(), 'f1', isC, 'context')).toBe('f1');
        expect(newFolderParent(base(), 'f1', isC)).toBe('f1');            // 기본값이 context
    });

    it('[context] 파일을 고르면 그 부모', () => {
        expect(newFolderParent(base(), 'file1', isC, 'context')).toBe('f1');
    });

    it('[context] 루트를 고르면 루트 안(루트도 컨테이너다)', () => {
        expect(newFolderParent(base(), 'root', isC, 'context')).toBe('root');
    });

    // ── via 'selection'(헤더 단추·팔레트·단축키 = 「고른 것 기준」) — 늘 고른 노드의 형제로 ──
    it('[selection] 컨테이너를 골라도 그 안이 아니라 형제로(= 부모 안) — 옵시디언 헤더 단추', () => {
        // f1 은 루트 직속 → 형제는 루트. ⛔ f1 안으로 안 들어간다
        expect(newFolderParent(base(), 'f1', isC, 'selection')).toBe('root');
    });

    it('[selection] 깊은 노드를 고르면 그 부모(같은 층)', () => {
        // file1 은 f1 밑 → 형제 자리는 f1
        expect(newFolderParent(base(), 'file1', isC, 'selection')).toBe('f1');
    });

    it('[selection] 연속 두 번 — 방금 만든 형제를 골라도 또 같은 층(하위로 파고들지 않는다)', () => {
        // 루트 밑 sub(폴더) 하나를 상정: 그걸 고른 채 selection 으로 또 만들면 형제(루트)가 나온다
        const t = make({ sub: { type: 'folder' } });     // sub 은 루트 직속
        expect(newFolderParent(t, 'sub', isC, 'selection')).toBe('root');
    });

    it('[selection] 아무것도 안 골랐으면 루트', () => {
        expect(newFolderParent(base(), null, isC, 'selection')).toBe('root');
    });

    // ── 두 경로 공통 — 유도·휴지통·없는 id 는 루트 ──
    it('아무것도 안 골랐으면 루트(context)', () => {
        expect(newFolderParent(base(), null, isC, 'context')).toBe('root');
    });

    it('휴지통 안 노드를 고르면 루트(새 폴더는 휴지통에 안 생긴다)', () => {
        const t = remove(base(), 'f2');          // f2 를 휴지통으로
        expect(newFolderParent(t, 'f2', isC, 'context')).toBe('root');
        expect(newFolderParent(t, 'f2', isC, 'selection')).toBe('root');
    });

    it('휴지통 자체를 고르면 루트', () => {
        const t = base();
        expect(newFolderParent(t, t.trash, isC, 'context')).toBe('root');
        expect(newFolderParent(t, t.trash, isC, 'selection')).toBe('root');
    });

    it('가상(유도) id 를 고르면 루트(실부모가 없다)', () => {
        expect(newFolderParent(base(), 'f1/v', isC, 'context')).toBe('root');
        expect(newFolderParent(base(), 'f1/v', isC, 'selection')).toBe('root');
    });

    it('없는 id 를 고르면 루트', () => {
        expect(newFolderParent(base(), 'nope', isC, 'context')).toBe('root');
        expect(newFolderParent(base(), 'nope', isC, 'selection')).toBe('root');
    });
});
