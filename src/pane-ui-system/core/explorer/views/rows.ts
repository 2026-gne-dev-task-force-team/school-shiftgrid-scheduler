/**
 * 탐색기가 그릴 줄 배열 — 실노드와 유도(가상) 줄을 한 줄 타입으로 섞어 낸다.
 *   🔴 유도 자식은 「저장된 자식 뒤에」 붙는다(섞이지 않는다). id 는 `<부모id>/<key>` — `/` 가 「가상」 표식이다.
 *   🔴 탐색기는 타입을 모른다 — 컨테이너 여부·아이콘·유도는 전부 등록 표(model/types)·캐시(model/derive)에 묻는다.
 *   ⚠️ 검색 중에는 이 빌더를 안 쓴다(그땐 실노드만 flatten) — 유도 줄은 저장이 없어 검색 대상이 아니다.
 */
import type { IconName } from '../../../plugin';
import type { Node, Tree } from '../../nodes/model/tree';
import { isContainerType, isSectionType, getType } from '../../nodes/model/types';
import { getDerived } from '../../nodes/model/derive';

export type ExplorerRow =
    | { kind: 'node'; id: string; depth: number; node: Node; hasChildren: boolean; sec?: string }
    | {
        kind: 'virtual';
        id: string; depth: number;
        name: string; icon?: IconName; vtype?: string; openable?: boolean;
        hasChildren: boolean; failed?: boolean; sec?: string;
    };

/**
 * fromId 자손을 순서대로 — 각 컨테이너는 저장된 자식(재귀) 다음에 유도 자식을 붙인다.
 *   접힘(collapsed)은 실노드 컨테이너에서만 — 유도 줄은 1차엔 늘 펼쳐 그린다(중첩 유도 포함).
 *   🔴 이 빌더는 flatten 을 안 거치고 tree.nodes 를 직접 돈다 — 그래서 숨김 건너뛰기를 여기서도 해야 한다
 *     (안 하면 본 나무에 숨길 노드가 뜬다 — flatten 과 같은 규칙: 그 줄도 그 아래도 건너뛴다). 둘 다 없으면 옛 동작.
 *     isRecord(무조건 · 타입 · 옛 소비자) 와 hidden(노드째 · 레코드+조건부 합침 · 탐색기) 둘 중 하나라도 참이면 건너뛴다.
 */
export function buildMainRows(
    tree: Tree,
    fromId: string,
    isRecord?: (type: string) => boolean,
    hidden?: (node: Node) => boolean,
): ExplorerRow[] {
    const out: ExplorerRow[] = [];
    // 🔴 「이 노드를 건너뛸까」 — isRecord(타입) 와 hidden(노드) 둘 다 본다(flatten 과 같은 규칙).
    const hid = isRecord || hidden
        ? (node: Node): boolean => (isRecord?.(node.type) ?? false) || (hidden?.(node) ?? false)
        : null;

    const emitVirtual = (
        vnodes: { key: string; name: string; icon?: IconName; type?: string; openable?: boolean; children?: unknown[] }[],
        parentVid: string,
        depth: number,
        sec?: string,
    ): void => {
        for (const v of vnodes) {
            const vid = `${parentVid}/${v.key}`;
            const kids = (v.children ?? []) as typeof vnodes;
            out.push({
                kind: 'virtual', id: vid, depth,
                name: v.name, icon: v.icon, vtype: v.type, openable: v.openable,
                hasChildren: kids.length > 0, sec,
            });
            if (kids.length) emitVirtual(kids, vid, depth + 1, sec);   // 중첩 유도 — 늘 펼침
        }
    };

    // sec = 이 줄이 든 섹션 id(섹션 자신 포함) — 뷰가 이걸로 칸을 가른다. 섹션 안 자식은 깊이 0(들여쓰기 없음), 그 자손부터 평소대로.
    const walk = (id: string, depth: number, sec?: string): void => {
        const n = tree.nodes[id];
        if (!n) return;
        for (const cid of n.children) {
            const c = tree.nodes[cid];
            if (!c) continue;
            if (hid?.(c)) continue;   // 🔴 숨김(레코드 무조건 + hidden 조건부) — 줄도 그 아래도 건너뛴다(flatten 과 같은 규칙)
            const def = getType(c.type);
            const container = isContainerType(c.type);
            const der = def?.derive ? getDerived(c, def) : null;
            const hasDerived = !!der && (der.failed || der.children.length > 0);
            // 🔴 ▸ 토글은 「보이는 하위」로만 선다 — 숨긴 자식(레코드·조건부)은 세지 않는다(flatten 과 같은 규칙 · 쥔님 11-02).
            const visibleKids = hid
                ? c.children.reduce((acc, k) => { const kn = tree.nodes[k]; return acc + (kn && !hid(kn) ? 1 : 0); }, 0)
                : c.children.length;
            const hasChildren = container && (visibleKids > 0 || hasDerived);
            const isSec = isSectionType(c.type);
            const csec = isSec ? cid : sec;
            out.push({ kind: 'node', id: cid, depth, node: c, hasChildren, sec: csec });

            const expand = hasChildren && !c.collapsed;
            if (expand) {
                walk(cid, isSec ? 0 : depth + 1, csec);             // 저장된 자식 먼저
                if (der?.failed) {
                    out.push({ kind: 'virtual', id: `${cid}/⚠`, depth: depth + 1, name: '유도 실패', hasChildren: false, failed: true, sec: csec });
                } else if (der) {
                    emitVirtual(der.children, cid, depth + 1, csec);      // 그 뒤에 유도 자식
                }
            }
        }
    };

    walk(fromId, 0);
    return out;
}
