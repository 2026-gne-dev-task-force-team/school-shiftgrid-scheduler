/**
 * 패널 트리 모델 — 「무엇이 어디 있나」를 담는 한 자료구조. React 0줄 · 순수.
 *
 * 🔴 이 파일은 DOM 도 localStorage 도 모른다(보관은 workspace-store.ts). 연산은 전부
 *    입력 트리를 안 바꾸고 새 트리를 돌려준다 — 그래서 node 에서 통째로 검산되고 undo 도 쉽다.
 *
 * ⭐ 모양(옵시디언 leaf 식):
 *    - leaf  : 패널 한 장. viewId 만 들고 있고 무엇을 그릴지는 모른다(뷰 등록소가 안다)
 *    - tabs  : leaf 묶음 + 활성 하나. leaf 는 항상 tabs 안에 산다(맨몸으로 트리에 안 걸린다)
 *    - split : 같은 방향 자식 2개 이상 + 비율. 같은 방향 split 끼리는 펴서 합친다(n진)
 *
 * 🔴 불변식은 normalize() 하나가 모든 연산 끝에서 강제한다. 연산마다 따로 챙기면 어딘가 빠진다.
 */

export interface Leaf {
    kind: 'leaf';
    id: string;
    viewId: string;
    title: string;
    params?: Record<string, unknown>;
}

export interface TabsNode {
    kind: 'tabs';
    id: string;
    children: Leaf[];
    activeId: string;
}

export interface SplitNode {
    kind: 'split';
    id: string;
    dir: 'row' | 'col';
    children: Node[];
    sizes: number[];
}

export type Node = Leaf | TabsNode | SplitNode;

/** 트리가 사는 네 자리. left/right 는 비면 null, center 는 늘 Node(빈 tabs 라도), floating 은 맨몸 leaf 더미 */
export type AreaKey = 'left' | 'center' | 'right' | 'floating';

export interface Workspace {
    left: Node | null;
    center: Node;
    right: Node | null;
    /** 피크·떠 있는 창 — 맨몸 leaf 다(여기선 tabs 불변식이 적용되지 않는다). 보관하지 않는다 */
    floating: Leaf[];
}

/** 스플릿 한 칸이 가질 수 있는 최소 비율 — 끌어도 칸이 사라지지 않게 */
export const MIN_FRACTION = 0.05;

// ─────────────────────────── id ───────────────────────────

let counter = 0;
/** 트리 안에서 유일한 id. 랜덤 꼬리는 기기 간 병합에서 충돌을 막는다 */
export function uid(prefix = 'n'): string {
    counter += 1;
    return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────── 생성자 ───────────────────────────

export function leaf(viewId: string, title: string, opts?: { id?: string; params?: Record<string, unknown> }): Leaf {
    return { kind: 'leaf', id: opts?.id ?? uid('leaf'), viewId, title, params: opts?.params };
}

export function tabs(children: Leaf[], activeId?: string): TabsNode {
    return { kind: 'tabs', id: uid('tabs'), children, activeId: activeId ?? children[0]?.id ?? '' };
}

export function emptyTabs(): TabsNode {
    return { kind: 'tabs', id: uid('tabs'), children: [], activeId: '' };
}

export function split(dir: 'row' | 'col', children: Node[], sizes?: number[]): SplitNode {
    return { kind: 'split', id: uid('split'), dir, children, sizes: sizes ?? sizesFor(undefined, children.length) };
}

export function emptyWorkspace(): Workspace {
    return { left: null, center: emptyTabs(), right: null, floating: [] };
}

// ─────────────────────────── 비율 ───────────────────────────

/** 합이 정확히 1 이 되게 손본다(마지막 칸으로 반올림 오차를 흡수) */
function fixSum(sizes: number[]): number[] {
    if (sizes.length === 0) return sizes;
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    const out = sizes.map((s) => s / sum);
    const partial = out.slice(0, -1).reduce((a, b) => a + b, 0);
    out[out.length - 1] = 1 - partial;
    return out;
}

/** n칸짜리 성한 비율. 들어온 값이 모양이 맞으면 renormalize, 아니면 고르게 나눈다 */
export function sizesFor(sizes: number[] | undefined, n: number): number[] {
    if (n <= 0) return [];
    if (Array.isArray(sizes) && sizes.length === n
        && sizes.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)) {
        return fixSum(sizes);
    }
    return fixSum(new Array(n).fill(1 / n));
}

