/**
 * 나무 보관 — load/save 가 갈아끼울 데(설계 「갈아끼울 데」: 저장소를 파일·NAS 로 옮겨도 바뀌는 건 여기다).
 *   🔴 ⭐ 메모리는 그대로, 디스크만 쪼갠다 — 「나무 통째 한 레코드」에서 「노드당 한 레코드」로.
 *      store.ts 가 diffIds 로 바뀐 id 를 주니(dirty 집합) 바뀐 노드만 쓴다. 머리(root·trash·rev)는 '__meta' 레코드.
 *   ⭐ 「받아들이기」 — 저장값이 없거나 모양이 틀렸으면 빈 나무로. 깨진 값에 터지지 않는다(coerce·normalize).
 *   🔴 이 파일이 저장소 레이어다 — nodesGetAll/nodesWrite 를 직접 부르는 유일한 플러그인(구조 검사 ⑭ 예외).
 *      옛 자료 이사(옛 kv 의 'tree' 레코드 · 더 옛 localStorage)는 host.store·host.storage 창구로 읽는다.
 *   🔴 R3-X 탭 간 동기화 — 다른 탭이 쓴 노드 id 를 받아(cross-tab) 저장소에서 다시 읽어 store 에 넘긴다(onRemoteNodes).
 *      ⭐ 이 탭이 아직 안 쓴 칸(dirty — 편집 중)은 덮지 않는다: 미뤘다가 내 쓰기가 끝난 뒤 다시 읽는다(그때 IDB 가 진짜 마지막 값).
 *      영구삭제는 purge 로 넘겨 묘비를 남긴다 — 다른 탭의 낡은 사본이 put 해도 kv 가 버리고(onRejected) 여기서 치운다.
 */
import type { PluginHost } from '../../plugin';
import { type Tree, type Node, emptyTree, normalize } from '../nodes/model/tree';
import { nodesGetAll, nodesWrite } from '../../kv';
import { onOtherTabWrite } from '../../cross-tab';
import { brokenNode, brokenDataOf, brokenReasons } from '../nodes/model/broken';

const KEY = 'tree';           // 옛 「나무 통째」 레코드 키(kv·localStorage 이사 입구)
const META_ID = '__meta';     // 노드 스토어의 예약 id — 나무의 머리(root·trash·rev). 노드 id 는 'n…' 라 안 부딪힌다.

/** 디바운스 — 조작마다 바로 쓰지 않고 300ms 모은다(빠른 연속 편집에 IndexedDB 쓰기가 줄줄이 안 가게). */
const DEBOUNCE_MS = 300;

/** 나무의 머리 한 레코드 — 노드와 같은 스토어에 keyPath 'id' 로 산다. */
interface MetaRecord { id: string; root: string; trash: string; rev: number }
function metaOf(tree: Tree): MetaRecord {
    return { id: META_ID, root: tree.root, trash: tree.trash, rev: tree.rev };
}

/** 저장할 레코드 — 깨진 항목은 읽은 원래 레코드 그대로(휴지통 표식만 현재값) 쓴다. ⛔ 자동 복구 없음. */
function recOf(n: Node): object {
    const b = brokenDataOf(n);
    if (!b) return n;
    const { trashedFrom: _drop, ...rest } = b.raw;
    return { ...rest, trashedFrom: n.trashedFrom };
}

/**
 * 레코드 하나를 Node 로 — 묘비·머리·id 없는 레코드는 null.
 *   🔴 type·name·children 이 잘못됐으면 버리지 않고 「깨진 항목」 노드로 보존한다(탐색기에 경고로 보인다 · 저장 때 원본 그대로).
 */
