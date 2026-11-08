/**
 * 구독 ↔ 노드 다리 — 구독은 **노드로** 저장한다(쥔님 2026-11-08: "프로젝트 데이터와 같이 다니는 쪽이 낫다").
 *   🔴 공휴일 같은 구독은 기기마다 같아야 하고(동기화), lastIcs 캐시도 프로젝트와 함께 다녀 오프라인에서도 보인다.
 *      host.storage(기기별 localStorage)가 아니라 노드(프로젝트 데이터)인 이유다. 노드 타입은 record(탐색기에 안 보임).
 *   ⛔ host.store·kv 직접 안 봄 — NodesApi 하나로만(값은 host.modules.use('nodes'), 타입만 import).
 */
import type { NodesApi, PublicNode } from '../project-explorer/contracts/nodes';
import type { Disposable } from '../../pane-ui-system/plugin';
import type { SubData, SubNode } from './model';
import { defaultColor } from './model';

export const SUB_TYPE = 'calendar-subscribe.subscription';

let api: NodesApi | null = null;
let subNodes: PublicNode[] = [];
const subs = new Set<() => void>();

/** 조상에 휴지통이 있나 — byType 은 휴지통 노드도 담으니(달력과 같은 결) 지운 구독을 거른다. */
function inTrash(id: string): boolean {
    if (!api) return false;
    let cur: string | null = api.parent(id);
    let guard = 0;
    while (cur && guard < 1000) {
        if (cur === api.roots.trash) return true;
        if (cur === api.roots.main) return false;
        cur = api.parent(cur);
        guard++;
    }
    return false;
}

function recompute(): void {
    subNodes = api ? api.byType(SUB_TYPE).filter((n) => !inTrash(n.id)) : [];
    for (const s of subs) s();
}

/** 활성(index)이 한 번 — NodesApi 를 쥐고 구독을 건다. 돌려준 Disposable 은 index 가 회수. */
export function initSubs(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getSubsApi(): NodesApi | null { return api; }

// ── React 구독 창구 ──
export function subscribeSubs(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getSubsSnapshot(): PublicNode[] { return subNodes; }

/** 얇은 뷰 — {id, data}. */
export function listSubs(): SubNode[] {
    return subNodes.map((n) => ({ id: n.id, data: (n.data ?? {}) as SubData }));
}

/** 링크로 구독 하나 추가 — 루트 밑 record 노드로. 돌려주는 id 가 빈 문자열이면 못 만든 것. */
export function addSub(name: string, url: string, color?: string): string {
    if (!api) return '';
    const data: SubData = { name, url, color: color ?? defaultColor(subNodes.length), enabled: true };
    return api.create(api.roots.main, { type: SUB_TYPE, name: name || '구독', data });
}

/** 구독 data 일부를 고친다(켜기/끄기·색·이름·lastIcs·오류 등). */
export function updateSub(id: string, patch: Partial<SubData>): void {
    if (!api) return;
    const cur = (api.get(id)?.data ?? {}) as SubData;
    const next = { ...cur, ...patch };
    api.setData(id, next);
    if (patch.name !== undefined) api.rename(id, patch.name || '구독');
}

/** 구독을 휴지통으로. */
export function removeSub(id: string): void { api?.remove(id); }
