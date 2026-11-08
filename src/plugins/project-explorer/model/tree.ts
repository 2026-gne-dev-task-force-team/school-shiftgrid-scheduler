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

// 🔴 Node 타입은 약속(이 꾸러미 contracts/nodes)이 쥔다 — project-explorer 는 「제공자」로서 그걸 import 해 구현한다(3판 부채 끊기).
//    ⭐ 여기서 재export 하는 건 이 폴더의 많은 파일이 `import type { Node } from './tree'` 로 받던 길을 안 깨려는 것뿐이다.
import type { Node } from '../contracts/nodes';
export type { Node } from '../contracts/nodes';

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
    const rootNodeId = tree.root;
    const trashId = tree.trash;

    const ensured: Record<string, Node> = { ...src };
    if (!ensured[rootNodeId]) ensured[rootNodeId] = { id: rootNodeId, type: 'folder', name: '루트', children: [] };
    if (!ensured[trashId]) ensured[trashId] = { id: trashId, type: 'folder', name: '휴지통', children: [] };

    const result: Record<string, Node> = {};
    const claimed = new Set<string>([rootNodeId, trashId]);   // 이미 부모가 생겼거나 뿌리인 것

    const visit = (id: string, inTrash: boolean): void => {
        const n = ensured[id];
        if (!n) return;
        const kids: string[] = [];
        for (const cid of n.children) {
            if (cid === id) continue;                      // 자기 자신 — 사이클 한 칸
            if (!ensured[cid]) continue;                   // 없는 자식
            if (cid === rootNodeId || cid === trashId) continue; // 뿌리는 자식이 될 수 없다
            if (claimed.has(cid)) continue;                // 두 부모 / 더 긴 사이클 — 먼저 본 쪽이 이긴다
            claimed.add(cid);
            kids.push(cid);
        }
        const node: Node = { ...n, children: kids };
        // 🔴 trashedFrom 은 휴지통 안에서만 산다 — 밖으로 나오면(복원·루트 가지) 지운다(두 곳에서 낡지 않게).
        if (!inTrash && node.trashedFrom !== undefined) delete node.trashedFrom;
        result[id] = node;
        for (const cid of kids) visit(cid, inTrash);
    };

    visit(rootNodeId, false);
    visit(trashId, true);

    return { ...tree, root: rootNodeId, trash: trashId, nodes: result };
}

// ─────────────────────────── 역색인(파생) ───────────────────────────

/** 이 노드의 부모 id — parent 칸을 안 두고 자식 배열에서 파생한다(⛔ 두 곳에서 낡지 않게). */
export function parentOf(tree: Tree, id: string): string | null {
    for (const n of Object.values(tree.nodes)) {
        if (n.children.includes(id)) return n.id;
    }
    return null;
}

