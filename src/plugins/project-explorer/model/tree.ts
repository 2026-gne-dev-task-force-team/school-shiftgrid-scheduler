/**
 * 노드 나무 모델 — 「누가 누구 밑에 어떤 순서로」 한 자료구조. React 0줄 · 순수.
 *
 * 🔴 이 파일은 DOM 도 localStorage 도 타입 등록소도 모른다(보관은 persist.ts · 역할은 model/types.ts).
 *    연산은 전부 입력 나무를 안 바꾸고 새 나무를 돌려준다 — 그래서 node 에서 통째로 검산되고 undo(N3)도 쉽다.
 *
 * ⭐ 모양(설계 「노드와 나무」 그대로):
 *    - 평평한 Map(`nodes`) + 자식 id 배열(`children`) — 이동이 「떼서 붙이기」가 된다. ⛔ parent 칸 없음(역색인은 함수로 파생).
 *    - `data` 는 그 타입을 등록한 플러그인의 불투명 칸 — 이 파일도 탐색기도 안 본다(「전부 노드 + 속성」의 속성).
 *
 * 🔴 불변식은 normalize() 하나가 모든 연산 끝에서 강제한다(쥔님 설계: *"고아·두 부모·사이클을 잡는다"*).
 *    연산마다 따로 챙기면 어딘가 빠진다 — layout/tree.ts 와 같은 결.
 */

export interface Node {
    id: string;
    type: string;               // 'folder' · 'calendar.year' … — model/types.ts 등록 표의 키
    name: string;               // 탐색기에 보이는 이름(F2 로 바꾼다)
    children: string[];         // 저장된 자식 id, 순서 있음
    collapsed?: boolean;        // 접힘 — 나무에 산다(기기별 아님)
    data?: unknown;             // 🔴 그 타입의 플러그인만 읽고 쓰는 불투명 칸. 모델·탐색기는 안 본다
}

export interface Tree {
    root: string;
    trash: string;
    nodes: Record<string, Node>;
    rev: number;
}

// ─────────────────────────── id ───────────────────────────