// ─────────────────────────── normalize ───────────────────────────

/**
 * 한 노드를 성한 꼴로. keep 은 leaf 를 받아들일지 정한다(전역 id 중복 제거에 쓴다).
 *  - 빈 tabs → null (바깥에서 center 만 빈 tabs 로 되살린다)
 *  - 자식 1개 split → 그 자식으로 접음 · 0개 → null
 *  - 같은 방향 split 중첩 → 펴서 합침(비율은 곱해서 보존)
 *  - 맨몸 leaf → tabs 로 감쌈
 *  - activeId 가 자식에 없으면 첫 자식
 */
function normNode(node: Node | null, keep: (l: Leaf) => boolean): Node | null {
    if (!node) return null;

    if (node.kind === 'leaf') {
        if (!keep(node)) return null;
        return { kind: 'tabs', id: uid('tabs'), children: [node], activeId: node.id };
    }

    if (node.kind === 'tabs') {
        const children = node.children.filter((c) => c && c.kind === 'leaf' && keep(c));
        if (children.length === 0) return null;
        const activeId = children.some((c) => c.id === node.activeId) ? node.activeId : children[0].id;
        return { ...node, children, activeId };
    }

    // split
    const base = sizesFor(node.sizes, node.children.length);
    const survivors: { node: Node; size: number }[] = [];
    node.children.forEach((c, i) => {
        const n = normNode(c, keep);
        if (n) survivors.push({ node: n, size: base[i] ?? 1 / node.children.length });
    });

    // 같은 방향 split 펴기 — 안쪽 비율에 바깥 몫을 곱해 비례를 지킨다
    const flat: { node: Node; size: number }[] = [];
    for (const s of survivors) {
        if (s.node.kind === 'split' && s.node.dir === node.dir) {
            const inner = s.node;
            inner.children.forEach((gc, j) => flat.push({ node: gc, size: s.size * (inner.sizes[j] ?? 1 / inner.children.length) }));
        } else {
            flat.push(s);
        }
    }

    if (flat.length === 0) return null;
    if (flat.length === 1) return flat[0].node;    // 🔴 자식 1개면 접는다 (버그 심기 검산 지점)
    return { ...node, children: flat.map((f) => f.node), sizes: fixSum(flat.map((f) => f.size)) };
}

/**
 * 워크스페이스 전체를 성한 꼴로. leaf id 는 전역에서 유일해야 한다 —
 * center → left → right → floating 순으로 훑으며 뒤에 또 나오는 같은 id 는 떨군다.
 */
export function normalize(ws: Workspace): Workspace {
    const seen = new Set<string>();
    const keep = (l: Leaf): boolean => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
    };
    const center = normNode(ws.center, keep) ?? emptyTabs();
    const left = normNode(ws.left, keep);
    const right = normNode(ws.right, keep);
    const floating = ws.floating.filter((l) => l && l.kind === 'leaf' && keep(l)).map((l) => ({ ...l }));
    return { left, center, right, floating };
}

// ─────────────────────────── 트리 보행 ───────────────────────────

/** 모든 노드에 fn 을 먹인다(자식부터 바꾼 뒤 자신). null 자식은 떨군다 */
function mapTree(node: Node | null, fn: (n: Node) => Node): Node | null {
    if (!node) return null;
    if (node.kind === 'split') {
        const children = node.children.map((c) => mapTree(c, fn)).filter((c): c is Node => c !== null);
        return fn({ ...node, children });
    }
    return fn(node);
}

/** id 가 맞는 노드를 make(그 노드)로 갈아끼운다 */
function replaceNodeById(node: Node | null, id: string, make: (n: Node) => Node): Node | null {
    return mapTree(node, (n) => (n.id === id ? make(n) : n));
}

