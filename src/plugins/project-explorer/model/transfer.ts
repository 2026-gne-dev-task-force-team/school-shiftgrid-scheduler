/**
 * 가지 내보내기 / 들여오기(N5) — 순수 함수. 파일 I/O(저장·고르기)는 views/file-io.ts 가 따로 맡는다.
 *
 * 🔴 들여오기는 **덮지 않는다** — 고른 노드(없으면 루트) 아래 새 가지로, id 를 전부 다시 발급하고
 *    children 참조를 그 새 id 로 다시 잇는다. 그래서 같은 파일을 두 번 들여와도 노드가 안 겹친다.
 * 🔴 유도(가상) 자식은 애초에 Tree.nodes 에 없어 내보내기에 안 담긴다(저장되는 것만 나간다).
 */
import { type Tree, type Node, normalize, uid, parentOf } from './tree';

export const BRANCH_FORMAT = 'project-explorer/branch';

/** 내보낸 파일 모양 — root 는 이 파일의 뿌리 노드 id, nodes 는 그 가지(평평한 Map). */
export interface BranchFile {
    format: typeof BRANCH_FORMAT;
    version: 1;
    exportedAt: string;
    root: string;
    nodes: Record<string, Node>;
}

/** id 밑(자신 포함) 자손 id 모두 — 내보낼 가지를 모은다. */
function subtreeIds(tree: Tree, id: string): string[] {
    const out: string[] = [];
    const walk = (x: string): void => {
        const n = tree.nodes[x];
        if (!n) return;
        out.push(x);
        for (const c of n.children) walk(c);
    };
    walk(id);
    return out;
}

/**
 * 한 가지를 파일 모양으로 — data 는 담고, trashedFrom(휴지통 흔적)은 뗀다. 루트·휴지통 sentinel 은 못 내보낸다.
 *   없는 노드면 null.
 */
export function exportBranch(tree: Tree, id: string, now: () => string = () => new Date().toISOString()): BranchFile | null {
    if (id === tree.root || id === tree.trash) return null;
    if (!tree.nodes[id]) return null;
    const ids = subtreeIds(tree, id);
    const nodes: Record<string, Node> = {};
    for (const nid of ids) {
        const n = tree.nodes[nid];
        const copy: Node = { id: n.id, type: n.type, name: n.name, children: [...n.children] };
        if (n.collapsed) copy.collapsed = true;
        if (n.data !== undefined) copy.data = n.data;
        nodes[nid] = copy;   // 🔴 trashedFrom 은 일부러 뺀다
    }
    return { format: BRANCH_FORMAT, version: 1, exportedAt: now(), root: id, nodes };
}

/** 받은 값이 BranchFile 모양인가 — 아니면 null(들여오기가 거부하고 패널에 한 줄). */
export function validateBranchFile(raw: unknown): BranchFile | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.format !== BRANCH_FORMAT) return null;
    if (r.version !== 1) return null;
    if (typeof r.root !== 'string') return null;
    if (!r.nodes || typeof r.nodes !== 'object') return null;
    const srcNodes = r.nodes as Record<string, unknown>;
    if (!srcNodes[r.root]) return null;   // 뿌리가 nodes 안에 있어야 한다
    const nodes: Record<string, Node> = {};
    for (const [id, v] of Object.entries(srcNodes)) {
        if (!v || typeof v !== 'object') return null;
        const n = v as Record<string, unknown>;
        if (typeof n.id !== 'string' || typeof n.type !== 'string' || typeof n.name !== 'string') return null;
        nodes[id] = {
            id: n.id,
            type: n.type,
            name: n.name,
            children: Array.isArray(n.children) ? n.children.filter((c): c is string => typeof c === 'string') : [],
            collapsed: n.collapsed === true ? true : undefined,
            data: n.data,
        };
    }
    return {
        format: BRANCH_FORMAT, version: 1,
        exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
        root: r.root, nodes,
    };
}

/**
 * 가지를 parentId 아래 「새 가지로」 들여온다 — 🔴 id 전부 재발급 + children 재매핑(안 덮는다).
 *   gen 은 새 id 생성기(기본 uid) — 테스트가 결정적 id 를 넣는다. parentId 가 없으면 루트 밑.
 *   돌려주는 것: 새 나무 + 새로 생긴 가지 뿌리의 새 id(없으면 null = 들여오기 실패).
 */
export function importBranch(
    tree: Tree,
    parentId: string,
    file: BranchFile,
    gen: () => string = uid,
): { tree: Tree; newRootId: string } | null {
    const parent = tree.nodes[parentId] ? parentId : tree.root;

    // 옛 id → 새 id. 먼저 전부 짝지어 둬야 children 을 다시 이을 수 있다.
    const idMap = new Map<string, string>();
    for (const oldId of Object.keys(file.nodes)) idMap.set(oldId, gen());

    const added: Record<string, Node> = {};
    for (const [oldId, n] of Object.entries(file.nodes)) {
        const newId = idMap.get(oldId)!;
        const children = n.children.map((c) => idMap.get(c)).filter((c): c is string => !!c);
        const node: Node = { id: newId, type: n.type, name: n.name, children };
        if (n.collapsed) node.collapsed = true;
        if (n.data !== undefined) node.data = n.data;
        added[newId] = node;
    }

    const newRootId = idMap.get(file.root);
    if (!newRootId) return null;

    const p = tree.nodes[parent];
    const nextTree: Tree = {
        ...tree,
        nodes: {
            ...tree.nodes,
            ...added,
            [parent]: { ...p, children: [...p.children, newRootId] },
        },
    };
    return { tree: normalize(nextTree), newRootId };
}

/** 들여올 부모 — 고른 노드가 컨테이너면 그 안, 아니면 루트(createUnder 와 같은 결). */
export function importTargetParent(tree: Tree, selectedId: string | null, isContainer: (type: string) => boolean): string {
    if (selectedId && tree.nodes[selectedId] && isContainer(tree.nodes[selectedId].type)
        && !isInTrash(tree, selectedId)) return selectedId;
    return tree.root;
}

function isInTrash(tree: Tree, id: string): boolean {
    let cur: string | null = id;
    const guard = new Set<string>();
    while (cur) {
        if (cur === tree.trash) return true;
        if (guard.has(cur)) return false;
        guard.add(cur);
        cur = parentOf(tree, cur);
    }
    return false;
}
