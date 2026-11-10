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
// 🔴 import type 만 — 약속 타입은 노드 약속(explorer/contracts/nodes)에서(값 아님, 구조 검사 ⑱·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../explorer/contracts/nodes';
import { notifyNodeUndo, type Disposable, type MenuEntry, type PluginHost, type NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { EventData } from './events';
import { isoMinuteOf, nodeIdOf } from './events';
import { eventToStored, storedToEvent, type StoredEvent } from './event-fields';
import type { CollectionKit, DateValue, RecordCellValue, RecordViewApi } from '../collection/contracts/collection';
import { EVENT_CONFIG } from './config';
import { presetOf, listPresets, newPresetStore } from './presets';
import { StoreEmbed } from './views/StoreEmbed';
import { getScope, setScope } from './store';
import type { IcsSeriesItem, IcsWriteEvent } from './ics';
import { eventToIcs, planImport } from './io';

export { STORE_TYPE, EVENT_TYPE } from './config';
import { STORE_TYPE, EVENT_TYPE } from './config';
import { patternOf, skip } from './series';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다). 저장소 open 이 여는 월 보기.
const MONTH_ID = 'calendar.month';

const DAY_MS = 86_400_000;

// ── 다리 상태(모듈 전역 — store.ts·view-registry 와 같은 결) ──
let api: NodesApi | null = null;
let defaultStoreId: string | null = null;
let eventNodes: PublicNode[] = [];
let storeNodes: PublicNode[] = [];
const subs = new Set<() => void>();

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
 *   (explorer.registerContributed)가 host 를 꽂아 NodeTypeDef 로 조립한다.
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
        // 프리셋 저장소는 그 프리셋 아이콘(방 예약 = 문) — 꾸러미를 끄면 기본 달력 아이콘으로 돌아간다
        icon: (node: { id: string }) => presetOf(node.id).icon,
        // 탐색기 「새로 만들기」에 「새 달력 저장소」 바로 뒤로 프리셋마다 한 줄(쥔님 11-10 15:13 「우클릭은 너무 어려워」)
        createVariants: (parentId: string) => listPresets().map((p) => ({ label: p.label, icon: p.icon, run: () => { newPresetStore(p.id, parentId); } })),
        embed: StoreEmbed,
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
        type: STORE_TYPE, body: 'collection', label: '달력 저장소', icon: 'calendar',
        container: { accepts: [EVENT_TYPE, 'folder', STORE_TYPE] }, openable: true,
        create: { label: '달력 저장소', under: ['folder', STORE_TYPE] },
        impl: 'store',
    },
    { type: EVENT_TYPE, label: '일정', icon: 'calendarEvent', record: true },
];

/**
 * 저장소 우클릭 메뉴(타입이 꽂는 항목) — 탐색기가 메뉴를 그릴 때 부른다.
 *   🔴 대상은 항목마다 commandArg.nodeId 로 싣는다(명령이 ctx.nodeId 로 받는다) — 모듈 전역에 잡아 두지 않는다.
 *   ⛔ 「새로 만들기」는 createCandidates 가 짠다(저장소는 일정만 받고 일정은 record 라 후보 0) — 여긴 동작만.
 */
