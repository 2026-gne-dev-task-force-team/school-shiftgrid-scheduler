/**
 * 달력 ↔ 노드 시스템 다리 — 🔴 달력은 「저장」을 모른다(요구명세 핵심). 일정은 노드고, 저장·휴지통·캐스케이딩은 노드 시스템이 한다.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘 등록(calendar.store·calendar.event record) — index.ts 가 부른다
 *   ② NodesApi 참조 + 「기본 저장소」 기억(마지막으로 open 한 저장소)
 *   ③ byType 스냅샷(일정·저장소)을 subscribe 로 갱신 — useEvents 가 useSyncExternalStore 로 읽는다
 *   ④ 만들기·고치기·휴지통·저장소 바꾸기 조작(전부 NodesApi 로)
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인(contract-nodes)에서(값 아님, 구조 검사 ⑱·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../contract-nodes/types';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { EventData } from './events';
import { isoMinuteOf } from './events';
import { getScope, setScope } from './store';

export const STORE_TYPE = 'calendar.store';
export const EVENT_TYPE = 'calendar.event';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다). 저장소 open 이 여는 월 보기.
const MONTH_ID = 'calendar.month';

const DAY_MS = 86_400_000;

// ── 다리 상태(모듈 전역 — store.ts·view-registry 와 같은 결) ──
let api: NodesApi | null = null;
let defaultStoreId: string | null = null;
let eventNodes: PublicNode[] = [];
let storeNodes: PublicNode[] = [];
const subs = new Set<() => void>();

// ── 우클릭 메뉴가 가리킨 저장소 — 탐색기가 storeMenu(nodeId) 를 그릴 때 잡아 둔다. ──
//    🔴 ContextMenu 는 commandId 만 넘기고 인자를 안 싣는다(탐색기 onCommand=run(id)) → 명령 대상을 여기서 쥔다
//       (탐색기 명령이 스토어의 「고른 노드」를 쓰는 것과 같은 결).
let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

// ── 「열 카드」 한 칸 — 탐색기 메뉴(뷰 밖)에서 새 일정을 만들면 여기 담고, 월 보기가 마운트/구독 때 열고 비운다. ──
//    🔴 useCardPeek(뷰 안)은 뷰에 포커스가 있을 때만 돈다 — 탐색기 메뉴는 뷰 밖이라 이 한 칸을 거쳐 뷰에 넘긴다.
let pendingCardId: string | null = null;
const cardSubs = new Set<() => void>();
/** 그 일정 카드를 다음에 뜨는/떠 있는 월 보기에 열어 달라 — 담고 구독자(월 보기)를 깨운다. */
export function requestOpenCard(id: string): void { pendingCardId = id; for (const s of cardSubs) s(); }
export function subscribeCardOpen(fn: () => void): () => void { cardSubs.add(fn); return () => { cardSubs.delete(fn); }; }
export function getPendingCard(): string | null { return pendingCardId; }
export function clearPendingCard(): void { pendingCardId = null; }

/** byType 스냅샷을 다시 뜨고 구독자(useEvents)를 깨운다 — subscribe 변경 때만 불린다(매 렌더 아님). */
function recompute(): void {
    eventNodes = api ? api.byType(EVENT_TYPE) : [];
    storeNodes = api ? api.byType(STORE_TYPE) : [];
    for (const s of subs) s();
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 전환 D5) — contributes.nodeTypes 의 impl 이름('store')이 가리킨다.
 *   매니페스트엔 함수를 못 넣으니(순수 데이터) 저장소의 동작 함수(open·menu)는 여기 모아 둔다 — 노드 레지스트라
 *   (project-explorer.registerContributed)가 host 를 꽂아 NodeTypeDef 로 조립한다.
 *   · open — 열면 기본 저장소 지정 + 범위를 그 저장소로 좁히고 달력 월 보기를 가운데에(옛 onOpenStore 와 같다).
 *   · menu — 저장소 우클릭 항목 둘(storeMenu). host 는 안 쓴다.
 *   일정(record)은 순수 데이터라 impl 이 없다.
 */