/** 맨몸 leaf 는 지우고, tabs 는 걸러내고 activeId 를 손본다(접기는 normalize 몫) */
function removeLeafRaw(node: Node | null, id: string): Node | null {
    if (!node) return null;
    if (node.kind === 'leaf') return node.id === id ? null : node;
    if (node.kind === 'tabs') {
        const children = node.children.filter((c) => c.id !== id);
        const activeId = children.some((c) => c.id === node.activeId) ? node.activeId : (children[0]?.id ?? '');
        return { ...node, children, activeId };
    }
    return { ...node, children: node.children.map((c) => removeLeafRaw(c, id)).filter((c): c is Node => c !== null) };
}

function findTabsContaining(node: Node | null, leafId: string): TabsNode | null {
    if (!node) return null;
    if (node.kind === 'leaf') return null;
    if (node.kind === 'tabs') return node.children.some((c) => c.id === leafId) ? node : null;
    for (const c of node.children) {
        const r = findTabsContaining(c, leafId);
        if (r) return r;
    }
    return null;
}

export function firstTabs(node: Node | null): TabsNode | null {
    if (!node) return null;
    if (node.kind === 'leaf') return null;
    if (node.kind === 'tabs') return node;
    for (const c of node.children) {
        const r = firstTabs(c);
        if (r) return r;
    }
    return null;
}

/** 맨 끝(오른쪽/아래) 탭 줄 — 가운데 영역의 「오른쪽 끝 슬롯」을 어느 탭 줄에 붙일지 고른다(W6) */
export function lastTabs(node: Node | null): TabsNode | null {
    if (!node) return null;
    if (node.kind === 'leaf') return null;
    if (node.kind === 'tabs') return node;
    for (let i = node.children.length - 1; i >= 0; i--) {
        const r = lastTabs(node.children[i]);
        if (r) return r;
    }
    return null;
}

// ─────────────────────────── 조회 ───────────────────────────

/** leaf 하나를 네 자리 어디서든 찾는다 */
export function findLeaf(ws: Workspace, id: string): Leaf | null {
    for (const area of ['center', 'left', 'right'] as const) {
        const t = findTabsContaining(ws[area], id);
        if (t) return t.children.find((c) => c.id === id) ?? null;
    }
    return ws.floating.find((l) => l.id === id) ?? null;
}

/** viewId 로 (처음 걸리는) leaf 찾기 — 단일 창(설정 등) 재사용에 쓴다 */
export function findLeafByView(ws: Workspace, viewId: string): Leaf | null {
    const all = [...flatten(ws.center), ...flatten(ws.left), ...flatten(ws.right), ...ws.floating];
    return all.find((l) => l.viewId === viewId) ?? null;
}

/** 노드 아래 모든 leaf 를 순서대로 — 모바일 탭 전환이 쓴다 */
export function flatten(node: Node | null): Leaf[] {
    if (!node) return [];
    if (node.kind === 'leaf') return [node];
    if (node.kind === 'tabs') return [...node.children];
    return node.children.flatMap(flatten);
}

// ─────────────────────────── 연산 (전부 순수) ───────────────────────────

function applyAreas(
    ws: Workspace,
    f: (node: Node | null) => Node | null,
    floating: Leaf[] = ws.floating,
): Workspace {
    return normalize({ left: f(ws.left), center: f(ws.center) ?? emptyTabs(), right: f(ws.right), floating });
}

/** 활성 탭 바꾸기 — leaf 가 든 tabs 의 activeId 를 그 leaf 로 */
export function activateLeaf(ws: Workspace, id: string): Workspace {
    return applyAreas(ws, (node) =>
        mapTree(node, (n) => (n.kind === 'tabs' && n.children.some((c) => c.id === id) ? { ...n, activeId: id } : n)));
}

/** leaf 닫기 — 어느 자리에 있든 뺀다. 빈 tabs·홑자식 split 은 normalize 가 접는다 */
export function closeLeaf(ws: Workspace, id: string): Workspace {
    return normalize({
        left: removeLeafRaw(ws.left, id),
        center: removeLeafRaw(ws.center, id) ?? emptyTabs(),
        right: removeLeafRaw(ws.right, id),
        floating: ws.floating.filter((l) => l.id !== id),
    });
}