/** id 가 anc 의 자손인가(이동이 사이클을 만드는지 미리 막을 때 쓴다 · 드래그 금지 표시도 같은 판정). */
export function isDescendant(tree: Tree, id: string, anc: string): boolean {
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

/**
 * 「새 폴더/노드」가 생길 부모 — 🔴 늘 어떤 폴더의 하위다(쥔님 2026-11-01 21:47: *"새 폴더 생성하면 무조건 어떤 폴더의 하위로 생겨야해"*).
 *   부모가 애매해 안 생기는 경우가 없다 — 그래서 store·우클릭이 같은 이 함수를 쓴다(두 곳에서 낡지 않게).
 *   isContainer: 타입이 컨테이너(폴더 역할)인가 — 등록 표를 모델이 모르니 바깥(store)이 주입한다.
 *
 * 🔴 두 경로로 갈린다(쥔님 2026-11-02): via
 *   - 'selection' (헤더 단추·팔레트·단축키 = 「고른 것 기준」): 고른 노드가 있으면 **그 형제로**(= 고른 노드의 부모 안).
 *       ⛔ 고른 폴더 안으로 안 들어간다(옵시디언 헤더 단추) — 그래서 연속으로 눌러도 같은 층에 나란히 생긴다.
 *   - 'context' (우클릭 = 「이 노드에서」): 컨테이너면 그 안 · 파일이면 그 부모(지금까지의 규칙 그대로).
 *   둘 다 — 유도(가상 `<부모>/<key>`) id·휴지통 안·없는 id·루트 부모 없음 → 루트.
 */
export function newFolderParent(
    tree: Tree,
    basisId: string | null,
    isContainer: (type: string) => boolean,
    via: 'selection' | 'context' = 'context',
): string {
    const inTrashZone = (id: string): boolean => id === tree.trash || isDescendant(tree, id, tree.trash);
    const sel = basisId;
    // 유도(가상 `<부모>/<key>`) id 는 실부모가 없고, 휴지통 안은 새 폴더 자리가 아니다 → 루트
    if (sel && !sel.includes('/') && tree.nodes[sel] && !inTrashZone(sel)) {
        if (via === 'selection') {
            // 형제로 — 고른 노드의 부모 안(컨테이너여도 그 안으로 안 들어간다). 부모가 없으면(루트를 골랐으면) 루트.
            const p = parentOf(tree, sel);
            if (p && !inTrashZone(p)) return p;
            return tree.root;
        }
        if (isContainer(tree.nodes[sel].type)) return sel;       // 컨테이너면 그 안(루트도 포함 — 루트도 폴더다)
        const p = parentOf(tree, sel);                           // 파일이면 그 부모
        if (p && !inTrashZone(p)) return p;
    }
    return tree.root;
}

/**
 * 고른 것 중 「맨 위(조상)만」 — 조상과 자손이 같이 고른 경우 자손을 뺀다(자손은 조상을 따라 움직인다).
 *   🔴 멀티 셀렉트 이동·삭제가 쓴다(쥔님 2026-11-02 *"조상-자손이 같이 고른 경우 조상만 옮기고 자손은 따라간다"*).
 *   입력 순서를 지킨다(드래그가 순서대로 꽂을 수 있게).
 */
export function topmostOnly(tree: Tree, ids: string[]): string[] {
    const set = new Set(ids);
    return ids.filter((id) => {
        let cur = parentOf(tree, id);
        while (cur) {
            if (set.has(cur)) return false;   // 조상이 함께 고른 안에 있다 → 이 자손은 뺀다
            cur = parentOf(tree, cur);
        }
        return true;
    });
}

// ─────────────────────────── 싱글톤(유일성) 관문 ───────────────────────────

/**
 * 🔑 싱글톤 위반인가 — type 노드를 parentId 아래 두면 유일성 규칙을 깨나(설계 「싱글톤 노드 타입」).
 *   관문은 이 함수 하나다 — createNode·move·restore 가 전부 이걸 지난다(복제·N5 들여오기가 생겨도 그 둘을 타니 저절로 걸린다).
 *
 *   - uniqueOf: 그 타입의 규칙('tree'|'parent'|없음). 모델은 등록 표를 모르니 바깥(store)이 주입한다(acceptsChild 와 같은 결).
 *   - excludeId: 자기 자신 — 옮길 때 셈에서 뺀다(제자리 이동·형제 재정렬이 자기 자신에 걸리지 않게).
 *   🔴 휴지통(또는 그 안)은 세지 않는다(설계) — 거기로 넣는 건 늘 허용하고(삭제가 막히면 안 된다), 거기 있는 노드도 안 센다.
 *      그래서 복원할 때 밖에 이미 같은 게 있으면 그때 충돌이 난다.
 */
export function violatesUnique(
    tree: Tree,
    type: string,
    parentId: string,
    excludeId: string | null,
    uniqueOf: (type: string) => 'tree' | 'parent' | undefined,
): boolean {
    const mode = uniqueOf(type);
    if (!mode) return false;
    // 휴지통으로 넣는 건 세지도 막지도 않는다 — 삭제가 늘 되게(remove 가 여기로 온다).
    if (parentId === tree.trash || isDescendant(tree, parentId, tree.trash)) return false;
    const inTrashZone = (id: string): boolean => id === tree.trash || isDescendant(tree, id, tree.trash);
    if (mode === 'parent') {
        const parent = tree.nodes[parentId];
        if (!parent) return false;
        return parent.children.some((cid) => cid !== excludeId && tree.nodes[cid]?.type === type);
    }
    // 'tree' — 나무 전체(뿌리·휴지통 제외)에 자기 말고 그 타입이 하나라도 살아 있나.
    for (const n of Object.values(tree.nodes)) {
        if (n.id === excludeId || n.id === tree.root || n.id === tree.trash) continue;
        if (n.type !== type) continue;
        if (inTrashZone(n.id)) continue;
        return true;
    }
    return false;
}

// ─────────────────────────── 연산 (전부 순수 · 끝에 normalize) ───────────────────────────

/**
 * 새 노드 — parentId 아래 index 자리(기본 끝)에 꽂는다. id 는 바깥(store)이 uid() 로 미리 만들어 넘긴다(순수 유지).
 * 🔴 uniqueOf 를 주면 싱글톤 관문을 지난다 — 규칙을 깨는 생성은 나무를 그대로 돌려준다(안 준 호출은 옛 동작). 메뉴만 보고 뚫는 걸 막는 자리.
 */
export function createNode(
    tree: Tree,
    parentId: string,
    opts: { id: string; type: string; name: string; data?: unknown; index?: number },
    uniqueOf?: (type: string) => 'tree' | 'parent' | undefined,
    canCreate?: (type: string, parentId: string) => boolean,
): Tree {
    const parent = tree.nodes[parentId];
    if (!parent) return tree;
    if (canCreate && !canCreate(opts.type, parentId)) return tree;                            // 🔑 「만들기」 가림 관문 — 메뉴만 보고 뚫는 것을 막는다
    if (uniqueOf && violatesUnique(tree, opts.type, parentId, null, uniqueOf)) return tree;   // 🔑 싱글톤 관문
    const node: Node = { id: opts.id, type: opts.type, name: opts.name, children: [], data: opts.data };
    const kids = [...parent.children];
    const at = opts.index == null ? kids.length : Math.max(0, Math.min(kids.length, opts.index));
    kids.splice(at, 0, opts.id);
    return normalize({
        ...tree,
        nodes: { ...tree.nodes, [opts.id]: node, [parentId]: { ...parent, children: kids } },
    });
}

/**
 * 이름 바꾸기 — 비면(공백뿐이면) 원래 이름을 지킨다(설계: *"비우면 원래 이름"*).
 * 🔴 canRename 를 주면 「이름 바꾸기 가능」 관문을 지난다(can.rename) — 막힌 노드는 나무를 그대로 돌려준다(안 준 호출은 옛 동작).
 */
export function rename(
    tree: Tree,
    id: string,
    name: string,
    canRename?: (type: string, id: string) => boolean,
): Tree {
    const n = tree.nodes[id];
    if (!n) return tree;
    if (canRename && !canRename(n.type, id)) return tree;   // 🔑 can.rename 관문
    const t = name.trim();
    if (!t) return tree;
    return normalize({ ...tree, nodes: { ...tree.nodes, [id]: { ...n, name: t } } });
}

/**
 * 옮기기 — 제 부모에서 떼서 parentId 아래 index 자리에 붙인다. 뿌리·사이클은 막는다.
 * 🔴 canAccept 는 「마지막 한 번 더 묻는 문」이다(설계 N2 「각 판에서 죽는 방식」: accepts 를 메뉴만 보고
 *    드래그가 뚫는 것을 여기서 막는다). 모델은 타입 등록소를 모르니 판정은 바깥(store)이 주입한다 —
 *    부모 타입·자식 타입만 넘겨 「이 부모가 이 자식을 받나」를 묻는다. 안 주면 전부 허용(옛 동작 그대로).
 */
export function move(
    tree: Tree,
    id: string,
    parentId: string,
    index?: number,
    canAccept?: (parentType: string, childType: string) => boolean,
    uniqueOf?: (type: string) => 'tree' | 'parent' | undefined,
    canMove?: (type: string, id: string) => boolean,
): Tree {
    if (id === tree.root || id === tree.trash) return tree;   // 뿌리는 안 움직인다
    if (id.includes('/')) return tree;                        // 🔴 유도(가상) id 는 저장 안 됨 — 못 옮긴다
    const node = tree.nodes[id];
    const parent = tree.nodes[parentId];
    if (!node || !parent) return tree;
    if (parentId === id) return tree;
    if (isDescendant(tree, parentId, id)) return tree;        // 제 자손 밑으로 — 사이클
    if (canMove && !canMove(node.type, id)) return tree;      // 🔑 can.move 관문 — 드래그·메뉴가 뚫는 것을 막는다(remove·restore 는 안 넘긴다)
    if (canAccept && !canAccept(parent.type, node.type)) return tree;   // 🔴 accepts 최종 관문
    if (uniqueOf && violatesUnique(tree, node.type, parentId, id, uniqueOf)) return tree;   // 🔑 싱글톤 최종 관문(자기 제외)

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

/**
 * 삭제 = 휴지통 가지로 옮기기(🔴 영구삭제 아님 — 설계 「마지막 한 타는 사람이 친다」). 원래 부모를 trashedFrom 에 적어 둔다.
 * 🔴 canDelete 를 주면 「지우기 가능」 관문을 지난다(can.delete) — 막힌 노드는 그대로 둔다(안 준 호출은 옛 동작).
 *    ⛔ 안쪽 move 엔 can.move 관문을 안 넘긴다 — 지우기는 삭제 권한이지 이동 권한이 아니다(move:false 라도 지울 수 있어야 한다).
 */
export function remove(
    tree: Tree,
    id: string,
    canDelete?: (type: string, id: string) => boolean,
): Tree {
    if (id === tree.root || id === tree.trash) return tree;
    if (id.includes('/')) return tree;                        // 🔴 유도(가상) id — 지울 실물이 없다
    const n = tree.nodes[id];
    if (!n) return tree;
    if (canDelete && !canDelete(n.type, id)) return tree;     // 🔑 can.delete 관문
    const from = parentOf(tree, id);
    const marked: Tree = from
        ? { ...tree, nodes: { ...tree.nodes, [id]: { ...n, trashedFrom: from } } }
        : tree;
    return move(marked, id, marked.trash);                    // ⛔ canMove 안 넘김 — 휴지통행은 삭제지 이동이 아니다
}

/**
 * 복원하면 갈 부모 — 원래 부모(trashedFrom)가 살아 있고 휴지통 밖이면 거기, 아니면 루트.
 *   🔴 store 의 싱글톤 사전점검(복원 거절 알림)이 같은 자리를 봐야 하니 밖으로 뺐다(두 곳에서 낡지 않게).
 */
export function restoreDest(tree: Tree, id: string): string {
    const n = tree.nodes[id];
    if (!n) return tree.root;
    const from = n.trashedFrom;
    const destOk = from != null && !!tree.nodes[from]
        && from !== tree.trash && !isDescendant(tree, from, tree.trash);
    return destOk ? from! : tree.root;
}

/**
 * 복원 — 휴지통에서 꺼낸다. restoreDest 가 정한 자리 끝에.
 *   🔴 trashedFrom 은 normalize 가 「휴지통 밖으로 나온 순간」 지운다 — 여기서 따로 안 지워도 된다.
 *   🔑 uniqueOf 를 주면 싱글톤 관문을 지난다 — 밖에 이미 같은 게 있으면 move 가 거절해 노드는 휴지통에 남는다(복원 거절).
 */
export function restore(
    tree: Tree,
    id: string,
    uniqueOf?: (type: string) => 'tree' | 'parent' | undefined,
): Tree {
    const n = tree.nodes[id];
    if (!n || id === tree.root || id === tree.trash) return tree;
    return move(tree, id, restoreDest(tree, id), undefined, undefined, uniqueOf);
}

/** 그 노드 밑(자신 포함) 자손 id 모두 — purge·셈에 쓴다. */
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
 * 🔴 영구 삭제 — 가지째 Map 에서 지운다. ⛔ 되돌릴 수 없다(설계: 비우기 단추만 진짜 삭제).
 * ⛔ 이 함수(와 purgeAll)는 공개 API(N4 api.ts)로 내보내지 않는다 — 다른 플러그인이 사람 자료를 영구히 지울 길을 안 둔다.
 */
export function purge(tree: Tree, id: string): Tree {
    if (id === tree.root || id === tree.trash) return tree;
    if (!tree.nodes[id]) return tree;
    const kill = new Set(subtreeIds(tree, id));
    const nodes: Record<string, Node> = {};
    for (const [nid, n] of Object.entries(tree.nodes)) {
        if (kill.has(nid)) continue;
        nodes[nid] = n.children.some((c) => kill.has(c))
            ? { ...n, children: n.children.filter((c) => !kill.has(c)) }
            : n;
    }
    return normalize({ ...tree, nodes });
}

/** 🔴 휴지통 비우기 — 휴지통의 모든 가지를 영구 삭제. ⛔ 공개 API 아님(purge 와 같은 규칙). */
export function purgeAll(tree: Tree): Tree {
    let t = tree;
    for (const cid of [...(tree.nodes[tree.trash]?.children ?? [])]) t = purge(t, cid);
    return t;
}

/**
 * id 밑 자손 수(자신 제외) — 상태바 「노드 N · 휴지통 M」.
 *   🔴 isRecord 를 주면 레코드성 노드(일정 등)와 그 아래를 세지 않는다(flatten 과 같은 규칙 · 쥔님 2026-11-02:
 *      *"레코드 노드 타입은 … 그냥 그 상위 노드의 데이터로 본다"* — 탐색기가 세는 곳에선 안 보인다). 없으면 옛 동작(전부).
 */
export function countUnder(tree: Tree, id: string, isRecord?: (type: string) => boolean): number {
    if (!isRecord) return Math.max(0, subtreeIds(tree, id).length - 1);
    let n = 0;
    const walk = (x: string): void => {
        const node = tree.nodes[x];
        if (!node) return;
        for (const cid of node.children) {
            const c = tree.nodes[cid];
            if (!c || isRecord(c.type)) continue;   // 레코드성 — 줄도 그 아래도 안 센다
            n += 1;
            walk(cid);
        }
    };
    walk(id);
    return n;
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

// ─────────────────────────── flatten ───────────────────────────

export interface FlatRow {
    id: string;
    depth: number;
    node: Node;
    hasChildren: boolean;
}

/**
 * 보이는 줄을 순서대로 — fromId 의 자손만(fromId 줄 자체는 안 낸다 · 휴지통은 루트 밖이라 안 나온다).
 *   접힌 컨테이너 밑은 안 펼친다. 탐색기는 이 배열만 그린다(설계 「갈아끼울 데」: 투영은 이 함수 하나만 바꾸는 것).
 *   isContainer: 타입이 컨테이너(폴더 역할)인가 — 등록 표(model/types.ts)가 답을 준다. 없으면 자식 유무로 본다.
 *
 * ⭐ opts(검색용):
 *   - expandAll: 접힘을 무시하고 전부 펼친다(검색 중엔 접힌 가지도 뒤져야 한다)
 *   - keep: 이 줄을 보일까 — 주면 keep(id) 가 참인 줄만 낸다. 안 맞는 조상은 keep 에 담겨 있으니 길이 이어진다.
 *     🔴 keep 밖 노드 밑으로는 안 내려간다(그 밑엔 맞는 게 없다 — filterIds 가 조상까지 담아 주니 성립).
 *   - isRecord: 레코드성 타입(무조건 숨김 · 옛 소비자용) · hidden: 노드째 판정(record+조건부 합침 · 탐색기용) — 둘 중 하나라도 참이면 🔴 그 줄도 그 아래도 건너뛴다.
 */
export function flatten(
    tree: Tree,
    fromId: string,
    isContainer?: (type: string) => boolean,
    opts?: { expandAll?: boolean; keep?: (id: string) => boolean; isRecord?: (type: string) => boolean; hidden?: (node: Node) => boolean },
): FlatRow[] {
    const out: FlatRow[] = [];
    // 🔴 「이 노드를 건너뛸까」 — isRecord(무조건 · 타입) 와 hidden(조건부 · 노드) 둘 다 본다(둘 중 하나면 숨긴다).
    //    옛 소비자는 isRecord 만, 탐색기는 hidden(=record+조건부 합침)만 준다 — 둘 다 선택이라 섞여도 안전하다.
    const hid = opts?.isRecord || opts?.hidden
        ? (node: Node): boolean => (opts?.isRecord?.(node.type) ?? false) || (opts?.hidden?.(node) ?? false)
        : null;
    const walk = (id: string, depth: number): void => {
        const n = tree.nodes[id];
        if (!n) return;
        for (const cid of n.children) {
            const c = tree.nodes[cid];
            if (!c) continue;
            if (hid?.(c)) continue;   // 🔴 숨김(record 무조건 + hidden 조건부) — 줄도 그 아래도 건너뛴다
            const inKeep = !opts?.keep || opts.keep(cid);
            const container = isContainer ? isContainer(c.type) : c.children.length > 0;
            // 🔴 ▸ 토글은 「보이는 하위」가 있을 때만 선다 — 숨긴 자식(레코드·조건부)은 세지 않는다(쥔님 2026-11-02:
            //    *"하위 레코드 노드 보고 하위 토글 보이는게 아니고, 다른 하위 노드가 붙엇을때 하위 노드 보이는거야"*).
            const visibleKids = hid
                ? c.children.reduce((acc, k) => { const kn = tree.nodes[k]; return acc + (kn && !hid(kn) ? 1 : 0); }, 0)
                : c.children.length;
            const hasChildren = container && visibleKids > 0;
            if (inKeep) out.push({ id: cid, depth, node: c, hasChildren });
            const expand = hasChildren && (opts?.expandAll ? true : !c.collapsed);
            if (expand && inKeep) walk(cid, depth + 1);
        }
    };
    walk(fromId, 0);
    return out;
}

/**
 * 검색이 남길 id 모음 — pred 가 참인 노드 + 그 모든 조상(fromId 제외). flatten 의 keep 에 바로 먹인다.
 *   🔴 조상을 함께 담는 게 핵심이다 — 안 그러면 「맞는 줄」만 뜨고 길(부모 폴더)이 사라진다.
 */
export function filterIds(tree: Tree, fromId: string, pred: (n: Node) => boolean): Set<string> {
    const keep = new Set<string>();
    const addAncestors = (id: string): void => {
        let cur = parentOf(tree, id);
        while (cur && cur !== fromId) { keep.add(cur); cur = parentOf(tree, cur); }
    };
    const walk = (id: string): void => {
        const n = tree.nodes[id];
        if (!n) return;
        for (const cid of n.children) {
            const c = tree.nodes[cid];
            if (!c) continue;
            if (pred(c)) { keep.add(cid); addAncestors(cid); }
            walk(cid);
        }
    };
    walk(fromId);
    return keep;
}

// ─────────────────────────── 되돌리기 더미(순수) ───────────────────────────

/**
 * 되돌리기/다시하기 더미 — 설계 「갈아끼울 데」: 지금은 나무 스냅샷 스택, 나중엔 변경 원장.
 *   🔴 순수 함수라 store 밖에서 통째로 검산된다(tree.test.ts). store 는 이 넷만 쓰고 스냅샷은 apply 가 찍는다.
 *   ⛔ 구조 연산만 record 한다 — toggleCollapse 는 안 쌓고(접힘은 되돌릴 값 아님), purge 는 스택을 비운다(못 되돌림).
 */
export interface History { past: Tree[]; future: Tree[] }

export function emptyHistory(): History {
    return { past: [], future: [] };
}

/** 바꾸기 직전 상태(prev)를 과거에 쌓고 미래를 비운다(최대 limit). */
export function record(h: History, prev: Tree, limit = 100): History {
    return { past: [...h.past, prev].slice(-limit), future: [] };
}

/** 되돌리기 — 과거의 맨 뒤를 꺼내고 지금(current)을 미래에. 과거가 비면 null. */
export function undo(h: History, current: Tree): { tree: Tree; history: History } | null {
    if (h.past.length === 0) return null;
    const tree = h.past[h.past.length - 1];
    return { tree, history: { past: h.past.slice(0, -1), future: [current, ...h.future] } };
}

/** 다시하기 — 미래의 맨 앞을 꺼내고 지금(current)을 과거에. 미래가 비면 null. */
export function redo(h: History, current: Tree): { tree: Tree; history: History } | null {
    if (h.future.length === 0) return null;
    const tree = h.future[0];
    return { tree, history: { past: [...h.past, current], future: h.future.slice(1) } };
}
