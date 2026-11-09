/**
 * 나무 보관 — load/save 가 갈아끼울 데(설계 「갈아끼울 데」: 저장소를 파일·NAS 로 옮겨도 바뀌는 건 여기다).
 *   🔴 ⭐ 메모리는 그대로, 디스크만 쪼갠다 — 「나무 통째 한 레코드」에서 「노드당 한 레코드」로.
 *      store.ts 가 diffIds 로 바뀐 id 를 주니(dirty 집합) 바뀐 노드만 쓴다. 머리(root·trash·rev)는 '__meta' 레코드.
 *   ⭐ 「받아들이기」 — 저장값이 없거나 모양이 틀렸으면 빈 나무로. 깨진 값에 터지지 않는다(coerce·normalize).
 *   🔴 이 파일이 저장소 레이어다 — nodesGetAll/nodesWrite 를 직접 부르는 유일한 플러그인(구조 검사 ⑭ 예외).
 *      옛 자료 이사(옛 kv 의 'tree' 레코드 · 더 옛 localStorage)는 host.store·host.storage 창구로 읽는다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import { type Tree, type Node, emptyTree, normalize } from './model/tree';
import { nodesGetAll, nodesWrite } from '../../pane-ui-system/kv';

const KEY = 'tree';           // 옛 「나무 통째」 레코드 키(kv·localStorage 이사 입구)
const META_ID = '__meta';     // 노드 스토어의 예약 id — 나무의 머리(root·trash·rev). 노드 id 는 'n…' 라 안 부딪힌다.

/** 디바운스 — 조작마다 바로 쓰지 않고 300ms 모은다(빠른 연속 편집에 IndexedDB 쓰기가 줄줄이 안 가게). */
const DEBOUNCE_MS = 300;

/** 나무의 머리 한 레코드 — 노드와 같은 스토어에 keyPath 'id' 로 산다. */
interface MetaRecord { id: string; root: string; trash: string; rev: number }
function metaOf(tree: Tree): MetaRecord {
    return { id: META_ID, root: tree.root, trash: tree.trash, rev: tree.rev };
}

/** 저장값을 Tree 로 — 모양이 틀린 칸은 버리고, 끝에 normalize 로 불변식을 세운다. */
function coerce(raw: unknown): Tree {
    if (!raw || typeof raw !== 'object') return emptyTree();
    const r = raw as Record<string, unknown>;
    if (typeof r.root !== 'string' || typeof r.trash !== 'string' || !r.nodes || typeof r.nodes !== 'object') {
        return emptyTree();
    }
    const nodes: Record<string, Node> = {};
    for (const [id, v] of Object.entries(r.nodes as Record<string, unknown>)) {
        if (!v || typeof v !== 'object') continue;
        const n = v as Record<string, unknown>;
        if (typeof n.id !== 'string' || typeof n.type !== 'string' || typeof n.name !== 'string') continue;
        nodes[id] = {
            id: n.id,
            type: n.type,
            name: n.name,
            children: Array.isArray(n.children) ? n.children.filter((c): c is string => typeof c === 'string') : [],
            collapsed: n.collapsed === true ? true : undefined,
            data: n.data,
            icon: typeof n.icon === 'string' && n.icon ? n.icon : undefined,
            body: n.body,
        };
    }
    const tree: Tree = {
        root: r.root,
        trash: r.trash,
        nodes,
        rev: typeof r.rev === 'number' && Number.isFinite(r.rev) ? r.rev : 0,
    };
    return normalize(tree);
}

/** 노드 레코드들 + '__meta' 를 Tree 로 조립 — coerce 가 모양을 받아들인다(머리가 없으면 빈 나무). */
function assemble(records: unknown[]): Tree {
    let meta: Partial<MetaRecord> | null = null;
    const nodes: Record<string, unknown> = {};
    for (const r of records) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        if (rec.id === META_ID) { meta = rec as Partial<MetaRecord>; continue; }
        if (typeof rec.id === 'string') nodes[rec.id] = rec;
    }
    return coerce({ root: meta?.root, trash: meta?.trash, nodes, rev: meta?.rev });
}

/** 나무를 노드 스토어에 통째로 심는다(이사·첫 쓰기) — clear + 전부 put. 성패를 돌려준다. */
function migrateToNodes(tree: Tree): Promise<boolean> {
    const put = [...Object.values(tree.nodes), metaOf(tree)];
    return nodesWrite({ clear: true, put });
}

/**
 * 나무를 읽어 들인다(비동기) — 🔴 자료는 노드 스토어(nodes)다.
 *   ① 노드 스토어에 레코드가 있으면 조립해 쓴다.
 *   ② 노드 스토어가 열렸으나 비어 있으면([]) 옛 자료를 이사한다:
 *      ②-a 옛 kv 의 'tree' 레코드(나무 통째) → nodesWrite(clear+put) → 🔴 성공(true)일 때만 옛 레코드 삭제.
 *          실패면 옛 레코드를 남기고 그 나무를 메모리로만 쓴다(다음 쓰기 때 다시 심는다).
 *      ②-b 더 옛 localStorage 의 'tree' → 같은 길(성공 뒤에만 원본 치움).
 *      ②-c 아무 데도 없으면 빈 나무(안 심는다 — normalize 가 root·trash 를 늘 세운다).
 *   ③ 열기 실패(null)면 메모리만 — 옛 자료는 못 건드린다(내구성 신호가 상태바에 뜬다).
 */