/** leaf 제목 바꾸기 — 내용 메뉴(이름 바꾸기)가 쓴다. 트리 모양은 안 바뀐다(순수) */
export function renameLeaf(ws: Workspace, id: string, title: string): Workspace {
    const t = title.trim();
    if (!t) return ws;
    const ren = (l: Leaf): Leaf => (l.id === id ? { ...l, title: t } : l);
    const base = applyAreas(ws, (node) =>
        mapTree(node, (n) => (n.kind === 'tabs' ? { ...n, children: n.children.map(ren) } : n)));
    return { ...base, floating: base.floating.map(ren) };
}

/** leaf 가 어느 자리에 사나 — 우클릭 메뉴가 「지금 자리」 항목을 비활성할 때 쓴다 */
export function areaOfLeaf(ws: Workspace, id: string): AreaKey | null {
    for (const area of ['center', 'left', 'right'] as const) {
        if (findTabsContaining(ws[area], id)) return area;
    }
    if (ws.floating.some((l) => l.id === id)) return 'floating';
    return null;
}

/** 이 leaf 가 든 tabs 에서 「나만 빼고」 전부 닫기 — 다른 자리는 안 건드린다 */
export function closeOthers(ws: Workspace, id: string): Workspace {
    const t = findTabsContaining(ws.center, id)
        ?? findTabsContaining(ws.left, id)
        ?? findTabsContaining(ws.right, id);
    if (!t) return ws;
    const victims = t.children.filter((c) => c.id !== id).map((c) => c.id);
    return victims.reduce((w, v) => closeLeaf(w, v), ws);
}

/** 이 leaf 보다 「오른쪽(뒤)」 탭을 전부 닫기 — 같은 tabs 안에서만 */
export function closeToRight(ws: Workspace, id: string): Workspace {
    const t = findTabsContaining(ws.center, id)
        ?? findTabsContaining(ws.left, id)
        ?? findTabsContaining(ws.right, id);
    if (!t) return ws;
    const i = t.children.findIndex((c) => c.id === id);
    if (i < 0) return ws;
    const victims = t.children.slice(i + 1).map((c) => c.id);
    return victims.reduce((w, v) => closeLeaf(w, v), ws);
}

/** leaf 열기 — 이미 같은 id 가 있으면 그걸 활성화. floating 이면 더미 끝에, 아니면 그 자리 첫 tabs 에 */
export function openLeaf(ws: Workspace, lf: Leaf, where: AreaKey = 'center'): Workspace {
    if (findLeaf(ws, lf.id)) return activateLeaf(ws, lf.id);
    if (where === 'floating') return normalize({ ...ws, floating: [...ws.floating, lf] });

    const node = ws[where];
    const target = firstTabs(node);
    if (!target) {
        return normalize({ ...ws, [where]: tabs([lf], lf.id) } as Workspace);
    }
    const next = replaceNodeById(node, target.id, (t) =>
        t.kind === 'tabs' ? { ...t, children: [...t.children, lf], activeId: lf.id } : t);
    return normalize({ ...ws, [where]: next } as Workspace);
}

/** 특정 tabs 에 leaf 더하기 — 탭 줄의 + 가 쓴다 */
export function addLeafToTabs(ws: Workspace, tabsId: string, lf: Leaf): Workspace {
    if (findLeaf(ws, lf.id)) return activateLeaf(ws, lf.id);
    return applyAreas(ws, (node) =>
        replaceNodeById(node, tabsId, (t) =>
            t.kind === 'tabs' ? { ...t, children: [...t.children, lf], activeId: lf.id } : t));
}

/** tabs 를 둘로 가른다 — 새 leaf 가 든 tabs 가 그 방향 뒤쪽에 선다 */
export function splitAt(ws: Workspace, tabsId: string, dir: 'row' | 'col', newLeaf: Leaf): Workspace {
    if (findLeaf(ws, newLeaf.id)) return ws;    // 이미 있는 leaf 로는 안 가른다
    return applyAreas(ws, (node) =>
        replaceNodeById(node, tabsId, (t) => split(dir, [t, tabs([newLeaf], newLeaf.id)])));
}

/** 스플릿 비율 바꾸기 */
export function resize(ws: Workspace, splitId: string, sizes: number[]): Workspace {
    return applyAreas(ws, (node) =>
        mapTree(node, (n) => (n.kind === 'split' && n.id === splitId ? { ...n, sizes: sizesFor(sizes, n.children.length) } : n)));
}

