/**
 * 사람 명단 ↔ 노드 시스템 다리 — 🔴 명단도 사람도 노드다. 저장·휴지통·복원은 노드 시스템이 한다(달력과 같은 규칙).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘 등록(people.list 컨테이너 · people.person record) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + byType 스냅샷(명단·사람)을 subscribe 로 갱신 — 뷰가 useSyncExternalStore 로 읽는다
 *   ③ 명단·사람 읽기·쓰기(더하기·고치기·휴지통·옮기기·붙여 넣기) — 전부 NodesApi 로
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님, 구조 검사 ⑱·d·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../explorer/contracts/nodes';
import type { PeopleList, Person, PersonInput, PersonPatch } from './contracts/people';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { uniqueName } from '../../pane-ui-system';
import { parsePasted } from './parse';
import { setActiveList } from './store';

export const LIST_TYPE = 'people.list';
export const PERSON_TYPE = 'people.person';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'people.' 를 붙인다). 명단을 열면 여는 명단 화면.
const SHEET_ID = 'people.sheet';

// ── 다리 상태(모듈 전역 — 달력 nodes.ts 와 같은 결) ──
let api: NodesApi | null = null;
let personNodes: PublicNode[] = [];
let listNodes: PublicNode[] = [];
const subs = new Set<() => void>();

// ── 우클릭 메뉴가 가리킨 명단 — 탐색기가 메뉴를 그릴 때 잡아 둔다(ContextMenu 는 인자를 안 싣는다). ──
let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

/** byType 스냅샷을 다시 뜨고 구독자를 깨운다 — subscribe 변경 때만(매 렌더 아님). */
function recompute(): void {
    personNodes = api ? api.byType(PERSON_TYPE) : [];
    listNodes = api ? api.byType(LIST_TYPE) : [];
    for (const s of subs) s();
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 D5) — contributes.nodeTypes 의 impl 이름('list')이 가리킨다.
 *   · open — 명단을 열면 「보고 있는 명단」을 그걸로 두고 명단 화면을 가운데에.
 *   · menu — 명단 우클릭 「명단에서 열기」(host 는 안 쓴다).
 *   사람(record)은 순수 데이터라 impl 이 없다.
 */
export const peopleNodeTypeImpl = {
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
 *   명단: 컨테이너(명단·폴더·사람을 받음 — 명단 안에 명단 가능)·열 수 있음·우클릭 「새로 만들기」 후보 · 함수는 impl 'list'.
 *   사람: record: true — 탐색기에 어떤 경우에도 안 보인다(저장·휴지통은 일반 노드와 같다).
 */
export const peopleNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, body: 'collection', label: '명단', icon: 'users',
        container: { accepts: [PERSON_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '명단', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: PERSON_TYPE, label: '사람', icon: 'user', record: true },
];

/**
 * 명단 우클릭 메뉴(타입이 꽂는 항목) — 탐색기가 메뉴를 그릴 때 부른다.
 *   🔴 부르는 그 순간 이 명단을 명령 대상으로 잡아 둔다(setMenuTarget) — 명령(people.openList)이 그걸 쓴다.
 *   ⛔ 「새로 만들기 ▸ 명단」은 createCandidates 가 짠다(명단이 명단을 받으니 후보가 선다) — 여긴 동작만.
 */
export function listMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '명단 열기', icon: 'users', commandId: 'people.openList' },
    ];
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다(없으면 조용히 빈 상태). 돌려준 Disposable 은 호스트가 회수. */
export function initPeopleNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구(useSyncExternalStore) — 스냅샷은 recompute 때만 새 배열이 된다 ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getPersonNodes(): PublicNode[] { return personNodes; }
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

// ── 명단 읽기 ──
/** 살아 있는 명단 전부(트리 순서). */
export function listsOf(): PeopleList[] {
    return listNodes.filter((n) => !inTrash(n.id)).map((n) => ({ id: n.id, name: n.name }));
}

/**
 * 시작 화면 「새 명단」 — 탐색기 맨 위(main 루트)에 빈 명단 하나를 만든다. 이름이 겹치면 「명단 2」…
 *   데이터는 비워 둔다(사람은 열고 나서 더한다). 새 id 를 돌려준다(못 만들면 null).
 */
export function createList(): string | null {
    if (!api) return null;
    const name = uniqueName('명단', listNodes.map((n) => n.name));
    return api.create(api.roots.main, { type: LIST_TYPE, name }) || null;
}

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}

// ── 사람 읽기 ──
function toPerson(n: PublicNode): Person {
    const d = (n.data ?? {}) as { memo?: unknown; ext?: unknown };
    const person: Person = {
        id: n.id,
        listId: api?.parent(n.id) ?? '',
        name: n.name,
    };
    if (typeof d.memo === 'string' && d.memo !== '') person.memo = d.memo;
    if (d.ext && typeof d.ext === 'object') person.ext = d.ext as Record<string, unknown>;
    return person;
}

