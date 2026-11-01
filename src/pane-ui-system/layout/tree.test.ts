/**
 * 패널 트리 모델 검산 — 🔴 불변식 다섯이 「어떤 연산 뒤에도」 성립하는지 두껍게 본다.
 *   ① leaf 는 항상 tabs 안 (맨몸으로 트리에 안 걸린다)
 *   ② split 자식은 2개 이상 (1개면 접히고 0개면 사라진다)
 *   ③ split 안에 같은 방향 split 이 없다 (펴서 합쳐진다)
 *   ④ sizes 합은 1, 길이는 자식 수
 *   ⑤ activeId 는 자식 중 하나 (빈 tabs 만 '')
 *   + leaf id 는 전역에서 유일
 */
import { describe, it, expect } from 'vitest';
import {
    type Workspace, type Node,
    leaf, tabs, split, emptyWorkspace, normalize,
    openLeaf, closeLeaf, activateLeaf, moveLeaf, moveTabWithin, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, areaOfLeaf,
    findLeaf, findLeafByView, flatten, sizesFor, MIN_FRACTION,
} from './tree';

/** 불변식 위반을 모아 돌려준다 — 성하면 빈 배열 */
function violations(ws: Workspace): string[] {
    const out: string[] = [];
    const ids: string[] = [];

    const walk = (node: Node | null, inTabs: boolean): void => {
        if (!node) return;
        if (node.kind === 'leaf') {
            if (!inTabs) out.push(`① 맨몸 leaf 가 트리에 걸림: ${node.id}`);
            ids.push(node.id);
            return;
        }
        if (node.kind === 'tabs') {
            for (const c of node.children) walk(c, true);
            if (node.children.length > 0 && !node.children.some((c) => c.id === node.activeId)) {
                out.push(`⑤ activeId 가 자식에 없음: ${node.id} → ${node.activeId}`);
            }
            if (node.children.length === 0 && node.activeId !== '') {
                out.push(`⑤ 빈 tabs 인데 activeId 가 비지 않음: ${node.id}`);
            }
            return;
        }
        // split
        if (node.children.length < 2) out.push(`② split 자식이 ${node.children.length}개: ${node.id}`);
        if (node.children.some((c) => c.kind === 'split' && c.dir === node.dir)) {
            out.push(`③ 같은 방향 split 중첩: ${node.id}`);
        }
        if (node.sizes.length !== node.children.length) {
            out.push(`④ sizes 길이(${node.sizes.length}) ≠ 자식 수(${node.children.length}): ${node.id}`);
        }
        const sum = node.sizes.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 1e-9) out.push(`④ sizes 합이 1 이 아님(${sum}): ${node.id}`);
        if (node.sizes.some((s) => s <= 0)) out.push(`④ sizes 에 0 이하: ${node.id}`);
        for (const c of node.children) walk(c, false);
    };

    walk(ws.center, false);
    walk(ws.left, false);
    walk(ws.right, false);
    for (const l of ws.floating) ids.push(l.id);

    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) out.push(`전역 leaf id 중복: ${[...new Set(dup)].join(', ')}`);
    return out;
}

const L = (id: string) => leaf('v', id, { id });   // 짧은 leaf 만들기

// 탭 셋이 든 가운데 하나짜리 워크스페이스
function wsThree(): Workspace {
    return normalize({ ...emptyWorkspace(), center: tabs([L('a'), L('b'), L('c')], 'a') });
}

