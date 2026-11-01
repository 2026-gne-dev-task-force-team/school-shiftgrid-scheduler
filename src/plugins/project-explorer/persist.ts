/**
 * 나무 보관 — load/save 둘뿐(설계 「갈아끼울 데」: 저장소를 파일·NAS 로 옮겨도 바뀌는 건 이 두 함수다).
 *   🔴 N1~N4 는 host.storage(기기별 localStorage) 키 'tree' 하나. 플러그인은 이 두 함수만 안다.
 *   ⭐ 「받아들이기」 — 저장값이 없거나 모양이 틀렸으면 빈 나무로. 깨진 값에 터지지 않는다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import { type Tree, type Node, emptyTree, normalize } from './model/tree';

const KEY = 'tree';

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

export function load(host: PluginHost): Tree {
    try {
        return coerce(host.storage.get<unknown>(KEY, null));
    } catch {
        return emptyTree();   // 저장값이 아예 깨졌어도 빈 나무로 — 터지지 않는다
    }
}

export function save(host: PluginHost, tree: Tree): void {
    host.storage.set(KEY, tree);
}