export type MovePos = 'before' | 'after' | 'left' | 'right' | 'up' | 'down';

const DIR_OF: Record<Exclude<MovePos, 'before' | 'after'>, 'row' | 'col'> = {
    left: 'row', right: 'row', up: 'col', down: 'col',
};
const BEFORE_SIDE = new Set<MovePos>(['before', 'left', 'up']);

/**
 * leaf 옮기기 — 이 하나가 「탭 순서 바꾸기」·「다른 묶음으로」·「갈라서 새 묶음」·「한 자리에서 딴 자리로」를 전부 한다.
 *   target : 옮겨 붙일 기준 leaf 의 id, 또는 자리 이름('left'|'center'|'right'|'floating')
 *   pos    : before/after = 그 묶음 안 순서 · left/right/up/down = 그 방향으로 갈라 새 묶음
 */
export function moveLeaf(ws: Workspace, leafId: string, target: string, pos: MovePos): Workspace {
    const moving = findLeaf(ws, leafId);
    if (!moving) return ws;
    if (target === leafId) return ws;            // 자기 자신에 붙이기 = 무의미

    const areaKeys: AreaKey[] = ['left', 'center', 'right', 'floating'];
    const toArea = areaKeys.includes(target as AreaKey) ? (target as AreaKey) : null;

    // 1) 옮길 leaf 를 어디서든 뺀다(아직 normalize 안 함 — 기준 묶음이 중간에 접히면 안 되니까)
    const stripped: Workspace = {
        left: removeLeafRaw(ws.left, leafId),
        center: removeLeafRaw(ws.center, leafId) ?? emptyTabs(),
        right: removeLeafRaw(ws.right, leafId),
        floating: ws.floating.filter((l) => l.id !== leafId),
    };
    const fresh: Leaf = { ...moving };

    // 2a) 자리 이름으로 옮기기
    if (toArea) {
        if (toArea === 'floating') {
            if (pos === 'before') return normalize({ ...stripped, floating: [fresh, ...stripped.floating] });
            return normalize({ ...stripped, floating: [...stripped.floating, fresh] });
        }
        const node = stripped[toArea];
        if (pos === 'before' || pos === 'after') {
            const t = firstTabs(node);
            if (!t) return normalize({ ...stripped, [toArea]: tabs([fresh], fresh.id) } as Workspace);
            const next = replaceNodeById(node, t.id, (tn) => {
                if (tn.kind !== 'tabs') return tn;
                const children = pos === 'before' ? [fresh, ...tn.children] : [...tn.children, fresh];
                return { ...tn, children, activeId: fresh.id };
            });
            return normalize({ ...stripped, [toArea]: next } as Workspace);
        }
        // 방향 → 자리 전체를 split 으로 감싼다
        const dir = DIR_OF[pos];
        const newTabs = tabs([fresh], fresh.id);
        if (!node) return normalize({ ...stripped, [toArea]: newTabs } as Workspace);
        const wrapped = BEFORE_SIDE.has(pos) ? split(dir, [newTabs, node]) : split(dir, [node, newTabs]);
        return normalize({ ...stripped, [toArea]: wrapped } as Workspace);
    }

    // 2b) 기준 leaf 로 옮기기 — 어느 자리에 있든
    const applyToTargetArea = (fn: (node: Node | null) => Node | null): Workspace => {
        for (const area of ['center', 'left', 'right'] as const) {
            if (findTabsContaining(stripped[area], target)) {
                return normalize({ ...stripped, [area]: fn(stripped[area]) } as Workspace);
            }
        }
        // 기준이 floating 이면 거기에 쌓는다
        if (stripped.floating.some((l) => l.id === target)) {
            const idx = stripped.floating.findIndex((l) => l.id === target);
            const at = pos === 'before' || BEFORE_SIDE.has(pos) ? idx : idx + 1;
            const floating = [...stripped.floating];
            floating.splice(at, 0, fresh);
            return normalize({ ...stripped, floating });
        }
        return ws;    // 기준을 못 찾음 — 원본 그대로
    };

    const targetTabs = findTabsContaining(stripped.center, target)
        ?? findTabsContaining(stripped.left, target)
        ?? findTabsContaining(stripped.right, target);
    if (!targetTabs) return applyToTargetArea((n) => n);   // floating 분기 또는 원본

    if (pos === 'before' || pos === 'after') {
        return applyToTargetArea((node) =>
            replaceNodeById(node, targetTabs.id, (tn) => {
                if (tn.kind !== 'tabs') return tn;
                const i = tn.children.findIndex((c) => c.id === target);
                const at = pos === 'before' ? i : i + 1;
                const children = [...tn.children];
                children.splice(at, 0, fresh);
                return { ...tn, children, activeId: fresh.id };
            }));
    }

    // 방향 → 기준 tabs 를 split 으로 감싼다
    const dir = DIR_OF[pos];
    const newTabs = tabs([fresh], fresh.id);
    return applyToTargetArea((node) =>
        replaceNodeById(node, targetTabs.id, (tn) =>
            BEFORE_SIDE.has(pos) ? split(dir, [newTabs, tn]) : split(dir, [tn, newTabs])));
}