export function storeMenu(nodeId: string): MenuEntry[] {
    const commandArg = { nodeId };
    return [
        { label: '달력에서 열기', icon: 'calendar', commandId: 'calendar.openStore', commandArg },
        { label: presetOf(nodeId).words.newEvent, icon: 'plus', commandId: 'calendar.newEventIn', commandArg },
        { label: 'ICS 가져오기', icon: 'upload', commandId: 'calendar.importIcs', commandArg },
        { label: 'ICS 내보내기', icon: 'download', commandId: 'calendar.exportIcs', commandArg },
        // 등록된 프리셋마다 「새 <label>」 — 이 저장소 옆에 그 프리셋 저장소를 만든다(commandArg.args = 프리셋 id)
        ...listPresets().map((p) => ({ label: `새 ${p.label}`, icon: p.icon, commandId: 'calendar.newPresetStore', commandArg: { nodeId, args: p.id } })),
        ...(kit ? [{ label: '표로 보기', icon: 'table' as const, commandId: 'calendar.openTable', commandArg }] : []),
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

// ── 컬렉션 kit(P4b) — 저장소 = 컬렉션 목록 · 일정 = 레코드. 사용자 칸·「표로 보기」 화면을 컬렉션 바닥이 낸다.
//    🔴 collection 은 supports 라 없을 수 있다 — 없으면 kit null(달력 보기는 그대로 돈다 · 표·사용자 칸만 없다).
//    🔴 꾸러미 사이 값 import 금지(구조 검사 ⑨) — defineCollection 은 host.modules.use('collection') 로 받는다.
let kit: CollectionKit | null = null;
export function getKit(): CollectionKit | null { return kit; }
export function initCalendarKit(rv: RecordViewApi | null, nodes: NodesApi | null): Disposable | null {
    kit = rv ? rv.defineCollection(EVENT_CONFIG) : null;
    return kit?.init(nodes) ?? null;
}
/** 일정의 사용자 칸 하나 쓰기(기본 칸 — 제목·언제·메모 — 는 patchEvent 로). */
export function setEventValue(id: string, key: string, value: RecordCellValue): void { kit?.setValue(id, key, value); }

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구(useSyncExternalStore) — 스냅샷은 recompute 때만 새 배열이 된다(그 사이엔 안정) ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getEventNodes(): PublicNode[] { return eventNodes; }
export function getStoreNodes(): PublicNode[] { return storeNodes; }

/** 휴지통 안인가 — 노드 시스템의 정식 판정(nodes.isTrashed). 부모 사슬을 손으로 타지 않는다. */
export function inTrash(id: string): boolean { return api?.isTrashed(id) ?? false; }

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
    return api.create(target, { type: EVENT_TYPE, name, data: eventToStored(data) });
}

/** 속성 목록이 바꾼 일정 한 건을 쓴다 — 이름과 data 를 한 묶음(되돌리기 한 칸)으로. 사용자 칸 값·uid 는 남긴다. */
export function patchEvent(id: string, f: { name: string; start: string; end: string; allDay: boolean; memo: string }): void {
    if (!api) return;
    const a = api;
    a.batch(() => {
        if (a.get(id)?.name !== f.name) a.rename(id, f.name);
        const cur = (a.get(id)?.data ?? {}) as Partial<StoredEvent>;
        a.setData(id, { ...cur, values: eventToStored(f, cur.values ?? {}).values });
    });
}

// 미리보기 카드가 page-doc 모듈을 빌리려고 host 를 쥔다(onActivate 가 꽂는다).
let hostRef: PluginHost | null = null;
export function setCalendarHost(h: PluginHost | null): void { hostRef = h; }
export function getCalendarHost(): PluginHost | null { return hostRef; }
export function renameEvent(id: string, name: string): void { api?.rename(id, name); }
/** 🔴 id 는 칩 id 도 받는다 — 가상 회차면 규칙 일정(시리즈 전체)을 옮긴다. */
export function moveEvent(id: string, storeId: string): void { api?.move(nodeIdOf(id), storeId); }
/** 일정을 휴지통으로 — 탐색기와 같은 꼴의 「되돌리기」 알림(명령 id + 방금 쌓인 더미 칸 토큰)까지. 반복 일정이면 그 실체 회차들도 같이(되돌리기 한 칸). */
export function removeEvent(chipId: string): void {
    if (!api) return;
    const id = nodeIdOf(chipId);
    const a = api;
    const name = a.get(id)?.name || '제목 없음';
    // 회차(가상 칩 `규칙id@원래시작` 또는 실체 회차)의 휴지통 = 그 회차만 빠뜨리기 — 시리즈 전체는 규칙 일정에서 지운다
    const d = a.get(id)?.data as { seriesId?: string; originalStart?: string } | undefined;
    const seriesId = chipId !== id ? id : !patternOf(d) ? d?.seriesId : undefined;
    const originalStart = chipId !== id ? chipId.slice(id.length + 1) : d?.originalStart;
    if (seriesId && originalStart) {
        const allDay = storedToEvent(a.get(seriesId)?.data)?.allDay ?? false;
        skip({ eventId: chipId !== id ? seriesId : id, seriesId, originalStart, start: originalStart, end: originalStart, allDay, virtual: chipId !== id });
        if (hostRef) notifyNodeUndo(hostRef, api, `「${name}」 회차 하나를 빠뜨렸습니다`, 'calendar.removed');
        return;
    }
    a.batch(() => {
        a.remove(id);
        for (const n of a.liveByType(EVENT_TYPE)) if ((n.data as { seriesId?: string } | undefined)?.seriesId === id) a.remove(n.id);
    });
    if (hostRef) notifyNodeUndo(hostRef, api, `일정 「${name}」을 휴지통으로 옮겼습니다`, 'calendar.removed');
}

/** 휴지통에 직접 놓인 일정들(삭제한 일정) — 일정 노드는 record 라 탐색기 휴지통엔 안 뜨니 달력이 따로 보여 준다. 저장소째 지워진 것은 저장소를 되살리면 돌아온다. */
export function getDeletedEvents(): PublicNode[] {
    if (!api) return [];
    // 휴지통 안이면서 부모가 저장소·폴더가 아닌 것 = 일정 자신이 직접 버려진 것(저장소째면 저장소를 되살린다)
    return eventNodes.filter((n) => {
        if (!api!.isTrashed(n.id)) return false;
        const pid = api!.parent(n.id) ?? '';
        if (api!.parent(pid) === null) return true;   // 부모가 뿌리(= 휴지통 자신, type 이 'folder' 라 아래 검사에 걸린다)면 직접 버려진 것
        const pt = api!.get(pid)?.type;
        return pt !== STORE_TYPE && pt !== 'folder';
    });
}
/** 삭제한 일정을 되살린다 — 기본 저장소로(원래 자리는 이 창구가 못 읽는다). 되살렸으면 true. */
export function restoreEvent(id: string): boolean {
    if (!api) return false;
    const n = api.get(id);
    const deleted = getDeletedEvents();
    if (!n || !deleted.some((e) => e.id === id)) return false;
    const from = getDefaultStore() ?? ensureStore();
    if (!from) return false;
    const a = api;
    // 규칙 일정이면 같이 버린 실체 회차도 함께(되돌리기 한 칸)
    a.batch(() => {
        a.move(id, from);
        for (const e of deleted) if ((e.data as { seriesId?: string } | undefined)?.seriesId === id) a.move(e.id, from);
    });
    return true;
}

// ── 가져오기·내보내기(.ics) — 2·3번. 순수 변환은 io.ts, 여기선 노드를 읽고 쓴다. ──

/** 저장소 이름(없으면 '달력'). 내보내기 파일 이름에 쓴다. */
export function storeName(storeId: string): string {
    return api?.get(storeId)?.name || '달력';
}

/**
 * 일정들(반복은 패턴째)을 저장소에 가져온다 — UID 가 그 저장소에 이미 있으면 건너뛴다(중복). 돌려주는 {created, skipped}.
 *   🔴 index.ts 가 parseIcsSeries 로 읽은 항목을 넘긴다(nodes 는 파서를 모른다 — 노드만 만진다).
 */
export function importItemsToStore(storeId: string, items: readonly IcsSeriesItem[]): { created: number; skipped: number } {
    if (!api) return { created: 0, skipped: 0 };
    const existing = api.children(storeId)
        .filter((n) => n.type === EVENT_TYPE)
        .map((n) => ((n.data ?? {}) as StoredEvent).uid)
        .filter((u): u is string => !!u);
    const { specs, skipped } = planImport(existing, items);
    let created = 0;
    for (const s of specs) {
        const data = eventToStored(s.data);
        if (s.pattern) data.values.when = { ...(data.values.when as DateValue), pattern: s.pattern };
        if (api.create(storeId, { type: EVENT_TYPE, name: s.name, data })) created++;
    }
    return { created, skipped };
}

/**
 * 저장소(+자손 저장소)의 내 일정을 .ics 작성기 입력으로 모은다. storeId 가 null 이면 전체(모든 저장소).
 *   🔴 남의 일정(출처)은 안 담는다 — eventNodes(= 내 일정 노드)만 본다.
 */
export function collectForExport(storeId: string | null): IcsWriteEvent[] {
    if (!api) return [];
    const out: IcsWriteEvent[] = [];
    // 실체 회차는 따로 한 건으로 나가니 규칙 쪽에선 그 자리를 EXDATE 로 뺀다(안 빼면 다른 달력에 두 번 보인다)
    const taken = new Map<string, string[]>();
    for (const n of eventNodes) {
        const d = n.data as { seriesId?: string; originalStart?: string } | undefined;
        if (d?.seriesId && d.originalStart && !inTrash(n.id)) taken.set(d.seriesId, [...(taken.get(d.seriesId) ?? []), d.originalStart]);
    }
    for (const n of eventNodes) {
        if (inTrash(n.id)) continue;
        if (storeId && !api.path(n.id).includes(storeId)) continue;   // 그 저장소 subtree 밖은 건너뜀
        const data = storedToEvent(n.data);
        if (!data) continue;
        const p = patternOf(n.data), tk = taken.get(n.id)?.map((s) => (data.allDay ? s.slice(0, 10) : s));
        out.push(eventToIcs({ id: n.id, name: n.name, data }, p && tk ? { ...p, exdates: [...new Set([...(p.exdates ?? []), ...tk])] } : p));
    }
    return out;
}
