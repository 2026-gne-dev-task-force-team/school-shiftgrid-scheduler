/**
 * 나무 보관 — load/save 가 갈아끼울 데(설계 「갈아끼울 데」: 저장소를 파일·NAS 로 옮겨도 바뀌는 건 여기다).
 *   🔴 저장소가 host.storage(localStorage, origin 당 5MB)에서 host.store(IndexedDB)로 갈아탔다 —
 *      노드 하나 UTF-16 220~380B 라 1.3만~2.3만 노드에서 천장이고, 그 5MB 를 창틀 배치·테마가 같이 쓴다.
 *   ⭐ 「받아들이기」 — 저장값이 없거나 모양이 틀렸으면 빈 나무로. 깨진 값에 터지지 않는다.
 *      IndexedDB 는 객체를 구조화 복제로 그대로 담으니 JSON.parse 단계만 없어지고 검증(coerce)은 여전히 필요하다.
 *   🔴 ⛔ kvGet/kvSet 을 직접 부르지 않는다 — host.store 로만(구조 검사 ⑭). 네임스페이스 없는 키를 막는다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import { type Tree, type Node, emptyTree, normalize } from './model/tree';

const KEY = 'tree';

/** 디바운스 — 조작마다 바로 쓰지 않고 300ms 모은다(빠른 연속 편집에 IndexedDB 쓰기가 줄줄이 안 가게). */
const DEBOUNCE_MS = 300;

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

/**
 * 나무를 읽어 들인다(비동기) — 🔴 자료는 IndexedDB(host.store) 하나다. localStorage 는 옛 나무를 읽어
 *   한 번 이사하는 「입구」로만 남는다(설정 전용으로 돌아갔다 — 버팀줄·사본 없음).
 *   ① kv 에 tree 가 있으면 그걸 쓴다.
 *   ② kv 엔 없고 옛 localStorage 나무가 있으면 kv 로 옮긴다:
 *      🔴 이사 성공(true)일 때만 localStorage 원본을 치운다(host.storage.remove) — 그래야 kv 에 사본이
 *         생긴 걸 확인하고 지운다(판단 삭제가 아니라 「옮겼으니 원본 정리」).
 *      🔴 이사 실패(false)면 localStorage 원본을 남긴다 — 그게 유일한 사본이다. 실패 보고는 kv 가 이미 했다.
 *      다음 로드부턴 ①이 먼저 걸려 두 번 이사하지 않는다.
 *   ③ 둘 다 없으면 빈 나무.
 */
export async function loadTree(host: PluginHost): Promise<Tree> {
    bindFlush();

    // ① kv 우선 — 저장된 나무는 늘 객체라 null 이 곧 「없음」이다.
    const inKv = await host.store.get<unknown>(KEY, null);
    if (inKv != null) return coerce(inKv);

    // ② 옛 localStorage 나무를 kv 로 이사.
    const inLocal = host.storage.get<unknown>(KEY, null);
    if (inLocal != null) {
        const tree = coerce(inLocal);
        const moved = await host.store.set(KEY, tree);   // 🔴 성공해야 원본을 지운다
        if (moved) host.storage.remove(KEY);
        return tree;
    }

    // ③ 아무 데도 없음
    return emptyTree();
}

// ── 디바운스 저장 ──
let pending: { host: PluginHost; tree: Tree } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function writeNow(host: PluginHost, tree: Tree): Promise<void> {
    // 🔴 저장은 kv 한 곳. 실패해도(false) localStorage 로 떨어지는 길은 없다 — 실패는 상태바(StorageErrorStatus)가 비춘다.
    await host.store.set(KEY, tree);
}

/** 저장 — 300ms 디바운스. 즉시 쓰기가 필요하면 flushTree. */
export function saveTree(host: PluginHost, tree: Tree): void {
    pending = { host, tree };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flushTree(); }, DEBOUNCE_MS);
}

/** 쌓인 저장을 즉시 쓴다 — 디바운스 타이머·탭 닫힘(beforeunload·visibilitychange)이 부른다. */
export async function flushTree(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    const p = pending;
    pending = null;
    if (!p) return;
    await writeNow(p.host, p.tree);
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

/** 🔴 테스트 전용 — 모듈 전역(디바운스·리스너 플래그)을 비운다. 프로덕션 경로는 안 부른다. */
export function __resetPersistForTest(): void {
    pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    flushBound = false;
}
