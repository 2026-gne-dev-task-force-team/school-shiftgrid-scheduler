/**
 * 방 목록 ↔ 노드 시스템 다리 — 🔴 목록도 방도 노드다. 저장·휴지통·복원은 노드 시스템이 한다(달력·people 과 같은 규칙).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *
 * 🔴 방 안에 방은 **노드 부모가 아니라 data 의 parentId 칸**으로 한다(people 과 같이 방은 전부 목록 노드의 납작한 자식).
 *    왜 부모 id 칸인가: 부모를 지워도 자식 노드를 건드릴 필요 없이 「최상위로」가 공짜고(effectiveParentId), 중첩을 노드가 아니라 tree.ts 가 다시 그린다 — 더 단순하다.
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘 등록(rooms.list 컨테이너 · rooms.room record) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + byType 스냅샷(목록·방)을 subscribe 로 갱신 — 뷰가 useSyncExternalStore 로 읽는다
 *   ③ 목록·방 읽기·쓰기(더하기·고치기·휴지통·옮기기·부모 바꾸기·들여/내어쓰기·붙여 넣기) — 전부 NodesApi 로
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님, 구조 검사 ⑱·d·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import type { RoomList, Room, RoomInput, RoomPatch } from './contracts/rooms';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { parsePasted } from './parse';
import { effectiveParentId, wouldCycle } from './tree';
import { setActiveList } from './store';

export const LIST_TYPE = 'rooms.list';
export const ROOM_TYPE = 'rooms.room';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'rooms.' 를 붙인다). 목록을 열면 여는 방 목록 화면.
const SHEET_ID = 'rooms.sheet';

// ── 다리 상태(모듈 전역 — 달력 nodes.ts 와 같은 결) ──
let api: NodesApi | null = null;
let roomNodes: PublicNode[] = [];
let listNodes: PublicNode[] = [];
const subs = new Set<() => void>();

// ── 우클릭 메뉴가 가리킨 목록 — 탐색기가 메뉴를 그릴 때 잡아 둔다(ContextMenu 는 인자를 안 싣는다). ──
let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

/** byType 스냅샷을 다시 뜨고 구독자를 깨운다 — subscribe 변경 때만(매 렌더 아님). */
function recompute(): void {
    roomNodes = api ? api.byType(ROOM_TYPE) : [];
    listNodes = api ? api.byType(LIST_TYPE) : [];
    for (const s of subs) s();
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 D5) — contributes.nodeTypes 의 impl 이름('list')이 가리킨다.
 *   · open — 목록을 열면 「보고 있는 목록」을 그걸로 두고 방 목록 화면을 가운데에.
 *   · menu — 목록 우클릭 「목록에서 열기」(host 는 안 쓴다).
 *   방(record)은 순수 데이터라 impl 이 없다.
 */
export const roomsNodeTypeImpl = {
    list: {
        open: (host: PluginHost, id: string) => {
            setActiveList(id);
            host.workspace.open(SHEET_ID, { where: 'center' });
        },
        menu: (_host: PluginHost, id: string) => listMenu(id),
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 둘을 contributes.nodeTypes 로 적는다 — 🔴 record 리터럴은 여기(비-뷰)에 산다(구조 검사 ⑯: 뷰엔 소문자 record 금지).
 *   목록: 컨테이너(목록·폴더·방을 받음 — 목록 안에 목록 가능)·열 수 있음·우클릭 「새로 만들기」 후보 · 함수는 impl 'list'.
 *   방: record: true — 탐색기에 어떤 경우에도 안 보인다(방 안에 방은 parentId 칸으로 하니 방은 노드로는 중첩 안 한다).
 */
export const roomsNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, label: '방 목록', icon: 'book',
        container: { accepts: [ROOM_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '방 목록', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: ROOM_TYPE, label: '방', icon: 'file', record: true },
];

/**
 * 목록 우클릭 메뉴(타입이 꽂는 항목) — 탐색기가 메뉴를 그릴 때 부른다.
 *   🔴 부르는 그 순간 이 목록을 명령 대상으로 잡아 둔다(setMenuTarget) — 명령(rooms.openList)이 그걸 쓴다.
 *   ⛔ 「새로 만들기 ▸ 방 목록」은 createCandidates 가 짠다(목록이 목록을 받으니 후보가 선다) — 여긴 동작만.
 */
export function listMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '방 목록 열기', icon: 'book', commandId: 'rooms.openList' },
    ];
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다(없으면 조용히 빈 상태). 돌려준 Disposable 은 호스트가 회수. */
export function initRoomsNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구(useSyncExternalStore) — 스냅샷은 recompute 때만 새 배열이 된다 ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getRoomNodes(): PublicNode[] { return roomNodes; }
export function getListNodes(): PublicNode[] { return listNodes; }