export const calendarNodeTypeImpl = {
    store: {
        open: (host: PluginHost, id: string) => {
            setDefaultStore(id);
            setScope(id);
            host.workspace.open(MONTH_ID, { where: 'center' });
        },
        menu: (_host: PluginHost, id: string) => storeMenu(id),
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 둘을 contributes.nodeTypes 로 적는다 — 🔴 record 리터럴은 여기(비-뷰)에 산다(구조 검사 ⑯: 뷰엔 소문자 record 금지).
 *   저장소: 폴더 역할(일정·폴더·저장소를 받음)·열 수 있음·우클릭 「새로 만들기」 후보 · 함수는 impl 'store' 로 가리킨다.
 *   일정: record: true — 탐색기에 어떤 경우에도 안 보인다. 저장·휴지통은 일반 노드와 같다(순수 데이터·impl 없음).
 *   🔴 쥔님 11-02 10:34: *"일정 저장소 노드는 하위 가능하고 그때 하위 펼침 그런거 넣는거고 · 하위 레코드 노드는 그냥 품고 있어야지 드러내지 말고"*
 *   📌 impl 의 키('store')는 definePlugin 이 매니페스트 쪽과 묶는다(nodes 의 <'store'> 제네릭 ↔ calendarNodeTypeImpl 의 keyof).
 */
export const calendarNodeTypes: NodeTypeContribution<'store'>[] = [
    {
        type: STORE_TYPE, label: '달력 저장소', icon: 'calendar',
        container: { accepts: [EVENT_TYPE, 'folder', STORE_TYPE] }, openable: true,
        create: { label: '달력 저장소', under: ['folder', STORE_TYPE] },
        impl: 'store',
    },
    { type: EVENT_TYPE, label: '일정', icon: 'calendar', record: true },
];

/**
 * 저장소 우클릭 메뉴(타입이 꽂는 항목) — 탐색기가 메뉴를 그릴 때 부른다.
 *   🔴 부르는 그 순간 이 저장소를 명령 대상으로 잡아 둔다(setMenuTarget) — 명령 둘(calendar.openStore·newEventIn)이 그걸 쓴다.
 *   ⛔ 「새로 만들기」는 createCandidates 가 짠다(저장소는 일정만 받고 일정은 record 라 후보 0) — 여긴 동작만.
 */
export function storeMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '달력에서 열기', icon: 'calendar', commandId: 'calendar.openStore' },
        { label: '새 일정', icon: 'plus', commandId: 'calendar.newEventIn' },
    ];
}

/** 그 저장소에 「오늘 종일」 일정 하나를 만들고, 월 보기가 열 수 있게 담는다(requestOpenCard). 돌려주는 id 가 빈 문자열이면 못 만든 것. */
export function newEventInStore(storeId?: string): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());   // 오늘 자정(지역)
    const id = createEvent(
        { start: isoMinuteOf(start), end: isoMinuteOf(new Date(start.getTime() + DAY_MS)), allDay: true },
        '', storeId,
    );
    if (id) requestOpenCard(id);
    return id;
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

/** 범위 저장소가 살아 있으면(휴지통 아님) 그 id, 아니면 null — 「새 일정」 기본 저장소가 범위를 따라가게(쥔님 2026-11-02). */
function liveScopeStore(): string | null {
    const id = getScope();
    if (!id || !api) return null;
    return storeNodes.some((s) => s.id === id) && !inTrash(id) ? id : null;
}

/**
 * 일정 하나 만들기 — 저장소를 보장하고 그 밑에. 돌려주는 id 가 빈 문자열이면 못 만든 것.
 *   🔴 storeId 를 안 주면(더블클릭·「새 일정」 단추) 범위 저장소(있으면) → 아니면 기본 저장소(지금 규칙) 순으로(쥔님 2026-11-02).
 */
export function createEvent(data: EventData, name = '', storeId?: string): string {
    if (!api) return '';
    const target = storeId ?? liveScopeStore() ?? ensureStore();
    if (!target) return '';
    return api.create(target, { type: EVENT_TYPE, name, data });
}

export function updateEventData(id: string, data: EventData): void { api?.setData(id, data); }
export function renameEvent(id: string, name: string): void { api?.rename(id, name); }
export function moveEvent(id: string, storeId: string): void { api?.move(id, storeId); }
export function removeEvent(id: string): void { api?.remove(id); }