let counter = 0;
/** 짧은 랜덤 id — 의존성(nanoid) 없이. 랜덤 꼬리는 기기 간 병합(N5)에서 충돌을 막는다. */
export function uid(): string {
    counter += 1;
    return `n${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 루트·휴지통 둘만 있는 빈 나무 — 저장값이 없거나 모양이 틀렸을 때의 바닥(persist.ts). */
export function emptyTree(): Tree {
    return {
        root: 'root',
        trash: 'trash',
        nodes: {
            root: { id: 'root', type: 'folder', name: '루트', children: [] },
            trash: { id: 'trash', type: 'folder', name: '휴지통', children: [] },
        },
        rev: 0,
    };
}

// ─────────────────────────── normalize ───────────────────────────

/**
 * 나무를 성한 꼴로 — 루트에서, 그 다음 휴지통에서 훑으며 각 노드에 부모를 딱 하나만 준다.
 *   - 루트·휴지통이 없으면 되살린다
 *   - 자기 자신을 자식으로 든 줄(사이클 한 칸) · 없는 자식 id · 루트/휴지통을 자식으로 든 것 → 떨군다
 *   - 이미 부모가 생긴 노드가 또 자식으로 나오면(두 부모 · 더 긴 사이클) → 뒤엣것을 떨군다(먼저 본 부모가 이긴다)
 *   - 어디서도 안 닿는 노드(고아) → 결과 Map 에 안 담겨 사라진다
 * 🔴 입력을 안 바꾼다 — 새 Map 을 짓는다.
 */
export function normalize(tree: Tree): Tree {
    const src = tree.nodes;
    const rootId = tree.root;
    const trashId = tree.trash;

    const ensured: Record<string, Node> = { ...src };
    if (!ensured[rootId]) ensured[rootId] = { id: rootId, type: 'folder', name: '루트', children: [] };
    if (!ensured[trashId]) ensured[trashId] = { id: trashId, type: 'folder', name: '휴지통', children: [] };

    const result: Record<string, Node> = {};
    const claimed = new Set<string>([rootId, trashId]);   // 이미 부모가 생겼거나 뿌리인 것

    const visit = (id: string): void => {
        const n = ensured[id];
        if (!n) return;
        const kids: string[] = [];
        for (const cid of n.children) {
            if (cid === id) continue;                      // 자기 자신 — 사이클 한 칸
            if (!ensured[cid]) continue;                   // 없는 자식
            if (cid === rootId || cid === trashId) continue; // 뿌리는 자식이 될 수 없다
            if (claimed.has(cid)) continue;                // 두 부모 / 더 긴 사이클 — 먼저 본 쪽이 이긴다
            claimed.add(cid);
            kids.push(cid);
        }
        result[id] = { ...n, children: kids };
        for (const cid of kids) visit(cid);
    };

    visit(rootId);
    visit(trashId);

    return { ...tree, root: rootId, trash: trashId, nodes: result };
}

// ─────────────────────────── 역색인(파생) ───────────────────────────

/** 이 노드의 부모 id — parent 칸을 안 두고 자식 배열에서 파생한다(⛔ 두 곳에서 낡지 않게). */
export function parentOf(tree: Tree, id: string): string | null {
    for (const n of Object.values(tree.nodes)) {
        if (n.children.includes(id)) return n.id;
    }
    return null;
}

/** id 가 anc 의 자손인가(이동이 사이클을 만드는지 미리 막을 때 쓴다). */
function isDescendant(tree: Tree, id: string, anc: string): boolean {
    let cur: string | null = id;
    const guard = new Set<string>();
    while (cur) {
        if (cur === anc) return true;
        if (guard.has(cur)) return false;   // 이미 깨진 사이클 — 무한루프 방지
        guard.add(cur);
        cur = parentOf(tree, cur);
    }
    return false;
}

// ─────────────────────────── 연산 (전부 순수 · 끝에 normalize) ───────────────────────────

/** 새 노드 — parentId 아래 index 자리(기본 끝)에 꽂는다. id 는 바깥(store)이 uid() 로 미리 만들어 넘긴다(순수 유지). */
export function createNode(
    tree: Tree,
    parentId: string,
    opts: { id: string; type: string; name: string; data?: unknown; index?: number },
): Tree {
    const parent = tree.nodes[parentId];
    if (!parent) return tree;
    const node: Node = { id: opts.id, type: opts.type, name: opts.name, children: [], data: opts.data };
    const kids = [...parent.children];
    const at = opts.index == null ? kids.length : Math.max(0, Math.min(kids.length, opts.index));
    kids.splice(at, 0, opts.id);
    return normalize({
        ...tree,
        nodes: { ...tree.nodes, [opts.id]: node, [parentId]: { ...parent, children: kids } },
    });
}

/** 이름 바꾸기 — 비면(공백뿐이면) 원래 이름을 지킨다(설계: *"비우면 원래 이름"*). */
export function rename(tree: Tree, id: string, name: string): Tree {
    const n = tree.nodes[id];
    if (!n) return tree;
    const t = name.trim();
    if (!t) return tree;
    return normalize({ ...tree, nodes: { ...tree.nodes, [id]: { ...n, name: t } } });
}

/** 옮기기 — 제 부모에서 떼서 parentId 아래 index 자리에 붙인다. 뿌리·사이클은 막는다. */
export function move(tree: Tree, id: string, parentId: string, index?: number): Tree {
    if (id === tree.root || id === tree.trash) return tree;   // 뿌리는 안 움직인다
    const node = tree.nodes[id];
    const parent = tree.nodes[parentId];
    if (!node || !parent) return tree;
    if (parentId === id) return tree;
    if (isDescendant(tree, parentId, id)) return tree;        // 제 자손 밑으로 — 사이클

    const nodes: Record<string, Node> = {};
    for (const [nid, n] of Object.entries(tree.nodes)) {
        nodes[nid] = n.children.includes(id) ? { ...n, children: n.children.filter((c) => c !== id) } : n;
    }
    const target = nodes[parentId];
    const kids = [...target.children];
    const at = index == null ? kids.length : Math.max(0, Math.min(kids.length, index));
    kids.splice(at, 0, id);
    nodes[parentId] = { ...target, children: kids };
    return normalize({ ...tree, nodes });
}

/** 삭제 = 휴지통 가지로 옮기기(🔴 영구삭제 아님 — 설계 「마지막 한 타는 사람이 친다」). */
export function remove(tree: Tree, id: string): Tree {
    if (id === tree.root || id === tree.trash) return tree;
    if (!tree.nodes[id]) return tree;
    return move(tree, id, tree.trash);
}

/** 접기/펴기 토글 — 접힘은 나무에 산다(기기별 아님). */
export function toggleCollapse(tree: Tree, id: string): Tree {
    const n = tree.nodes[id];
    if (!n) return tree;
    return normalize({ ...tree, nodes: { ...tree.nodes, [id]: { ...n, collapsed: !n.collapsed } } });
}

/** 불투명 data 칸 쓰기 — 모델은 모양을 안 본다(타입 스키마는 N1 없음). */
export function setData(tree: Tree, id: string, data: unknown): Tree {
    const n = tree.nodes[id];
    if (!n) return tree;
    return normalize({ ...tree, nodes: { ...tree.nodes, [id]: { ...n, data } } });
}

/** 모두 접기 — 자식이 있는 노드(루트·휴지통 제외)를 전부 접는다. 패널 머리 「모두 접기」·폰 서랍이 쓴다. */
export function collapseAll(tree: Tree): Tree {
    const nodes: Record<string, Node> = {};
    for (const [id, n] of Object.entries(tree.nodes)) {
        const collapsible = id !== tree.root && id !== tree.trash && n.children.length > 0;
        nodes[id] = collapsible && !n.collapsed ? { ...n, collapsed: true } : n;
    }
    return normalize({ ...tree, nodes });
}

// ─────────────────────────── flatten ───────────────────────────

export interface FlatRow {
    id: string;
    depth: number;
    node: Node;
    hasChildren: boolean;
}

/**
 * 보이는 줄을 순서대로 — rootId 의 자손만(rootId 줄 자체는 안 낸다 · 휴지통은 루트 밖이라 안 나온다).
 *   접힌 컨테이너 밑은 안 펼친다. 탐색기는 이 배열만 그린다(설계 「갈아끼울 데」: 투영은 이 함수 하나만 바꾸는 것).
 *   isContainer: 타입이 컨테이너(폴더 역할)인가 — 등록 표(model/types.ts)가 답을 준다. 없으면 자식 유무로 본다.
 */
export function flatten(
    tree: Tree,
    rootId: string,
    isContainer?: (type: string) => boolean,
): FlatRow[] {
    const out: FlatRow[] = [];
    const walk = (id: string, depth: number): void => {
        const n = tree.nodes[id];
        if (!n) return;
        for (const cid of n.children) {
            const c = tree.nodes[cid];
            if (!c) continue;
            const container = isContainer ? isContainer(c.type) : c.children.length > 0;
            const hasChildren = container && c.children.length > 0;
            out.push({ id: cid, depth, node: c, hasChildren });
            if (hasChildren && !c.collapsed) walk(cid, depth + 1);
        }
    };
    walk(rootId, 0);
    return out;
}