/**
 * 같은 탭 줄 안에서 한 칸 옮기기 — 키보드 Alt+←/→(W6, 접근성 대안)가 쓴다.
 *   delta -1 = 왼쪽(앞), +1 = 오른쪽(뒤). 이웃이 없으면(양 끝) 그대로 둔다.
 * 🔴 트리 연산을 새로 짜지 않는다 — 이웃 탭을 찾아 moveLeaf before/after 한 번으로 번역한다.
 */
export function moveTabWithin(ws: Workspace, leafId: string, delta: -1 | 1): Workspace {
    const t = findTabsContaining(ws.center, leafId)
        ?? findTabsContaining(ws.left, leafId)
        ?? findTabsContaining(ws.right, leafId);
    if (!t) return ws;
    const i = t.children.findIndex((c) => c.id === leafId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= t.children.length) return ws;   // 이웃 없음 — 양 끝
    const neighbor = t.children[j];
    return moveLeaf(ws, leafId, neighbor.id, delta < 0 ? 'before' : 'after');
}

// ─────────────────────────── 피크 더미 (W9) ───────────────────────────
// 🔴 피크는 floating: Leaf[] 하나다 — 맨 끝이 「보이는 한 장」. 저장하지 않는다(workspace-store 가 비운다).
//    여기 넷은 전부 순수다: ws 를 받아 새 ws 를 돌려준다(검산이 쉽게).

/**
 * 피크에 한 장 올린다(쌓기). 맨 끝(보이는 자리)에 놓는다.
 * 🔴 이미 피크에 있는 장이면 두 장 만들지 않고 그 장을 맨 끝으로 끌어올린다(쥔님: "또 열면 맨 위로").
 */
export function peekPush(ws: Workspace, lf: Leaf): Workspace {
    const here = ws.floating.find((l) => l.id === lf.id);
    if (here) {
        const rest = ws.floating.filter((l) => l.id !== lf.id);
        return normalize({ ...ws, floating: [...rest, here] });
    }
    return normalize({ ...ws, floating: [...ws.floating, lf] });
}

/** 피크 맨 위 한 장 되돌림(←). 비어 있으면 그대로 */
export function peekPop(ws: Workspace): Workspace {
    if (ws.floating.length === 0) return ws;
    return normalize({ ...ws, floating: ws.floating.slice(0, -1) });
}

/** 피크 전부 닫기(×) */
export function peekClear(ws: Workspace): Workspace {
    if (ws.floating.length === 0) return ws;
    return normalize({ ...ws, floating: [] });
}

/**
 * 피크 맨 위 한 장을 자리(가운데/독)로 승격(⤢). moveLeaf 한 번으로 번역한다 — 피크에서 빠지고 그 자리 끝에 붙는다.
 * 🔴 트리 연산을 새로 짜지 않는다(moveLeaf 가 floating 에서 떼는 것까지 한다).
 */
export function peekPromote(ws: Workspace, where: Exclude<AreaKey, 'floating'> = 'center'): Workspace {
    const top = ws.floating[ws.floating.length - 1];
    if (!top) return ws;
    return moveLeaf(ws, top.id, where, 'after');
}