function coerceNode(v: unknown): Node | null {
    if (!v || typeof v !== 'object') return null;
    const n = v as Record<string, unknown>;
    if (typeof n.id !== 'string') return null;
    if (n.tomb === true) return null;
    const reasons = brokenReasons(n);
    if (reasons.length > 0) return brokenNode(n.id, n, reasons);
    if (typeof n.type !== 'string' || typeof n.name !== 'string') return null;
    return {
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

/** 저장값을 Tree 로 — 모양이 틀린 칸은 버리고, 끝에 normalize 로 불변식을 세운다. */
function coerce(raw: unknown): Tree {
    if (!raw || typeof raw !== 'object') return emptyTree();
    const r = raw as Record<string, unknown>;
    if (typeof r.root !== 'string' || typeof r.trash !== 'string' || !r.nodes || typeof r.nodes !== 'object') {
        return emptyTree();
    }
    const nodes: Record<string, Node> = {};
    for (const [id, v] of Object.entries(r.nodes as Record<string, unknown>)) {
        const n = coerceNode(v);
        if (n) nodes[id] = n;
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
        if (rec.tomb === true) continue;     // 🔴 묘비(영구삭제 표식) — 노드가 아니다
        if (typeof rec.id === 'string') nodes[rec.id] = rec;
    }
    return coerce({ root: meta?.root, trash: meta?.trash, nodes, rev: meta?.rev });
}

/** 나무를 노드 스토어에 통째로 심는다(이사·첫 쓰기) — clear + 전부 put. 성패를 돌려준다. */
function migrateToNodes(tree: Tree, purge?: string[]): Promise<boolean> {
    const put = [...Object.values(tree.nodes).map(recOf), metaOf(tree)];
    return nodesWrite({ clear: true, put, purge, onRejected: rejectedByStore });
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
    bindRemote();

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
/** 🔴 다음 flush 에 영구삭제(묘비)로 쓸 id — del 이 아니라 purge 로 간다. */
const purged = new Set<string>();
/** 🔴 칸마다 마지막으로 더럽힌 순번 — 쓰는 도중(await) 같은 칸이 또 바뀌면 그 칸은 지우지 않고 다음에 다시 쓴다. */
const touched = new Map<string, number>();
let touchSeq = 0;
/** 「전부 다시」 표식 — 한 번이라도 오면 다음 flush 는 clear + 전부 put. */
let fullRewrite = false;
/** 마지막으로 성공한 flush 의 rev — 바뀌었을 때만 '__meta' 를 쓴다. */
let lastRev = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 로드 결과를 dirty 기계의 기준점으로 삼는다 — 막 읽은 상태라 깨끗하다(이사 실패면 저장 안 됐으니 다음에 전부 쓴다). */
function markLoaded(tree: Tree, saved = true): Tree {
    base.clear();
    if (saved) for (const [id, n] of Object.entries(tree.nodes)) base.set(id, n);
    dirty.clear();
    purged.clear();
    touched.clear();
    deferred.clear();
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
export function saveTree(host: PluginHost, tree: Tree, changedIds: string[] | 'all', purgedIds?: string[]): void {
    pendingHost = host;
    pendingTree = tree;
    if (changedIds === 'all') { fullRewrite = true; dirty.clear(); }
    else for (const id of changedIds) { dirty.add(id); touched.set(id, ++touchSeq); }
    for (const id of purgedIds ?? []) purged.add(id);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flushTree(); }, DEBOUNCE_MS);
}

/**
 * 쌓인 저장을 즉시 쓴다 — 디바운스 타이머·탭 닫힘(beforeunload·visibilitychange)이 부른다.
 *   🔴 한 트랜잭션(nodesWrite)에 put·del·__meta 를 묶는다. 성공해야 집합을 비운다 — 실패면 유지(다음에 다시).
 */
export async function flushTree(): Promise<void> {
    // 중복 호출 안전 — 쓰는 중이면 그 쓰기를 기다린 뒤, 그 사이 쌓인 게 있을 때만 한 번 더.
    if (flushing) {
        await flushing;
        if (pendingHost && pendingTree && (dirty.size > 0 || fullRewrite)) return flushTree();
        return;
    }
    const run = flushOnce();
    flushing = run;
    try { await run; } finally { if (flushing === run) flushing = null; }
}

let flushing: Promise<void> | null = null;

/** 실패 재시도 — 지수 백오프(1s·2s·4s… 최대 30s). 성공하면 되돌린다. */
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
let retryMs = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry(): void {
    if (retryTimer) return;
    retryMs = retryMs ? Math.min(retryMs * 2, RETRY_MAX_MS) : RETRY_BASE_MS;
    retryTimer = setTimeout(() => { retryTimer = null; void flushTree(); }, retryMs);
}
function resetRetry(): void {
    retryMs = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

async function flushOnce(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    const host = pendingHost;
    const tree = pendingTree;
    if (!host || !tree) return;

    // 「전부 다시」 — 첫 쓰기·이사 재시도.
    if (fullRewrite) {
        const purge = [...purged].filter((id) => !tree.nodes[id]);
        const ok = await migrateToNodes(tree, purge);
        if (ok) {
            base.clear();
            for (const [id, n] of Object.entries(tree.nodes)) base.set(id, n);
            fullRewrite = false; dirty.clear(); purged.clear(); touched.clear(); lastRev = tree.rev; pendingHost = null; pendingTree = null; resetRetry(); afterWrite();
        }
        else scheduleRetry();
        return;   // 실패면 fullRewrite·pending 유지 → 다음에 다시
    }

    const put: object[] = [];
    const del: string[] = [];
    const purge: string[] = [];
    const mine: Node[] = [];
    for (const id of dirty) {
        const n = tree.nodes[id];
        if (n) mine.push(n);                        // 있으면 put(아래에서 저장소의 새 값과 합친다)
        else if (purged.has(id)) purge.push(id);    // 🔴 영구삭제 — 묘비까지
        else del.push(id);                          // 없어졌으면 del(되돌린 만들기 등 — 다시 하기로 살아날 수 있다)
    }
    // 🔴 W-X 낡은 사본 덮기 막기 — 저장소의 그 노드가 내가 마지막으로 본 값(base)과 다르면 다른 탭이 그 사이 썼다.
    //    노드를 통째로 put 하면 그 탭의 칸이 사라진다(시트·시간표 data 는 문서 통째) → 세 갈래로 합쳐 쓴다(merge3).
    //    🔴 W-X2 합치기는 nodesWrite 안에서 — 저장소 읽기·합치기·쓰기가 한 트랜잭션이라 경쟁 창이 없다(탭이 닫히는 중의 저장도).
    //    합친 값이 내 값과 다르면 쓴 뒤 저장소를 다시 읽어 이 탭 화면에도 들인다(deferred).
    const merged = new Set<string>();
    put.push(...mine.map(recOf));
    const merge = mergeGuard ? (n: object, stored: unknown): object => {
        const id = (n as { id?: unknown }).id;
        if (typeof id !== 'string' || id === META_ID) return n;
        const b = base.get(id);
        const theirs = coerceNode(stored);
        if (!b || !theirs || deepEqual(theirs, b)) return n;
        const m = merge3(b, n, theirs) as Node;
        if (!deepEqual(m, n)) merged.add(id);
        return m;
    } : undefined;
    if (tree.rev !== lastRev) put.push(metaOf(tree));   // 머리는 rev 가 바뀌었을 때만
    if (put.length === 0 && del.length === 0 && purge.length === 0) { pendingHost = null; pendingTree = null; resetRetry(); afterWrite(); return; }

    // 🔴 쓰는 동안 새로 쌓인 칸은 지우면 안 된다 — 이번에 쓴 것만 덜어낸다.
    const wrote = new Map([...dirty].map((id) => [id, touched.get(id)]));
    const ok = await nodesWrite({ put, del, purge, onRejected: rejectedByStore, merge });
    if (ok) {
        // ⭐ base = 내 메모리 값(합친 값이 아니라) — 이 탭 나무는 아직 그걸 뿌리로 두고 있다. 합친 값은 다시 읽을 때 base 가 된다.
        for (const n of mine) base.set(n.id, n);
        for (const id of [...del, ...purge]) base.delete(id);
        for (const id of merged) deferred.add(id);
        for (const [id, seq] of wrote) {
            if (touched.get(id) !== seq) continue;   // 쓰는 사이 또 바뀌었다 — 남겨 둔다
            dirty.delete(id); purged.delete(id); touched.delete(id);
        }
        lastRev = tree.rev;
        if (dirty.size === 0 && !fullRewrite) { pendingHost = null; pendingTree = null; }
        resetRetry();
        afterWrite();
    }
    else scheduleRetry();   // 실패면 dirty·pending 유지 — 백오프로 자동 재시도(실패 보고는 nodesWrite 가 했다).
}

// ── W-X 세 갈래 합치기 ──
/** 🔴 이 탭이 마지막으로 저장소와 맞춰 본 노드 값 — 로드·내 쓰기·다시 읽기 때 갱신. 다른 탭이 그 사이 썼는지 가르는 기준. */
const base = new Map<string, Node>();
/** 🔴 버그 심기 스위치 — false 로 두면 낡은 사본이 통째로 덮는다(cross-tab-sheet.test 가 빨개져야 한다). */
let mergeGuard = true;

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 값 같음(키 순서 무시 · undefined 칸 = 없는 칸). */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    if (!isPlain(a) || !isPlain(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
}

/** 배열 원소의 이름표 — `id`·`key` 문자열(시트 행·열). 없으면 null(그 배열은 통째 값으로 본다). */
function idOf(v: unknown): string | null {
    if (!isPlain(v)) return null;
    if (typeof v.id === 'string') return 'i:' + v.id;
    if (typeof v.key === 'string') return 'k:' + v.key;
    return null;
}

function mergeArrays(b: unknown[], m: unknown[], t: unknown[]): unknown[] {
    const ids = (xs: unknown[]) => xs.map(idOf);
    const ib = ids(b), im = ids(m), it = ids(t);
    if ([...ib, ...im, ...it].some((x) => x === null)) return m;   // 이름표 없는 배열 — 둘 다 고쳤으면 내 것
    const byB = new Map(b.map((x, i) => [ib[i]!, x]));
    const byM = new Map(m.map((x, i) => [im[i]!, x]));
    const byT = new Map(t.map((x, i) => [it[i]!, x]));
    const same = (x: (string | null)[], y: (string | null)[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    let order: string[];
    if (same(im, ib)) order = it as string[];                       // 내가 행·열 구성을 안 바꿨다 — 그쪽 구성
    else if (same(it, ib)) order = im as string[];                  // 그쪽이 안 바꿨다 — 내 구성
    else {                                                          // 둘 다 바꿨다 — 내 순서 · 그쪽이 지운 것 빼고 · 그쪽이 더한 것 끝에
        order = (im as string[]).filter((id) => !(byB.has(id) && !byT.has(id)));
        for (const id of it as string[]) if (!byB.has(id) && !byM.has(id)) order.push(id);
    }
    return order.map((id) => {
        const x = byM.get(id), y = byT.get(id);
        return x !== undefined && y !== undefined ? merge3(byB.get(id), x, y) : (x ?? y);
    });
}

/**
 * 세 갈래 합치기 — base(공통 뿌리) · mine(이 탭) · theirs(저장소 = 다른 탭이 쓴 값).
 *   한쪽만 바꾼 칸은 바꾼 쪽 · 둘 다 바꿨으면 객체는 칸마다 내려가고, 끝까지 부딪히면 내 것(마지막 쓰기가 이긴다).
 *   `id`·`key` 를 단 원소의 배열(시트 rows·cols)은 원소마다 합친다 — 다른 행의 칸을 고친 두 탭이 서로를 안 지운다.
 */
export function merge3(b: unknown, m: unknown, t: unknown): unknown {
    if (deepEqual(m, b)) return t;
    if (deepEqual(t, b) || deepEqual(m, t)) return m;
    if (Array.isArray(b) && Array.isArray(m) && Array.isArray(t)) return mergeArrays(b, m, t);
    if (isPlain(m) && isPlain(t)) {
        const bo = isPlain(b) ? b : {};
        const out: Record<string, unknown> = {};
        for (const k of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(bo)])) {
            const v = merge3(bo[k], m[k], t[k]);
            if (v !== undefined) out[k] = v;
        }
        return out;
    }
    return m;
}

// ── 탭 간 동기화(R3-X) ──
/** 다른 탭이 바꾼 노드 — id → 저장소의 지금 값(없으면 null = 지워졌다). full 이면 저장소 전부를 다시 읽은 것. */
export type RemoteNodes = { nodes: Map<string, Node | null>; full: boolean };
let remoteFn: ((r: RemoteNodes) => void) | null = null;
/** 🔴 내가 아직 안 쓴 칸(dirty)이라 미룬 원격 id — 내 쓰기가 끝나면 다시 읽는다. */
const deferred = new Set<string>();
let deferredAll = false;
let remoteBound = false;

/** store 가 한 번 — 다른 탭 변경을 받는다. */
export function onRemoteNodes(fn: (r: RemoteNodes) => void): void { remoteFn = fn; }

/** 지금 이 탭이 그 칸을 쥐고 있나(아직 저장소에 안 쓴 편집) — store 가 병합 때 묻는다. */
export function isPendingLocal(id: string): boolean { return fullRewrite || dirty.has(id); }

/** 병합 뒤 store 가 부른다 — 디바운스 중인 쓰기가 낡은 나무를 들고 있지 않게 새 나무로 바꿔 끼운다. */
export function rebasePending(tree: Tree): void { if (pendingTree) pendingTree = tree; }

function bindRemote(): void {
    if (remoteBound) return;
    remoteBound = true;
    onOtherTabWrite((c) => { if (c.kind === 'nodes') void pullRemote(c.ids); });
}

/** 묘비에 막힌 put — 이 탭의 사본이 낡았다(다른 탭이 영구삭제). 저장소를 다시 읽어 치운다. */
function rejectedByStore(ids: string[]): void { void pullRemote(ids); }

/** 내 쓰기가 끝났다 — 미뤄 둔 원격 칸을 이제 다시 읽는다(저장소가 진짜 마지막 값을 쥐고 있다). */
function afterWrite(): void {
    if (deferredAll) { deferredAll = false; deferred.clear(); void pullRemote('all'); return; }
    if (deferred.size === 0) return;
    const ids = [...deferred];
    deferred.clear();
    void pullRemote(ids);
}

/** 저장소에서 다시 읽어 store 에 넘긴다 — 🔴 그 사이 이 탭이 쥔 칸(dirty)은 빼서 미룬다(편집 유실 ⛔). */
async function pullRemote(ids: string[] | 'all'): Promise<void> {
    if (!remoteFn) return;
    const all = await nodesGetAll();
    if (all == null) return;
    const byId = new Map<string, unknown>();
    for (const r of all) if (r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string') byId.set((r as { id: string }).id, r);
    const full = ids === 'all';
    const want = full ? [...byId.keys()] : ids;
    if (full && fullRewrite) { deferredAll = true; return; }
    if (full) for (const id of [...base.keys()]) if (!byId.has(id) && !dirty.has(id)) base.delete(id);
    const nodes = new Map<string, Node | null>();
    for (const id of want) {
        if (id === META_ID) continue;
        if (dirty.has(id)) { deferred.add(id); continue; }
        const rec = byId.get(id);
        if (rec && (rec as { tomb?: unknown }).tomb === true) continue;
        const n = rec === undefined ? null : coerceNode(rec);
        nodes.set(id, n);
        if (n) base.set(id, n); else base.delete(id);   // 이 탭이 이제 저장소 값을 뿌리로 쥔다
    }
    if (nodes.size === 0 && !full) return;
    remoteFn?.({ nodes, full });     // 읽는 사이(await) 구독이 풀렸을 수 있다
}

// 🔴 디바운스 중 탭을 닫으면 그 300ms 가 유실된다 — beforeunload·visibilitychange(hidden)에서 즉시 flush.
//    이 둘이 없으면 디바운스는 넣지 않는 게 낫다. 한 번만 묶는다(모듈 전역 창구라 중복 등록 안 한다).
let flushBound = false;
function bindFlush(): void {
    if (flushBound) return;
    if (typeof window === 'undefined') return;
    flushBound = true;
    // ⭐ W-X2 닫히는 중에도 합친다 — 합치기가 쓰기 트랜잭션 안이라 따로 읽는 한 박자가 없다.
    const flush = () => { void flushTree(); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
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
    purged.clear();
    touched.clear();
    deferred.clear();
    deferredAll = false;
    base.clear();
    mergeGuard = true;
    fullRewrite = false;
    lastRev = 0;
    remoteFn = null;
    remoteBound = false;
    if (timer) { clearTimeout(timer); timer = null; }
    resetRetry();
    flushing = null;
    flushBound = false;
}