/** 그 명단의 사람들(살아 있는 것만, 트리 순서). */
export function peopleIn(listId: string): Person[] {
    if (!api) return [];
    return api.children(listId)
        .filter((n) => n.type === PERSON_TYPE && !inTrash(n.id))
        .map(toPerson);
}

/** 사람 하나. */
export function personOf(id: string): Person | undefined {
    const n = api?.get(id);
    return n && n.type === PERSON_TYPE ? toPerson(n) : undefined;
}

// ── 사람 쓰기(전부 NodesApi 로) ──
/** 명단에 사람 하나 더하기(끝에). 메모는 data 에 둔다(이름은 노드 name). 돌려준 id 가 빈 문자열이면 못 만든 것. */
export function addPerson(listId: string, input: PersonInput): string {
    if (!api) return '';
    const memo = (input.memo ?? '').trim();
    const data = memo ? { memo } : {};
    return api.create(listId, { type: PERSON_TYPE, name: input.name.trim(), data });
}

/** 사람 한 줄을 부분으로 고치기(이름·메모). 빈 patch 는 무변경. */
export function updatePerson(id: string, patch: PersonPatch): void {
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

/** 사람 지우기 — 🔴 휴지통으로(영구 아님). */
export function removePerson(id: string): void { api?.remove(id); }

/** 사람을 다른(또는 같은) 명단으로 옮기기 — index 를 주면 그 자리로(순서 바꾸기). */
export function movePerson(id: string, listId: string, index?: number): void { api?.move(id, listId, index); }

/** 같은 명단 안에서 한 칸 위(-1)·아래(+1)로 — 순서 바꾸기. 끝이면 아무 일 없음. */
export function nudgePerson(id: string, dir: -1 | 1): void {
    if (!api) return;
    const listId = api.parent(id);
    if (!listId) return;
    const rows = peopleIn(listId);
    const at = rows.findIndex((p) => p.id === id);
    if (at < 0) return;
    const to = at + dir;
    if (to < 0 || to >= rows.length) return;
    movePerson(id, listId, to);
}

/**
 * 🔴 여러 줄 붙여 넣기 — 탭·줄바꿈 텍스트를 받아 사람 여럿을 만든다(첫 칸 이름·둘째 칸 메모·빈 줄 무시).
 *   파싱은 parse.ts(순수) · 여기선 노드로 만들기만. 돌려주는 건 만들어진 사람 id 들.
 */
export function pastePeople(listId: string, text: string): string[] {
    const rows = parsePasted(text);
    const ids: string[] = [];
    for (const r of rows) {
        const id = addPerson(listId, r);
        if (id) ids.push(id);
    }
    return ids;
}

/** 명단·사람 변경 구독(약속 onChange 뒤). */
export function onNodesChange(fn: () => void): Disposable {
    const off = subscribeNodes(fn);
    return { dispose: off };
}

// ── 사용자 열(쥔님 2026-11-09 「사용자 열 추가 가능하게」) — 열 정의는 목록 노드 data.fields, 값은 줄 노드 data.cols[key] ──
//    🔴 ext(위층 플러그인 이름공간)와 따로 둔다 — ext 는 이 꾸러미가 안 건드리는 자리다. 이름·메모는 고정 열이라 여기 안 든다.
/** 그 목록의 사용자 열 정의(레코드 뷰 칸 정의 그대로 — key·label·type…). */
export function listFieldsOf(listId: string): unknown[] {
    const d = (api?.get(listId)?.data ?? {}) as { fields?: unknown };
    return Array.isArray(d.fields) ? d.fields : [];
}
export function setListFields(listId: string, fields: unknown[]): void {
    if (!api) return;
    const cur = (api.get(listId)?.data ?? {}) as Record<string, unknown>;
    api.setData(listId, { ...cur, fields });
}
/** 줄 하나의 사용자 열 값들. */
export function colsOf(id: string): Record<string, unknown> {
    const d = (api?.get(id)?.data ?? {}) as { cols?: unknown };
    return d.cols && typeof d.cols === 'object' ? { ...(d.cols as Record<string, unknown>) } : {};
}
/** 사용자 열 값 하나 쓰기 — 빈 값이면 지운다. 다른 data(메모 등)는 그대로. */
export function setCol(id: string, key: string, value: unknown): void {
    if (!api) return;
    const cur = (api.get(id)?.data ?? {}) as Record<string, unknown>;
    const cols = colsOf(id);
    if (value == null || value === '') delete cols[key]; else cols[key] = value;
    api.setData(id, { ...cur, cols });
}


// ── 줄 문서(노션 줄 열기) — 노드 공통 body 칸(불투명 · 페이지 편집기 page-doc 이 읽고 쓴다) ──
export function bodyOf(id: string): unknown { return api?.get(id)?.body; }
export function setBody(id: string, body: unknown): void { api?.setBody(id, body); }