/** 조상에 휴지통이 있나 — 🔴 nodes.path 는 휴지통 sentinel 을 안 담으니 부모 사슬을 직접 탄다(달력과 같다). */
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

// ── 목록 읽기 ──
/** 살아 있는 목록 전부(트리 순서). */
export function listsOf(): RoomList[] {
    return listNodes.filter((n) => !inTrash(n.id)).map((n) => ({ id: n.id, name: n.name }));
}

// ── 방 읽기 ──
function toRoom(n: PublicNode): Room {
    const d = (n.data ?? {}) as { memo?: unknown; parentId?: unknown; ext?: unknown };
    const room: Room = {
        id: n.id,
        listId: api?.parent(n.id) ?? '',
        name: n.name,
    };
    if (typeof d.memo === 'string' && d.memo !== '') room.memo = d.memo;
    if (typeof d.parentId === 'string' && d.parentId !== '') room.parentId = d.parentId;
    if (d.ext && typeof d.ext === 'object') room.ext = d.ext as Record<string, unknown>;
    return room;
}

/** 그 목록의 방들(살아 있는 것만, 노드 순서). parentId 는 그대로 싣는다(트리는 tree.ts 가 다시 그린다). */
export function roomsIn(listId: string): Room[] {
    if (!api) return [];
    return api.children(listId)
        .filter((n) => n.type === ROOM_TYPE && !inTrash(n.id))
        .map(toRoom);
}

/** 방 하나. */
export function roomOf(id: string): Room | undefined {
    const n = api?.get(id);
    return n && n.type === ROOM_TYPE ? toRoom(n) : undefined;
}

// ── 방 쓰기(전부 NodesApi 로) ──
/** 목록에 방 하나 더하기(끝에, 최상위). 메모는 data 에 둔다(이름은 노드 name). 돌려준 id 가 빈 문자열이면 못 만든 것. */
export function addRoom(listId: string, input: RoomInput): string {
    if (!api) return '';
    const memo = (input.memo ?? '').trim();
    const data = memo ? { memo } : {};
    return api.create(listId, { type: ROOM_TYPE, name: input.name.trim(), data });
}

/** 방 한 줄을 부분으로 고치기(이름·메모). 빈 patch 는 무변경. parentId·ext 는 안 건드린다. */
export function updateRoom(id: string, patch: RoomPatch): void {
    if (!api) return;
    if (patch.name !== undefined) api.rename(id, patch.name.trim());
    if (patch.memo !== undefined) {
        const cur = (api.get(id)?.data ?? {}) as Record<string, unknown>;
        const memo = patch.memo.trim();
        const next = { ...cur };
        if (memo) next.memo = memo; else delete next.memo;
        api.setData(id, next);
    }
}

/** 방 지우기 — 🔴 휴지통으로(영구 아님). 자식 방의 parentId 는 그대로지만, 부모가 사라지니 effectiveParentId 가 최상위로 올려 준다. */
export function removeRoom(id: string): void { api?.remove(id); }

/** 방을 다른(또는 같은) 목록으로 옮기기 — index 를 주면 그 자리로(순서 바꾸기). */
export function moveRoom(id: string, listId: string, index?: number): void { api?.move(id, listId, index); }