export async function loadTree(host: PluginHost): Promise<Tree> {
    bindFlush();

    const all = await nodesGetAll();

    // ③ 열기 실패
    if (all == null) return markLoaded(emptyTree());

    // ① 노드 스토어에 이미 있다
    if (all.length > 0) return markLoaded(assemble(all));

    // ②-a 옛 kv 의 나무 통째
    const oldKv = await host.store.get<unknown>(KEY, null);
    if (oldKv != null) {
        const tree = coerce(oldKv);
        const moved = await migrateToNodes(tree);
        if (moved) await host.store.del(KEY);     // 🔴 성공 뒤에만 옛 레코드 삭제
        return markLoaded(tree, moved);
    }

    // ②-b 더 옛 localStorage 의 나무 통째
    const oldLocal = host.storage.get<unknown>(KEY, null);
    if (oldLocal != null) {
        const tree = coerce(oldLocal);
        const moved = await migrateToNodes(tree);
        if (moved) host.storage.remove(KEY);
        return markLoaded(tree, moved);
    }

    // ②-c 아무 데도 없음
    return markLoaded(emptyTree());
}

// ── 디바운스 저장(dirty 집합) ──
let pendingHost: PluginHost | null = null;
let pendingTree: Tree | null = null;
/** 다음 flush 에 쓸 바뀐 노드 id — 있으면 put, 없으면 del. */
const dirty = new Set<string>();
/** 「전부 다시」 표식 — 한 번이라도 오면 다음 flush 는 clear + 전부 put. */
let fullRewrite = false;
/** 마지막으로 성공한 flush 의 rev — 바뀌었을 때만 '__meta' 를 쓴다. */
let lastRev = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 로드 결과를 dirty 기계의 기준점으로 삼는다 — 막 읽은 상태라 깨끗하다(이사 실패면 저장 안 됐으니 다음에 전부 쓴다). */
function markLoaded(tree: Tree, saved = true): Tree {
    dirty.clear();
    pendingHost = null;
    pendingTree = null;
    fullRewrite = !saved;     // 이사 실패 → 저장소엔 아직 없다. 첫 쓰기를 「전부」로.
    lastRev = tree.rev;
    return tree;
}

/**
 * 저장 — 바뀐 id 를 dirty 집합에 모은다(300ms 디바운스). 'all' 이 오면 다음 flush 는 clear + 전부.
 *   store.ts 의 apply/undo/redo 가 diffIds(prev, next) 를 그대로 넘긴다.
 */
export function saveTree(host: PluginHost, tree: Tree, changedIds: string[] | 'all'): void {
    pendingHost = host;
    pendingTree = tree;
    if (changedIds === 'all') { fullRewrite = true; dirty.clear(); }
    else for (const id of changedIds) dirty.add(id);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flushTree(); }, DEBOUNCE_MS);
}

/**
 * 쌓인 저장을 즉시 쓴다 — 디바운스 타이머·탭 닫힘(beforeunload·visibilitychange)이 부른다.
 *   🔴 한 트랜잭션(nodesWrite)에 put·del·__meta 를 묶는다. 성공해야 집합을 비운다 — 실패면 유지(다음에 다시).
 */
export async function flushTree(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    const host = pendingHost;
    const tree = pendingTree;
    if (!host || !tree) return;

    // 「전부 다시」 — 첫 쓰기·이사 재시도.
    if (fullRewrite) {
        const ok = await migrateToNodes(tree);
        if (ok) { fullRewrite = false; dirty.clear(); lastRev = tree.rev; pendingHost = null; pendingTree = null; }
        return;   // 실패면 fullRewrite·pending 유지 → 다음에 다시
    }

    const put: object[] = [];
    const del: string[] = [];
    for (const id of dirty) {
        const n = tree.nodes[id];
        if (n) put.push(n); else del.push(id);     // 있으면 put, 없어졌으면 del
    }
    if (tree.rev !== lastRev) put.push(metaOf(tree));   // 머리는 rev 가 바뀌었을 때만
    if (put.length === 0 && del.length === 0) { pendingHost = null; pendingTree = null; return; }

    const ok = await nodesWrite({ put, del });
    if (ok) { dirty.clear(); lastRev = tree.rev; pendingHost = null; pendingTree = null; }
    // 실패면 dirty·pending 유지 — 다음 saveTree/flush 가 다시 시도한다(실패 보고는 nodesWrite 가 했다).
}

// 🔴 디바운스 중 탭을 닫으면 그 300ms 가 유실된다 — beforeunload·visibilitychange(hidden)에서 즉시 flush.
//    이 둘이 없으면 디바운스는 넣지 않는 게 낫다. 한 번만 묶는다(모듈 전역 창구라 중복 등록 안 한다).
let flushBound = false;
function bindFlush(): void {
    if (flushBound) return;
    if (typeof window === 'undefined') return;
    flushBound = true;
    const flush = () => { void flushTree(); };
    window.addEventListener('beforeunload', flush);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
    }
}

/** 🔴 테스트 전용 — 모듈 전역(디바운스·dirty·리스너 플래그)을 비운다. 프로덕션 경로는 안 부른다. */
export function __resetPersistForTest(): void {
    pendingHost = null;
    pendingTree = null;
    dirty.clear();
    fullRewrite = false;
    lastRev = 0;
    if (timer) { clearTimeout(timer); timer = null; }
    flushBound = false;
}
