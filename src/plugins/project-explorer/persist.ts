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

/** localStorage(host.storage)에서 읽기 — kv 불가 환경의 버팀줄. */
function loadLocal(host: PluginHost): Tree {
    try {
        return coerce(host.storage.get<unknown>(KEY, null));
    } catch {
        return emptyTree();   // 저장값이 아예 깨졌어도 빈 나무로 — 터지지 않는다
    }
}

// 🔴 kv 를 쓰나 — loadTree 가 환경을 보고 정한다. false 면 saveTree 가 옛 경로(localStorage)로 떨어진다.
//    (모듈 전역 하나 — 이 플러그인의 나무 저장은 한 창구다. 환경은 세션 중에 안 바뀐다.)
let useKv = true;

/**
 * 나무를 읽어 들인다(비동기) — 🔴 옛 데이터 이사(한 번만)까지 여기서.
 *   ① kv 에 tree 가 있으면 그걸 쓴다.
 *   ② kv 엔 없고 localStorage(host.storage)에 있으면 그 값을 kv 로 옮기고 그걸 쓴다.
 *      ⛔ localStorage 원본은 지우지 않는다 — 판단 삭제는 사람 몫이다(이 레포·볼트의 규칙). 다음 로드부턴
 *         ①이 먼저 걸리니 두 번 이사하지 않는다(저장은 그 뒤 kv 에만 간다).
 *   ③ 둘 다 없으면 빈 나무.
 *   🔴 kvAvailable()=false(사파리 프라이빗·정책)면 kv 를 건너뛰고 localStorage 로 버틴다 — saveTree 도 옛 경로로.
 */
export async function loadTree(host: PluginHost): Promise<Tree> {
    bindFlush();
    useKv = await host.store.available();
    if (!useKv) return loadLocal(host);

    // ① kv 우선 — 저장된 나무는 늘 객체라 null 이 곧 「없음」이다.
    const inKv = await host.store.get<unknown>(KEY, null);
    if (inKv != null) return coerce(inKv);

    // ② localStorage 에 옛 나무가 있으면 kv 로 이사(원본 유지).
    const inLocal = host.storage.get<unknown>(KEY, null);
    if (inLocal != null) {
        const tree = coerce(inLocal);
        await host.store.set(KEY, tree);   // 🔴 이사 한 번 — localStorage 원본은 그대로 둔다(위 ⛔)
        return tree;
    }

    // ③ 아무 데도 없음
    return emptyTree();
}

// ── 디바운스 저장 ──
let pending: { host: PluginHost; tree: Tree } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function writeNow(host: PluginHost, tree: Tree): Promise<void> {
    if (useKv) return host.store.set(KEY, tree);
    host.storage.set(KEY, tree);   // 🔴 kv 불가 — 옛 경로. 실패는 상태바(StorageErrorStatus)가 비춘다
    return Promise.resolve();
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

/** 🔴 테스트 전용 — 모듈 전역(useKv·디바운스·리스너 플래그)을 비운다. 프로덕션 경로는 안 부른다. */
export function __resetPersistForTest(): void {
    useKv = true;
    pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    flushBound = false;
}
