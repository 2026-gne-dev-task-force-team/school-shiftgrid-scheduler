/**
 * 달력 ↔ 노드 시스템 다리 — 🔴 달력은 「저장」을 모른다(요구명세 핵심). 일정은 노드고, 저장·휴지통·캐스케이딩은 노드 시스템이 한다.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(구조 검사 ⑨: import type 만 허용 → 값은 host.plugins.get).
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘 등록(calendar.store·calendar.event record) — index.ts 가 부른다
 *   ② NodesApi 참조 + 「기본 저장소」 기억(마지막으로 open 한 저장소)
 *   ③ byType 스냅샷(일정·저장소)을 subscribe 로 갱신 — useEvents 가 useSyncExternalStore 로 읽는다
 *   ④ 만들기·고치기·휴지통·저장소 바꾸기 조작(전부 NodesApi 로)
 */
// 🔴 import type 만 — 값은 host.plugins.get 으로 받는다(구조 검사 ⑨ 예외는 타입 전용뿐)
import type { NodesApi, PublicNode } from '../project-explorer/api';
import type { Disposable } from '../../pane-ui-system/plugin';
import type { EventData } from './events';

export const STORE_TYPE = 'calendar.store';
export const EVENT_TYPE = 'calendar.event';

// ── 다리 상태(모듈 전역 — store.ts·view-registry 와 같은 결) ──
let api: NodesApi | null = null;
let defaultStoreId: string | null = null;
let eventNodes: PublicNode[] = [];
let storeNodes: PublicNode[] = [];
const subs = new Set<() => void>();

/** byType 스냅샷을 다시 뜨고 구독자(useEvents)를 깨운다 — subscribe 변경 때만 불린다(매 렌더 아님). */
function recompute(): void {
    eventNodes = api ? api.byType(EVENT_TYPE) : [];
    storeNodes = api ? api.byType(STORE_TYPE) : [];
    for (const s of subs) s();
}

/**
 * 타입 둘을 꽂는다 — 🔴 record 리터럴은 여기(비-뷰)에 산다(구조 검사 ⑯: 뷰엔 소문자 record 금지).
 *   저장소: 폴더 역할(일정만 받음)·열 수 있음(열면 달력 탭 + 기본 저장소 지정)·우클릭 「새로 만들기」 후보.
 *   일정: record: true — 탐색기에 어떤 경우에도 안 보인다. 저장·휴지통은 일반 노드와 같다.
 */
export function registerCalendarTypes(nodes: NodesApi, onOpenStore: (id: string) => void): Disposable {
    const d1 = nodes.types.register({
        type: STORE_TYPE, label: '달력 저장소', icon: 'calendar',
        container: { accepts: [EVENT_TYPE] }, openable: true,
        open: (id) => { setDefaultStore(id); onOpenStore(id); },
        create: { label: '달력 저장소', under: ['folder'] },
    });
    const d2 = nodes.types.register({ type: EVENT_TYPE, label: '일정', icon: 'calendar', record: true });
    return { dispose() { d1.dispose(); d2.dispose(); } };
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다(없으면 조용히 빈 상태). 돌려준 Disposable 은 호스트가 회수. */
export function initCalendarNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구(useSyncExternalStore) — 스냅샷은 recompute 때만 새 배열이 된다(그 사이엔 안정) ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getEventNodes(): PublicNode[] { return eventNodes; }
export function getStoreNodes(): PublicNode[] { return storeNodes; }

/** 조상에 휴지통이 있나 — 🔴 nodes.path 는 휴지통 sentinel 을 안 담으니(거기서 멈춘다) 부모 사슬을 직접 탄다. */
export function inTrash(id: string): boolean {
    if (!api) return false;
    const trash = api.roots.trash;
    let cur: string | null = api.parent(id);
    let guard = 0;
    while (cur && guard < 1000) {
        if (cur === trash) return true;
        if (cur === api.roots.main) return false;
        cur = api.parent(cur);
        guard++;
    }
    return false;
}

// ── 기본 저장소 ──
export function setDefaultStore(id: string): void { defaultStoreId = id; }

/** 지금 쓸 「기본 저장소」 — 마지막 open 한 것(살아 있고 휴지통 아님), 없으면 첫 번째 살아 있는 저장소, 그것도 없으면 null. */
export function getDefaultStore(): string | null {
    if (!api) return null;
    const live = storeNodes.filter((s) => !inTrash(s.id));
    if (defaultStoreId && live.some((s) => s.id === defaultStoreId)) return defaultStoreId;
    return live[0]?.id ?? null;
}

/** 저장소를 하나도 안 가졌으면 루트 밑에 「기본」을 만들고 그 id 를, 있으면 기본 저장소 id 를 돌려준다. 🔴 「기본」 자동 생성은 저장소 0일 때만. */
export function ensureStore(): string | null {
    if (!api) return null;
    const existing = getDefaultStore();
    if (existing) return existing;
    const id = api.create(api.roots.main, { type: STORE_TYPE, name: '기본' });
    if (id) setDefaultStore(id);
    return id || null;
}

/** 일정 하나 만들기 — 저장소를 보장하고 그 밑에. 돌려주는 id 가 빈 문자열이면 못 만든 것. */
export function createEvent(data: EventData, name = '', storeId?: string): string {
    if (!api) return '';
    const target = storeId ?? ensureStore();
    if (!target) return '';
    return api.create(target, { type: EVENT_TYPE, name, data });
}

export function updateEventData(id: string, data: EventData): void { api?.setData(id, data); }
export function renameEvent(id: string, name: string): void { api?.rename(id, name); }
export function moveEvent(id: string, storeId: string): void { api?.move(id, storeId); }
export function removeEvent(id: string): void { api?.remove(id); }