describe('생성자·정규화 바닥', () => {
    it('빈 워크스페이스는 성하다 · center 는 빈 tabs', () => {
        const ws = emptyWorkspace();
        expect(violations(ws)).toEqual([]);
        expect(ws.center.kind).toBe('tabs');
        expect(ws.left).toBeNull();
    });

    it('sizesFor — 고르게 나누고 합이 1', () => {
        expect(sizesFor(undefined, 4)).toEqual([0.25, 0.25, 0.25, 0.25]);
        const s = sizesFor([2, 2], 2);
        expect(s[0]).toBeCloseTo(0.5);
        expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    });

    it('맨몸 leaf 가 center 에 와도 tabs 로 감싼다 (①)', () => {
        const ws = normalize({ ...emptyWorkspace(), center: L('x') as unknown as Node });
        expect(ws.center.kind).toBe('tabs');
        expect(violations(ws)).toEqual([]);
    });

    it('자식 1개 split 은 접힌다 (②)', () => {
        const ws = normalize({ ...emptyWorkspace(), center: split('row', [tabs([L('a')], 'a')]) });
        expect(ws.center.kind).toBe('tabs');
        expect(violations(ws)).toEqual([]);
    });

    it('같은 방향 split 중첩은 펴진다 (③) · 비율 보존', () => {
        const inner = split('row', [tabs([L('b')], 'b'), tabs([L('c')], 'c')], [0.5, 0.5]);
        const ws = normalize({ ...emptyWorkspace(), center: split('row', [tabs([L('a')], 'a'), inner], [0.5, 0.5]) });
        expect(ws.center.kind).toBe('split');
        if (ws.center.kind === 'split') {
            expect(ws.center.children.length).toBe(3);   // a, b, c 한 줄로
            expect(ws.center.sizes[0]).toBeCloseTo(0.5);  // a 는 그대로
            expect(ws.center.sizes[1]).toBeCloseTo(0.25); // b/c 는 0.5 × 0.5
        }
        expect(violations(ws)).toEqual([]);
    });

    it('다른 방향 split 중첩은 그대로 둔다', () => {
        const inner = split('col', [tabs([L('b')], 'b'), tabs([L('c')], 'c')]);
        const ws = normalize({ ...emptyWorkspace(), center: split('row', [tabs([L('a')], 'a'), inner]) });
        expect(violations(ws)).toEqual([]);
        if (ws.center.kind === 'split') expect(ws.center.children.length).toBe(2);
    });

    it('빈 tabs 는 떨어지고 center 는 빈 tabs 로 되살아난다', () => {
        const ws = normalize({ ...emptyWorkspace(), center: tabs([], '') });
        expect(ws.center.kind).toBe('tabs');
        expect(flatten(ws.center)).toEqual([]);
        expect(violations(ws)).toEqual([]);
    });

    it('전역 leaf id 중복은 뒤를 떨군다 (center 우선)', () => {
        const ws = normalize({
            left: tabs([L('dup')], 'dup'),
            center: tabs([L('dup'), L('only')], 'dup'),
            right: null,
            floating: [],
        });
        expect(violations(ws)).toEqual([]);
        expect(flatten(ws.center).map((l) => l.id).sort()).toEqual(['dup', 'only']);
        expect(ws.left).toBeNull();   // left 의 dup 이 떨어지며 빈 tabs → null
    });
});

describe('openLeaf / addLeafToTabs', () => {
    it('center 에 열면 첫 tabs 에 붙고 활성이 된다', () => {
        const ws = openLeaf(emptyWorkspace(), L('a'), 'center');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a']);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('a');
        expect(violations(ws)).toEqual([]);
    });

    it('같은 id 를 또 열면 안 겹치고 활성만 바뀐다', () => {
        let ws = openLeaf(emptyWorkspace(), L('a'), 'center');
        ws = openLeaf(ws, L('b'), 'center');
        ws = openLeaf(ws, L('a'), 'center');   // 다시 a
        expect(flatten(ws.center).length).toBe(2);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('a');
        expect(violations(ws)).toEqual([]);
    });

    it('left 에 열면 left 가 생긴다', () => {
        const ws = openLeaf(emptyWorkspace(), L('p'), 'left');
        expect(ws.left).not.toBeNull();
        expect(flatten(ws.left).map((l) => l.id)).toEqual(['p']);
        expect(violations(ws)).toEqual([]);
    });

    it('floating 에 열면 맨몸 더미에 쌓인다', () => {
        const ws = openLeaf(emptyWorkspace(), L('f'), 'floating');
        expect(ws.floating.map((l) => l.id)).toEqual(['f']);
        expect(violations(ws)).toEqual([]);
    });

    it('addLeafToTabs — 특정 tabs 에 붙인다', () => {
        const base = wsThree();
        const tabsId = (base.center as { id: string }).id;
        const ws = addLeafToTabs(base, tabsId, L('d'));
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(violations(ws)).toEqual([]);
    });
});

describe('closeOthers / closeToRight (W5 우클릭 메뉴용 순수 연산)', () => {
    it('다른 탭 모두 닫기 — 나만 남는다', () => {
        const ws = closeOthers(wsThree(), 'b');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b']);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('b');
        expect(violations(ws)).toEqual([]);
    });

    it('오른쪽 탭 닫기 — 뒤에 것만 닫는다(앞은 남는다)', () => {
        const ws = closeToRight(wsThree(), 'b');   // a,b,c → a,b
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b']);
        expect(violations(ws)).toEqual([]);
    });

    it('맨 오른쪽 탭에서 오른쪽 닫기 — 아무것도 안 닫힌다', () => {
        const base = wsThree();
        const ws = closeToRight(base, 'c');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    });

    it('다른 자리는 안 건드린다 — center 에서 닫아도 right 는 그대로', () => {
        let ws = openLeaf(wsThree(), L('r'), 'right');
        ws = closeOthers(ws, 'a');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a']);
        expect(flatten(ws.right).map((l) => l.id)).toEqual(['r']);
        expect(violations(ws)).toEqual([]);
    });

    it('split 안의 한 묶음에서 닫아도 그 묶음만 준다', () => {
        // center = split(row,[tabs(a,b), tabs(c)])  — 왼쪽 묶음에서 b 를 남기고 닫기
        const base = normalize({ ...emptyWorkspace(), center: tabs([L('a'), L('b')], 'a') });
        const ws0 = splitAt(base, (base.center as { id: string }).id, 'row', L('c'));
        const ws = closeOthers(ws0, 'b');
        expect(flatten(ws.center).map((l) => l.id).sort()).toEqual(['b', 'c']);
        expect(violations(ws)).toEqual([]);
    });
});