/**
 * 🔴 방 안에 방 — 같은 목록 안의 부모 방을 정한다(null 이면 최상위). parentId 칸에 저장한다.
 *   거절(조용히): 방이 아님 · 부모가 같은 목록의 방이 아님 · 순환(자기 자손을 부모로).
 */
export function setParentRoom(id: string, parentId: string | null): void {
    if (!api) return;
    const node = api.get(id);
    if (!node || node.type !== ROOM_TYPE) return;
    const listId = api.parent(id);
    if (!listId) return;
    if (parentId) {
        const pn = api.get(parentId);
        if (!pn || pn.type !== ROOM_TYPE || api.parent(parentId) !== listId) return;   // 같은 목록의 방만
        if (wouldCycle(roomsIn(listId), id, parentId)) return;                          // 순환 막기
    }
    const cur = (node.data ?? {}) as Record<string, unknown>;
    const next = { ...cur };
    if (parentId) next.parentId = parentId; else delete next.parentId;
    api.setData(id, next);
}

/** 같은 부모 아래 형제들(트리에서 보이는 순서 = 노드 순서). */
function siblingsOf(rooms: Room[], id: string): Room[] {
    const eff = effectiveParentId(rooms, id);
    return rooms.filter((r) => effectiveParentId(rooms, r.id) === eff);
}

/** 같은 형제들 안에서 한 칸 위(-1)·아래(+1)로 — 순서 바꾸기. 끝이면 아무 일 없음. */
export function nudgeRoom(id: string, dir: -1 | 1): void {
    if (!api) return;
    const listId = api.parent(id);
    if (!listId) return;
    const rooms = roomsIn(listId);
    const sibs = siblingsOf(rooms, id);
    const at = sibs.findIndex((r) => r.id === id);
    if (at < 0) return;
    const to = at + dir;
    if (to < 0 || to >= sibs.length) return;
    // 🔴 목표 형제의 「전체 자식 배열」 인덱스로 옮긴다 — move 가 id 를 먼저 빼고 그 자리에 꽂으니, 위·아래 모두 목표의 현재 인덱스면 맞다.
    const fullIds = api.children(listId).map((n) => n.id);
    const tgtIdx = fullIds.indexOf(sibs[to].id);
    if (tgtIdx < 0) return;
    api.move(id, listId, tgtIdx);
}

/** 들여쓰기 — 바로 앞 형제를 부모로(방 안에 방). 맨 앞 형제면 들여쓸 대상이 없어 무시. */
export function indentRoom(id: string): void {
    if (!api) return;
    const listId = api.parent(id);
    if (!listId) return;
    const sibs = siblingsOf(roomsIn(listId), id);
    const at = sibs.findIndex((r) => r.id === id);
    if (at <= 0) return;
    setParentRoom(id, sibs[at - 1].id);
}

/** 내어쓰기 — 부모의 부모로 올린다(최상위면 무시). */
export function outdentRoom(id: string): void {
    if (!api) return;
    const listId = api.parent(id);
    if (!listId) return;
    const rooms = roomsIn(listId);
    const eff = effectiveParentId(rooms, id);
    if (!eff) return;                                  // 이미 최상위
    setParentRoom(id, effectiveParentId(rooms, eff));  // 조부모(없으면 null = 최상위)
}

/**
 * 🔴 여러 줄 붙여 넣기 — 탭·줄바꿈 텍스트를 받아 방 여럿을 만든다(전부 최상위 · 첫 칸 이름·둘째 칸 메모·빈 줄 무시).
 *   파싱은 parse.ts(순수) · 여기선 노드로 만들기만. 돌려주는 건 만들어진 방 id 들.
 */
export function pasteRooms(listId: string, text: string): string[] {
    const rows = parsePasted(text);
    const ids: string[] = [];
    for (const r of rows) {
        const id = addRoom(listId, r);
        if (id) ids.push(id);
    }
    return ids;
}

/** 목록·방 변경 구독(약속 onChange 뒤). */
export function onNodesChange(fn: () => void): Disposable {
    const off = subscribeNodes(fn);
    return { dispose: off };
}