describe('areaOfLeaf', () => {
    it('어느 자리에 사는지 돌려준다', () => {
        let ws = openLeaf(wsThree(), L('r'), 'right');
        ws = openLeaf(ws, L('f'), 'floating');
        expect(areaOfLeaf(ws, 'a')).toBe('center');
        expect(areaOfLeaf(ws, 'r')).toBe('right');
        expect(areaOfLeaf(ws, 'f')).toBe('floating');
        expect(areaOfLeaf(ws, '없다')).toBeNull();
    });
});

describe('activateLeaf', () => {
    it('그 leaf 가 든 tabs 의 활성을 바꾼다', () => {
        const ws = activateLeaf(wsThree(), 'c');
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('c');
        expect(violations(ws)).toEqual([]);
    });
});

describe('closeLeaf', () => {
    it('한 장 닫으면 나머지가 남고 활성이 옮겨간다', () => {
        const ws = closeLeaf(wsThree(), 'a');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b', 'c']);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('b');
        expect(violations(ws)).toEqual([]);
    });

    it('마지막 장을 닫으면 center 는 빈 tabs 가 된다', () => {
        let ws = openLeaf(emptyWorkspace(), L('only'), 'center');
        ws = closeLeaf(ws, 'only');
        expect(ws.center.kind).toBe('tabs');
        expect(flatten(ws.center)).toEqual([]);
        expect(violations(ws)).toEqual([]);
    });

    it('🔴 split 의 한 칸에서 마지막 leaf 를 빼면 split 이 접힌다 (②)', () => {
        // center = split(row, [tabs(a), tabs(b)])
        const base = wsThreeSingle('a');
        let ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        expect(ws.center.kind).toBe('split');
        ws = closeLeaf(ws, 'b');            // 오른쪽 칸을 비운다
        expect(ws.center.kind).toBe('tabs'); // split 이 홑자식이 되어 접힌다
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a']);
        expect(violations(ws)).toEqual([]);
    });
});

// a 한 장만 든 center
function wsThreeSingle(id: string): Workspace {
    return normalize({ ...emptyWorkspace(), center: tabs([L(id)], id) });
}
function firstTabsId(ws: Workspace): string {
    return (ws.center as { id: string }).id;
}

describe('splitAt', () => {
    it('tabs 를 좌우로 가르면 split 둘이 된다', () => {
        const base = wsThreeSingle('a');
        const ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        expect(ws.center.kind).toBe('split');
        if (ws.center.kind === 'split') {
            expect(ws.center.dir).toBe('row');
            expect(ws.center.children.length).toBe(2);
            expect(ws.center.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
        }
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b']);
        expect(violations(ws)).toEqual([]);
    });

    it('같은 방향으로 또 가르면 n진으로 펴진다 (③)', () => {
        const base = wsThreeSingle('a');
        let ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        // 왼쪽 칸(a)을 다시 좌우로
        const leftTabs = (ws.center as { children: { id: string }[] }).children[0].id;
        ws = splitAt(ws, leftTabs, 'row', L('c'));
        expect(ws.center.kind).toBe('split');
        if (ws.center.kind === 'split') expect(ws.center.children.length).toBe(3);
        expect(violations(ws)).toEqual([]);
    });

    it('이미 있는 leaf 로는 안 가른다', () => {
        const base = wsThree();
        const ws = splitAt(base, firstTabsId(base), 'row', L('a'));
        expect(ws).toBe(base);
    });
});

describe('resize', () => {
    it('비율을 바꾸고 합은 1 로 유지', () => {
        const base = wsThreeSingle('a');
        let ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        const splitId = (ws.center as { id: string }).id;
        ws = resize(ws, splitId, [0.7, 0.3]);
        if (ws.center.kind === 'split') {
            expect(ws.center.sizes[0]).toBeCloseTo(0.7);
            expect(ws.center.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
        }
        expect(violations(ws)).toEqual([]);
    });
});

describe('moveLeaf — 순서 바꾸기', () => {
    it('before: 기준 앞으로', () => {
        const ws = moveLeaf(wsThree(), 'c', 'a', 'before');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['c', 'a', 'b']);
        expect(violations(ws)).toEqual([]);
    });
    it('after: 기준 뒤로', () => {
        const ws = moveLeaf(wsThree(), 'a', 'b', 'after');
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b', 'a', 'c']);
        expect(violations(ws)).toEqual([]);
    });
    it('자기 자신에 붙이면 그대로', () => {
        const base = wsThree();
        expect(moveLeaf(base, 'a', 'a', 'after')).toBe(base);
    });
});

describe('moveTabWithin — 키보드 Alt+←/→ 한 칸 옮기기', () => {
    it('오른쪽(+1): a → [b,a,c]', () => {
        const ws = moveTabWithin(wsThree(), 'a', 1);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b', 'a', 'c']);
        expect(violations(ws)).toEqual([]);
    });
    it('왼쪽(-1): c → [a,c,b]', () => {
        const ws = moveTabWithin(wsThree(), 'c', -1);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'c', 'b']);
        expect(violations(ws)).toEqual([]);
    });
    it('가운데 b 를 왼쪽 → [b,a,c]', () => {
        const ws = moveTabWithin(wsThree(), 'b', -1);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b', 'a', 'c']);
    });
    it('왼쪽 끝에서 더 왼쪽 → 그대로(이웃 없음)', () => {
        const base = wsThree();
        expect(moveTabWithin(base, 'a', -1)).toBe(base);
    });
    it('오른쪽 끝에서 더 오른쪽 → 그대로', () => {
        const base = wsThree();
        expect(moveTabWithin(base, 'c', 1)).toBe(base);
    });
    it('없는 leaf → 그대로', () => {
        const base = wsThree();
        expect(moveTabWithin(base, 'zzz', 1)).toBe(base);
    });
    it('사이드바 탭도 같은 줄 안에서 옮긴다', () => {
        let ws = normalize({ ...emptyWorkspace(), left: tabs([L('p'), L('q'), L('r')], 'p') });
        ws = moveTabWithin(ws, 'p', 1);
        expect(flatten(ws.left).map((l) => l.id)).toEqual(['q', 'p', 'r']);
        expect(violations(ws)).toEqual([]);
    });
});

describe('moveLeaf — 갈라서 새 묶음', () => {
    it('right: 기준을 좌우로 가르고 옮긴 leaf 가 오른쪽 새 묶음', () => {
        const ws = moveLeaf(wsThree(), 'c', 'a', 'right');
        expect(ws.center.kind).toBe('split');
        if (ws.center.kind === 'split') {
            expect(ws.center.dir).toBe('row');
            // 왼쪽엔 a,b / 오른쪽엔 c
            expect(flatten(ws.center.children[1]).map((l) => l.id)).toEqual(['c']);
        }
        expect(violations(ws)).toEqual([]);
    });
    it('down: 상하로 가른다', () => {
        const ws = moveLeaf(wsThree(), 'c', 'a', 'down');
        if (ws.center.kind === 'split') expect(ws.center.dir).toBe('col');
        expect(violations(ws)).toEqual([]);
    });

    it('🔴 마지막 leaf 를 갈라 빼낸 뒤 빈 tabs·홑 split 이 접힌다', () => {
        // center = split(row,[tabs(a), tabs(b)])  →  b 를 a 의 오른쪽으로 가른다
        const base = wsThreeSingle('a');
        let ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        ws = moveLeaf(ws, 'b', 'a', 'right');   // b 가 든 오른쪽 tabs 가 비어 접혀야 한다
        expect(violations(ws)).toEqual([]);
        // 여전히 a,b 둘 다 산다
        expect(flatten(ws.center).map((l) => l.id).sort()).toEqual(['a', 'b']);
    });
});

describe('moveLeaf — 자리 간 이동 (사이드바도 같은 애)', () => {
    it('기준 leaf 를 따라 center → right 로 옮긴다', () => {
        let ws = openLeaf(wsThree(), L('r'), 'right');   // 오른쪽에 r
        ws = moveLeaf(ws, 'a', 'r', 'after');            // a 를 r 뒤로
        expect(findTabsIds(ws.center).join()).not.toContain('a');
        expect(flatten(ws.right).map((l) => l.id)).toEqual(['r', 'a']);
        expect(violations(ws)).toEqual([]);
    });

    it('자리 이름으로 옮기기 — center → left 자리에 새 묶음', () => {
        const ws = moveLeaf(wsThree(), 'a', 'left', 'before');
        expect(flatten(ws.left).map((l) => l.id)).toEqual(['a']);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['b', 'c']);
        expect(violations(ws)).toEqual([]);
    });

    it('자리 이름 + 방향 — left 자리를 split 으로 감싼다', () => {
        let ws = openLeaf(wsThree(), L('p'), 'left');
        ws = moveLeaf(ws, 'a', 'left', 'down');
        expect(ws.left?.kind).toBe('split');
        expect(violations(ws)).toEqual([]);
    });

    it('floating 으로 옮기기', () => {
        const ws = moveLeaf(wsThree(), 'a', 'floating', 'after');
        expect(ws.floating.map((l) => l.id)).toEqual(['a']);
        expect(violations(ws)).toEqual([]);
    });
});

describe('찾기·펴기', () => {
    it('findLeaf 는 네 자리 어디서든 찾는다', () => {
        let ws = openLeaf(wsThree(), L('r'), 'right');
        ws = openLeaf(ws, L('f'), 'floating');
        expect(findLeaf(ws, 'a')?.id).toBe('a');
        expect(findLeaf(ws, 'r')?.id).toBe('r');
        expect(findLeaf(ws, 'f')?.id).toBe('f');
        expect(findLeaf(ws, '없다')).toBeNull();
    });
    it('findLeafByView — viewId 로 찾는다', () => {
        const ws = openLeaf(emptyWorkspace(), leaf('설정', '설정', { id: 's1' }), 'center');
        expect(findLeafByView(ws, '설정')?.id).toBe('s1');
    });
    it('flatten 은 순서대로 모든 leaf', () => {
        const base = wsThreeSingle('a');
        let ws = splitAt(base, firstTabsId(base), 'row', L('b'));
        ws = splitAt(ws, (ws.center as { children: { id: string }[] }).children[1].id, 'col', L('c'));
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    });
});

function findTabsIds(node: Node | null): string[] {
    return flatten(node).map((l) => l.id);
}

describe('연쇄 연산 뒤에도 불변식이 선다 (무작위 열·닫·가르기·옮기기)', () => {
    it('100 수를 둬도 성하다', () => {
        let ws = emptyWorkspace();
        let n = 0;
        // 재현 가능한 의사난수
        let seed = 12345;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        for (let step = 0; step < 100; step++) {
            const ids = flatten(ws.center).map((l) => l.id)
                .concat(flatten(ws.left).map((l) => l.id))
                .concat(flatten(ws.right).map((l) => l.id));
            const pick = ids[Math.floor(rand() * ids.length)];
            const op = Math.floor(rand() * 6);
            if (op === 0 || ids.length === 0) {
                n += 1;
                ws = openLeaf(ws, L(`n${n}`), (['center', 'left', 'right'] as const)[Math.floor(rand() * 3)]);
            } else if (op === 1 && pick) {
                ws = closeLeaf(ws, pick);
            } else if (op === 2 && pick) {
                const tabsId = findTabsOfId(ws, pick);
                if (tabsId) { n += 1; ws = splitAt(ws, tabsId, rand() < 0.5 ? 'row' : 'col', L(`n${n}`)); }
            } else if (op === 3 && pick && ids.length > 1) {
                const other = ids.find((x) => x !== pick);
                if (other) ws = moveLeaf(ws, pick, other, (['before', 'after', 'left', 'right', 'up', 'down'] as const)[Math.floor(rand() * 6)]);
            } else if (op === 4 && pick) {
                ws = activateLeaf(ws, pick);
            } else if (op === 5 && pick) {
                ws = moveLeaf(ws, pick, (['left', 'right', 'center'] as const)[Math.floor(rand() * 3)], 'after');
            }
            const v = violations(ws);
            expect(v, `step ${step}: ${v.join(' / ')}`).toEqual([]);
        }
    });
});

function findTabsOfId(ws: Workspace, leafId: string): string | null {
    const scan = (node: Node | null): string | null => {
        if (!node) return null;
        if (node.kind === 'tabs') return node.children.some((c) => c.id === leafId) ? node.id : null;
        if (node.kind === 'split') {
            for (const c of node.children) { const r = scan(c); if (r) return r; }
        }
        return null;
    };
    return scan(ws.center) ?? scan(ws.left) ?? scan(ws.right);
}

describe('상수', () => {
    it('MIN_FRACTION 은 0~1 사이', () => {
        expect(MIN_FRACTION).toBeGreaterThan(0);
        expect(MIN_FRACTION).toBeLessThan(1);
    });
});
